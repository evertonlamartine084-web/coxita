import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  HiArrowLeft, HiPaperAirplane, HiPencil, HiPlus, HiSearch, HiPaperClip, HiMicrophone, HiStop,
  HiEmojiHappy, HiLightningBolt, HiReply, HiX, HiBell, HiSparkles, HiUser, HiQrcode, HiChevronDown,
} from 'react-icons/hi'
import toast from 'react-hot-toast'
import { supabase } from '../../services/supabase'
import { aCada } from '../../utils/aCada'
import { mascararTelefone, formatCurrency, faltaReceber } from '../../utils/format'
import { pixCopiaECola } from '../../utils/pix'
import NovoPedidoModal from '../../components/admin/NovoPedidoModal'
import { CardPedidoAberto, FichaDoCliente } from '../../components/admin/AtendimentoCliente'
import { getSettings } from '../../services/settings'

/**
 * Atendimento do WhatsApp dentro do painel, em qualquer aparelho (supabase/zap-atendimento*.sql).
 *
 * As mensagens entram no banco pelo painel do PC da loja, que copia da Evolution a cada ~2,5 s
 * (utils/zapDoGrupo.js, sincronizarMensagens); esta tela escuta o banco em tempo real. Responder
 * daqui grava a mensagem com status 'enviar' (texto, citação, foto, documento ou áudio gravado);
 * quem envia de verdade é o painel do PC da loja (enviarFilaDoAtendimento).
 */

const ROTULO_MIDIA = {
  imagem: '📷 Foto', video: '🎥 Vídeo', audio: '🎤 Áudio', documento: '📄 Documento',
  figurinha: '🙂 Figurinha', contato: '👤 Contato', localizacao: '📍 Localização', outro: 'Mensagem',
}
const PAGINA = 60
const LIMITE_ARQUIVO = 16 * 1024 * 1024
const EMOJIS = '😀 😂 😊 😍 🥰 😘 😉 😎 🤩 🙏 👍 👏 🙌 💪 🤝 👌 ✌️ 🤞 ❤️ 🧡 💛 💚 💙 🔥 ✨ 🎉 🥳 😋 🤤 😅 😢 😮 🤔 🙄 😴 ✅ ❌ ⏰ 🛵 🚚 📍 💰 💳 🧾 📦 🍗 🥟 🌭 🧀 🍕 🥤 🎂'.split(' ')

/** 558488204664 -> (84) 98820-4664. O WhatsApp guarda muito celular sem o 9. */
function telefoneNaTela(t) {
  if (!t) return ''
  let d = String(t).replace(/\D/g, '')
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2)
  if (d.length === 10 && /[6-9]/.test(d[2])) d = `${d.slice(0, 2)}9${d.slice(2)}`
  return d.length === 10 || d.length === 11 ? mascararTelefone(d) : `+${String(t).replace(/\D/g, '')}`
}

// Número escondido (@lid): o WhatsApp não manda nome nem telefone; renomear ou criar pedido resolve.
const nomeDaConversa = (c) => c.nome || (c.telefone ? telefoneNaTela(c.telefone) : 'Número escondido · toque para nomear')

const previaDaLista = (t) => String(t ?? '')
  .replace(/^\[(\w+)\]$/, (_, tipo) => ROTULO_MIDIA[tipo] ?? 'Mensagem')
  .replace(/([*_~])([^*_~\n]+)\1/g, '$2') // sem os símbolos de negrito/itálico, como no WhatsApp

function horario(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function quandoNaLista(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const hoje = new Date()
  const ontem = new Date(); ontem.setDate(hoje.getDate() - 1)
  if (d.toDateString() === hoje.toDateString()) return horario(iso)
  if (d.toDateString() === ontem.toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function rotuloDoDia(iso) {
  const d = new Date(iso)
  const hoje = new Date()
  const ontem = new Date(); ontem.setDate(hoje.getDate() - 1)
  if (d.toDateString() === hoje.toDateString()) return 'Hoje'
  if (d.toDateString() === ontem.toDateString()) return 'Ontem'
  const t = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  return t.charAt(0).toUpperCase() + t.slice(1) // "Domingo, 11 de outubro"
}

/** Formatação do WhatsApp: *negrito*, _itálico_, ~riscado~ e ```monoespaçado```. */
function Formatado({ texto }) {
  const partes = String(texto).split(/(```[^`]+```|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g)
  return partes.map((p, i) => {
    if (/^```[\s\S]+```$/.test(p)) return <code key={i} className="font-mono text-[13px]">{p.slice(3, -3)}</code>
    if (/^\*[^*\n]+\*$/.test(p)) return <strong key={i} className="font-semibold">{p.slice(1, -1)}</strong>
    if (/^_[^_\n]+_$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>
    if (/^~[^~\n]+~$/.test(p)) return <s key={i}>{p.slice(1, -1)}</s>
    return <span key={i}>{p}</span>
  })
}

/** Texto com link clicável e a formatação do WhatsApp. */
function ComLinks({ texto }) {
  const partes = String(texto).split(/(https?:\/\/[^\s]+)/g)
  return partes.map((p, i) => (/^https?:\/\//.test(p)
    ? <a key={i} href={p} target="_blank" rel="noreferrer" className="break-all text-[#027eb5] underline-offset-2 hover:underline">{p}</a>
    : <Formatado key={i} texto={p} />))
}

function Avatar({ c, tamanho = 'h-10 w-10' }) {
  const [falhou, setFalhou] = useState(false)
  if (c.foto_url && !falhou) {
    return <img src={c.foto_url} alt="" onError={() => setFalhou(true)} className={`${tamanho} shrink-0 rounded-full object-cover`} />
  }
  const inicial = (c.nome || '?').trim()[0]?.toUpperCase() ?? '?'
  return <div className={`${tamanho} flex shrink-0 items-center justify-center rounded-full bg-gray-200 font-semibold text-gray-500`}>{inicial}</div>
}

const VELOCIDADES = [1, 1.5, 2]

const tempo = (seg) => {
  if (!Number.isFinite(seg) || seg < 0) return '0:00'
  const t = Math.round(seg)
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

const tamanhoArquivo = (bytes) => {
  if (!bytes) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

/** Player de áudio como o do WhatsApp: play redondo, barra arrastável, duração, 1x/1,5x/2x e a foto. */
function Audio({ url, foto, inicial, deMim }) {
  const ref = useRef(null)
  const [tocando, setTocando] = useState(false)
  const [atual, setAtual] = useState(0)
  const [total, setTotal] = useState(0)
  const [vel, setVel] = useState(1)

  const alternar = () => {
    const a = ref.current
    if (!a) return
    if (a.paused) { a.playbackRate = vel; a.play() } else a.pause()
  }
  const trocarVelocidade = () => {
    const prox = VELOCIDADES[(VELOCIDADES.indexOf(vel) + 1) % VELOCIDADES.length]
    setVel(prox)
    if (ref.current) ref.current.playbackRate = prox
  }
  // áudio gravado no navegador (webm) chega sem duração: pular para o fim força o navegador a medir
  const aoCarregar = (e) => {
    const a = e.currentTarget
    if (Number.isFinite(a.duration)) return setTotal(a.duration)
    a.currentTime = 1e7
    a.ontimeupdate = () => { a.ontimeupdate = null; setTotal(a.duration); a.currentTime = 0 }
  }

  return (
    <div className="flex w-[250px] items-center gap-2.5 py-0.5 sm:w-[280px]">
      <div className="relative shrink-0">
        {foto
          ? <img src={foto} alt="" className="h-11 w-11 rounded-full object-cover" />
          : <div className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold ${deMim ? 'bg-[#25d366]/20 text-green-800' : 'bg-gray-200 text-gray-500'}`}>{inicial}</div>}
        <span className={`absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ${deMim ? 'bg-sky-500 ring-[#d9fdd3]' : 'bg-[#25d366] ring-white'}`}>
          <HiMicrophone className="text-white" size={9} />
        </span>
      </div>
      <button type="button" onClick={alternar} aria-label={tocando ? 'Pausar' : 'Tocar'}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-600 hover:bg-black/5">
        {tocando
          ? <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor"><rect x="1" y="1" width="4" height="14" rx="1" /><rect x="9" y="1" width="4" height="14" rx="1" /></svg>
          : <svg width="16" height="18" viewBox="0 0 16 18" fill="currentColor"><path d="M2 1.8v14.4a1 1 0 0 0 1.5.86l12-7.2a1 1 0 0 0 0-1.72l-12-7.2A1 1 0 0 0 2 1.8z" /></svg>}
      </button>
      <div className="min-w-0 flex-1">
        <input type="range" min="0" max={total || 0} step="0.1" value={atual} aria-label="Posição do áudio"
          onChange={e => { if (ref.current) ref.current.currentTime = Number(e.target.value); setAtual(Number(e.target.value)) }}
          className="block h-1 w-full cursor-pointer appearance-none rounded-full bg-gray-300 accent-[#25d366]" />
        <div className="mt-1.5 flex items-center justify-between text-[11px] leading-none text-gray-500">
          <span>{tempo(tocando || atual ? atual : total)}</span>
          {(tocando || vel !== 1) && (
            <button type="button" onClick={trocarVelocidade} className="rounded-full bg-black/10 px-1.5 py-0.5 font-semibold text-gray-700">
              {String(vel).replace('.', ',')}x
            </button>
          )}
        </div>
      </div>
      <audio ref={ref} src={url} preload="metadata" className="hidden"
        onLoadedMetadata={aoCarregar}
        onTimeUpdate={e => setAtual(e.currentTarget.currentTime)}
        onPlay={() => setTocando(true)} onPause={() => setTocando(false)}
        onEnded={() => { setTocando(false); setAtual(0) }} />
    </div>
  )
}

const CORES_DOCUMENTO = { pdf: 'bg-red-500', doc: 'bg-blue-600', docx: 'bg-blue-600', xls: 'bg-green-600', xlsx: 'bg-green-600', csv: 'bg-green-600', txt: 'bg-gray-500' }

/** Documento como no WhatsApp: ícone pelo tipo, nome, "PDF · 230 kB" e baixar. */
function Documento({ m, url }) {
  const nome = m.midia_nome || 'Documento'
  const ext = (nome.match(/\.(\w{2,5})$/)?.[1] ?? m.midia_tipo?.split('/')[1] ?? 'arq').toLowerCase()
  const detalhe = [ext.toUpperCase(), tamanhoArquivo(m.midia_tamanho)].filter(Boolean).join(' · ')
  return (
    <a href={url} target="_blank" rel="noreferrer" download={nome}
      className="flex w-[250px] items-center gap-3 rounded-lg bg-black/5 p-2.5 no-underline transition-colors hover:bg-black/10 sm:w-[280px]">
      <span className={`flex h-11 w-9 shrink-0 items-end justify-center rounded-md pb-1 text-[9px] font-bold uppercase text-white ${CORES_DOCUMENTO[ext] ?? 'bg-gray-500'}`}>{ext.slice(0, 4)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-gray-900">{nome}</span>
        <span className="block text-xs text-gray-500">{detalhe}</span>
      </span>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-400/60 text-gray-500">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v12m0 0l-5-5m5 5l5-5M5 20h14" /></svg>
      </span>
    </a>
  )
}

/** Localização: cartão com o endereço e "Abrir no mapa" (Google Maps). */
function Localizacao({ m }) {
  const lat = m.dados?.lat
  const lng = m.dados?.lng
  const mapa = Number.isFinite(lat) && Number.isFinite(lng) ? `https://www.google.com/maps?q=${lat},${lng}` : null
  const corpo = (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-50 text-xl">📍</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-gray-900">{m.texto || 'Localização'}</span>
        <span className="block text-xs text-[#027eb5]">{mapa ? 'Abrir no mapa' : 'Localização sem coordenadas'}</span>
      </span>
    </>
  )
  return mapa
    ? <a href={mapa} target="_blank" rel="noreferrer" className="flex w-[250px] items-center gap-3 rounded-lg bg-black/5 p-2.5 no-underline hover:bg-black/10 sm:w-[280px]">{corpo}</a>
    : <div className="flex w-[250px] items-center gap-3 rounded-lg bg-black/5 p-2.5 sm:w-[280px]">{corpo}</div>
}

function Midia({ m, url, aoAmpliar, foto, inicial }) {
  if (m.tipo === 'localizacao') return <Localizacao m={m} />
  if (!url) return null
  if (m.tipo === 'audio') return <Audio url={url} foto={foto} inicial={inicial} deMim={m.de_mim} />
  if (m.tipo === 'figurinha') return <img src={url} alt="Figurinha" className="h-32 w-32 object-contain" />
  if (m.tipo === 'video') return <video controls src={url} className="max-h-72 w-full rounded-md bg-black" />
  if (m.tipo === 'documento') return <Documento m={m} url={url} />
  return (
    <button type="button" onClick={() => aoAmpliar(url)} className="block overflow-hidden rounded-md">
      <img src={url} alt="Foto" className="max-h-80 w-full object-cover" />
    </button>
  )
}

const REACOES = ['👍', '❤️', '😂', '😮', '😢', '🙏']

/** Para onde encaminhar: lista de conversas com busca. */
function EscolherConversa({ conversas, aoEscolher, aoFechar }) {
  const [busca, setBusca] = useState('')
  const termo = busca.trim().toLowerCase()
  const digitos = termo.replace(/\D/g, '')
  const lista = conversas.filter(c => !termo || (c.nome ?? '').toLowerCase().includes(termo) || (digitos && (c.telefone ?? '').includes(digitos))).slice(0, 60)
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={aoFechar}>
      <div className="flex max-h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <p className="font-semibold">Encaminhar para…</p>
          <button type="button" onClick={aoFechar} className="text-gray-500"><HiX /></button>
        </div>
        <input autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder="Pesquisar nome ou telefone" className="border-b border-gray-200 px-4 py-2 text-sm outline-none" />
        <ul className="flex-1 overflow-y-auto">
          {lista.map(c => (
            <li key={c.chave}>
              <button type="button" onClick={() => aoEscolher(c)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-gray-50">
                <Avatar c={c} />
                <span className="truncate">{nomeDaConversa(c)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** Foto em tela cheia: toque fora, no X ou Esc fecha. */
function FotoGrande({ url, aoFechar }) {
  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [aoFechar])
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4" onClick={aoFechar}>
      <img src={url} alt="Foto" className="max-h-full max-w-full object-contain" onClick={e => e.stopPropagation()} />
      <div className="absolute right-4 top-4 flex gap-2">
        <a href={url} target="_blank" rel="noreferrer" download onClick={e => e.stopPropagation()} className="rounded-full bg-white/15 px-3 py-1.5 text-sm text-white no-underline hover:bg-white/25">Baixar</a>
        <button type="button" onClick={aoFechar} className="rounded-full bg-white/15 p-2 text-white hover:bg-white/25" aria-label="Fechar"><HiX size={20} /></button>
      </div>
    </div>
  )
}

/** 🕓 na fila · ✓ enviada · ✓✓ entregue · ✓✓ azul lida · ⚠ falhou */
function Situacao({ m, agora }) {
  if (!m.de_mim) return null
  if (m.status === 'erro') return <span className="text-red-500" title={m.erro ?? ''}>⚠ não enviou</span>
  if (m.status === 'enviar' || m.status === 'enviando') {
    const parada = agora - new Date(m.criada_em) > 90 * 1000
    return <span title="Quem envia é o painel do PC da loja">{parada ? '⏳ esperando o PC da loja' : '🕓'}</span>
  }
  if (m.status_wa === 'lido') return <span className="text-sky-500" title="Lida">✓✓</span>
  if (m.status_wa === 'entregue') return <span title="Entregue">✓✓</span>
  return <span title="Enviada">✓</span>
}

/** Bipe curto de mensagem nova, sem arquivo de som. */
function bipe() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = 880
    g.gain.setValueAtTime(0.15, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
    o.connect(g); g.connect(ctx.destination)
    o.start(); o.stop(ctx.currentTime + 0.25)
  } catch { /* sem áudio */ }
}

// Medidas padrão: ícone de ação 40 px redondo; botão de ação 36 px.
const ICONE = 'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-black/5 hover:text-gray-700 disabled:opacity-40'
const BOTAO = 'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors'

const PAGAMENTOS_DO_PAINEL = ['dinheiro', 'pix', 'credito', 'debito']
// Pix Copia e Cola pronto (utils/pix.js), mas desligado a pedido do dono em 14/10/2026.
const PIX_LIGADO = false

const tipoDoArquivo = (mime) => (mime.startsWith('image/') ? 'imagem'
  : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'documento')

export default function AtendimentoPage() {
  const [conversas, setConversas] = useState(null)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('todas')
  const [aberta, setAberta] = useState(null)
  const [mensagens, setMensagens] = useState([])
  const [temMais, setTemMais] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [pedido, setPedido] = useState(null)
  const [agora, setAgora] = useState(0)
  const [links, setLinks] = useState({}) // midia_path -> link assinado
  const [citando, setCitando] = useState(null)
  const [fotoGrande, setFotoGrande] = useState(null)
  const [reagindo, setReagindo] = useState(null) // id da mensagem com o seletor de reação aberto
  const [menuDe, setMenuDe] = useState(null) // id da mensagem com o menu de ações aberto
  // menus abrem para o lado com espaço: perto do fim da tela, para cima; perto do topo, para baixo
  const [abrirParaCima, setAbrirParaCima] = useState(false)
  const [encaminhando, setEncaminhando] = useState(null) // mensagem sendo encaminhada
  const [painel, setPainel] = useState(null) // 'emojis' | 'rapidas' | null
  const [respostas, setRespostas] = useState([])
  const [gravando, setGravando] = useState(null) // { recorder, stream }
  const [pedidosCliente, setPedidosCliente] = useState(null)
  const [settings, setSettings] = useState({})
  const [mostrarFicha, setMostrarFicha] = useState(false)
  const [avisos, setAvisos] = useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'denied'))
  const fimRef = useRef(null)
  const abertaRef = useRef(null)
  const quantasRef = useRef(PAGINA)
  const conversasRef = useRef([])
  const arquivoRef = useRef(null)
  const caixaRef = useRef(null)
  const rolarRef = useRef(true)
  const areaRef = useRef(null)
  const noFim = () => { const a = areaRef.current; return !a || a.scrollHeight - a.scrollTop - a.clientHeight < 120 }
  // Botão ↓ de descer ao fim, com quantas chegaram enquanto a pessoa lia as antigas
  const [longeDoFim, setLongeDoFim] = useState(false)
  const [novasAbaixo, setNovasAbaixo] = useState(0)
  const descerAoFim = () => {
    areaRef.current?.scrollTo({ top: areaRef.current.scrollHeight, behavior: 'smooth' })
    setNovasAbaixo(0)
  }

  const carregarConversas = useCallback(async () => {
    const { data, error } = await supabase.from('zap_conversas').select('*')
      .order('ultima_em', { ascending: false, nullsFirst: false }).limit(200)
    if (!error) { setConversas(data); conversasRef.current = data }
  }, [])

  const assinar = useCallback((lista) => {
    const caminhos = lista.map(m => m.midia_path).filter(Boolean)
    if (!caminhos.length) return
    setLinks(atuais => {
      const novos = caminhos.filter(p => !atuais[p])
      if (novos.length) {
        supabase.storage.from('zap-midia').createSignedUrls(novos, 3600).then(({ data: assinados }) => {
          if (assinados?.length) setLinks(a => ({ ...a, ...Object.fromEntries(assinados.filter(x => x.signedUrl).map(x => [x.path, x.signedUrl])) }))
        })
      }
      return atuais
    })
  }, [])

  const carregarMensagens = useCallback(async () => {
    const chave = abertaRef.current
    if (!chave) return
    const { data, error } = await supabase.from('zap_mensagens').select('*')
      .eq('conversa', chave).order('criada_em', { ascending: false }).limit(quantasRef.current)
    if (error || abertaRef.current !== chave) return
    setMensagens(data.reverse())
    setTemMais(data.length >= quantasRef.current)
    setAgora(Date.now())
    assinar(data)
  }, [assinar])

  const carregarAnteriores = async () => {
    rolarRef.current = false
    quantasRef.current += PAGINA
    await carregarMensagens()
  }

  // Pedidos do cliente da conversa aberta (ficha e card do pedido em aberto)
  const telefoneAbertoRef = useRef(null)
  const carregarPedidos = useCallback(async () => {
    const tel = telefoneAbertoRef.current
    if (!tel) { setPedidosCliente([]); return }
    const { data, error } = await supabase.rpc('pedidos_do_telefone', { p_telefone: tel })
    if (!error && telefoneAbertoRef.current === tel) setPedidosCliente(data ?? [])
  }, [])

  const carregarRespostas = useCallback(async () => {
    const { data } = await supabase.from('zap_respostas_rapidas').select('*').order('titulo')
    setRespostas(data ?? [])
  }, [])

  useEffect(() => {
    Promise.resolve().then(() => { carregarConversas(); carregarRespostas() })
    getSettings().then(setSettings).catch(() => {})
    return aCada(carregarConversas, 20000)
  }, [carregarConversas, carregarRespostas])

  // Tempo real: o banco avisa a tela de cada mensagem nova ou mudança (✓✓, enviada).
  useEffect(() => {
    let espera = null
    const recarregarLista = () => { clearTimeout(espera); espera = setTimeout(carregarConversas, 300) }
    const canal = supabase.channel('atendimento-zap')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zap_mensagens' }, (p) => {
        const m = p.new ?? {}
        if (m.conversa && m.conversa === abertaRef.current) {
          if (noFim()) rolarRef.current = true
          else if (p.eventType === 'INSERT' && m.de_mim === false) setNovasAbaixo(n => n + 1)
          carregarMensagens()
        }
        recarregarLista()
        if (p.eventType === 'INSERT' && m.de_mim === false && (m.conversa !== abertaRef.current || document.hidden)) {
          bipe()
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            const c = conversasRef.current.find(x => x.chave === m.conversa)
            new Notification(c ? nomeDaConversa(c) : 'Mensagem nova no Zap', {
              body: m.tipo === 'texto' ? (m.texto ?? '') : (ROTULO_MIDIA[m.tipo] ?? 'Mensagem'), icon: '/painel-192.png', tag: m.conversa,
            })
          }
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zap_conversas' }, recarregarLista)
      .subscribe()
    return () => { clearTimeout(espera); supabase.removeChannel(canal) }
  }, [carregarConversas, carregarMensagens])

  const abrir = (chave) => {
    abertaRef.current = chave
    quantasRef.current = PAGINA
    setNovasAbaixo(0)
    setLongeDoFim(false)
    rolarRef.current = true
    setMensagens([])
    setCitando(null)
    setPainel(null)
    setAberta(chave)
  }

  useEffect(() => {
    if (!aberta) return
    supabase.from('zap_conversas').update({ nao_lidas: 0 }).eq('chave', aberta).then(() => carregarConversas())
    Promise.resolve().then(carregarMensagens)
    return aCada(carregarMensagens, 10000) // reserva, se o tempo real cair
  }, [aberta, carregarMensagens, carregarConversas])

  // conversa aberta com mensagem nova: já conta como lida
  useEffect(() => {
    const ultima = mensagens[mensagens.length - 1]
    if (aberta && ultima && !ultima.de_mim && !document.hidden) {
      const c = conversasRef.current.find(x => x.chave === aberta)
      if (c?.nao_lidas) supabase.from('zap_conversas').update({ nao_lidas: 0 }).eq('chave', aberta).then(() => {})
    }
    // Como no WhatsApp: rola para o fim ao abrir, ao enviar e quando chega mensagem com a pessoa já
    // no fim. Quem está lendo mensagens antigas não é puxado para baixo pela atualização.
    if (rolarRef.current) {
      fimRef.current?.scrollIntoView({ block: 'end' })
      rolarRef.current = false
    }
  }, [mensagens, aberta])

  const conversa = conversas?.find(c => c.chave === aberta) ?? null
  const telefoneDaConversa = conversa?.telefone ?? null
  useEffect(() => {
    telefoneAbertoRef.current = telefoneDaConversa
    Promise.resolve().then(() => { setPedidosCliente(null); carregarPedidos() })
    if (!telefoneDaConversa) return
    return aCada(carregarPedidos, 20000)
  }, [telefoneDaConversa, carregarPedidos])
  const pedidoAberto = (pedidosCliente ?? []).find(p => !['entregue', 'cancelado'].includes(p.status)) ?? null

  const repetirPedido = (p) => {
    setPedido({
      customer_name: p.customer_name ?? conversa?.nome ?? '',
      customer_phone: conversa?.telefone ? telefoneNaTela(conversa.telefone) : (p.customer_phone ?? ''),
      canal: 'whatsapp',
      delivery_type: p.delivery_type ?? 'retirada',
      payment_method: p.payment_method && PAGAMENTOS_DO_PAINEL.includes(p.payment_method) ? p.payment_method : 'dinheiro',
      address: p.address ?? '', address_number: p.address_number ?? '', neighborhood: p.neighborhood ?? '', address_cep: p.address_cep ?? '',
      itens: (p.itens ?? []).map(it => ({
        produto_id: it.product_id, nome: it.product_name, quantidade: it.quantity,
        sabores: (it.flavors ?? []).map(f => ({ id: f.flavor_id, name: f.flavor_name, quantity: f.quantity })),
      })),
      duvidas: [`Repetindo o pedido #${p.order_number} de ${new Date(p.created_at).toLocaleDateString('pt-BR')}. Confira horário, endereço, taxa e pagamento.`],
    })
  }
  const naoLidas = (conversas ?? []).filter(c => c.nao_lidas > 0).length
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const digitos = termo.replace(/\D/g, '')
    return (conversas ?? []).filter(c => (filtro !== 'naoLidas' || c.nao_lidas > 0) && (!termo
      || (c.nome ?? '').toLowerCase().includes(termo)
      || (digitos && (c.telefone ?? '').includes(digitos))))
  }, [conversas, busca, filtro])

  const enfileirar = async (linha) => {
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('zap_mensagens').insert({
      conversa: aberta, de_mim: true, status: 'enviar', enviada_por: user?.email ?? null,
      responde_a: citando?.wa_id ?? null,
      responde_texto: citando ? (citando.texto ?? `[${citando.tipo}]`).slice(0, 200) : null,
      ...linha,
    })
    if (error) throw error
    setCitando(null)
    rolarRef.current = true
    carregarMensagens()
  }

  const enviar = async (e) => {
    e?.preventDefault()
    const corpo = texto.trim()
    if (!corpo || !aberta) return
    setEnviando(true)
    try {
      await enfileirar({ texto: corpo, tipo: 'texto' })
      setTexto('')
      setPainel(null)
    } catch {
      toast.error('Não consegui mandar. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  const subirArquivo = async (arquivo, tipoForcado) => {
    if (!arquivo || !aberta) return
    if (arquivo.size > LIMITE_ARQUIVO) return toast.error('Arquivo grande demais (máximo 16 MB).')
    setEnviando(true)
    try {
      const mime = (arquivo.type || 'application/octet-stream').split(';')[0]
      const nome = (arquivo.name || 'arquivo').replace(/[^\w.-]/g, '_')
      const caminho = `${aberta.replace(/[^\w]/g, '_')}/enviado-${Date.now()}-${nome}`
      const { error } = await supabase.storage.from('zap-midia').upload(caminho, arquivo, { contentType: mime })
      if (error) throw error
      await enfileirar({
        tipo: tipoForcado ?? tipoDoArquivo(mime), midia_path: caminho, midia_tipo: mime,
        midia_nome: arquivo.name || null, midia_tamanho: arquivo.size || null, texto: texto.trim() || null,
      })
      setTexto('')
    } catch {
      toast.error('Não consegui mandar o arquivo.')
    } finally {
      setEnviando(false)
      if (arquivoRef.current) arquivoRef.current.value = ''
    }
  }

  const gravar = async () => {
    if (gravando) {
      gravando.recorder.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const formato = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm'].find(f => MediaRecorder.isTypeSupported?.(f)) ?? ''
      const recorder = new MediaRecorder(stream, formato ? { mimeType: formato } : undefined)
      const pedacos = []
      recorder.ondataavailable = (ev) => { if (ev.data.size) pedacos.push(ev.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        setGravando(null)
        const mime = (recorder.mimeType || 'audio/webm').split(';')[0]
        const blob = new Blob(pedacos, { type: mime })
        if (blob.size < 1500) return toast('Áudio curto demais.')
        subirArquivo(new File([blob], `audio.${mime.includes('ogg') ? 'ogg' : 'webm'}`, { type: mime }), 'audio')
      }
      recorder.start()
      setGravando({ recorder, stream })
    } catch {
      toast.error('Não consegui usar o microfone. Permita o microfone no navegador.')
    }
  }

  const cancelarGravacao = () => {
    if (!gravando) return
    gravando.recorder.onstop = () => { gravando.stream.getTracks().forEach(t => t.stop()); setGravando(null) }
    gravando.recorder.stop()
  }

  const novaResposta = async () => {
    const titulo = window.prompt('Nome da resposta rápida (ex.: Pix, Cardápio, Endereço):')
    if (!titulo?.trim()) return
    const corpo = window.prompt('Texto da mensagem:', texto)
    if (!corpo?.trim()) return
    const { error } = await supabase.from('zap_respostas_rapidas').insert({ titulo: titulo.trim(), texto: corpo.trim() })
    if (error) return toast.error('Não consegui salvar.')
    carregarRespostas()
  }

  const apagarResposta = async (r) => {
    if (!window.confirm(`Apagar a resposta "${r.titulo}"?`)) return
    await supabase.from('zap_respostas_rapidas').delete().eq('id', r.id)
    carregarRespostas()
  }

  const novaConversa = async () => {
    const entrada = window.prompt('Telefone com DDD (ex.: 84 99999-9999):')
    if (!entrada) return
    let d = entrada.replace(/\D/g, '')
    if (d.length === 10 || d.length === 11) d = `55${d}`
    if (!/^55\d{10,11}$/.test(d)) return toast.error('Telefone inválido.')
    const semNove = d.length === 13 ? d.slice(0, 4) + d.slice(5) : d
    const existente = conversasRef.current.find(c => c.telefone && (c.telefone === d || c.telefone === semNove))
    if (existente) return abrir(existente.chave)
    const { error } = await supabase.from('zap_conversas').insert({ chave: d, jid: `${d}@s.whatsapp.net`, telefone: d })
    if (error) return toast.error('Não consegui abrir a conversa.')
    await carregarConversas()
    abrir(d)
  }

  // Nome digitado aqui fica: a cópia da Evolution só preenche conversa sem nome.
  const renomear = async () => {
    if (!conversa) return
    const nome = window.prompt('Nome desta conversa:', conversa.nome ?? '')
    if (nome === null) return
    const { error } = await supabase.from('zap_conversas').update({ nome: nome.trim() || null, nome_origem: nome.trim() ? 'manual' : null }).eq('chave', conversa.chave)
    if (error) return toast.error('Não consegui renomear.')
    carregarConversas()
  }

  const abrirPedido = () => {
    if (!conversa) return
    setPedido({
      customer_name: conversa.nome ?? '',
      customer_phone: conversa.telefone ? telefoneNaTela(conversa.telefone) : '',
      canal: 'whatsapp',
    })
  }

  // ✨ A IA lê a conversa e devolve o pedido montado (supabase/functions/montar-pedido); a pessoa
  // confere tudo no NovoPedidoModal antes de criar.
  const [montandoIA, setMontandoIA] = useState(false)
  const montarComIA = async () => {
    if (!conversa) return
    setMontandoIA(true)
    try {
      const { data, error } = await supabase.functions.invoke('montar-pedido', { body: { conversa: conversa.chave } })
      if (error) {
        const corpo = await error.context?.json?.().catch(() => null)
        const motivo = corpo?.erro
        throw new Error(motivo === 'sem_chave' || motivo === 'chave_invalida' ? 'A IA ainda não está ligada (falta a chave da Anthropic).'
          : motivo === 'sem_mensagens' ? 'Não há mensagens recentes nesta conversa.'
            : motivo === 'ocupado' ? 'A IA está ocupada, tente de novo em alguns segundos.' : 'Não consegui montar o pedido.')
      }
      const p = data.pedido
      const e = p.endereco ?? {}
      const quandoOk = p.data && p.hora
      setPedido({
        customer_name: p.nome_cliente || conversa.nome || '',
        customer_phone: conversa.telefone ? telefoneNaTela(conversa.telefone) : '',
        canal: 'whatsapp',
        ...(p.tipo_entrega === 'entrega' || p.tipo_entrega === 'retirada' ? { delivery_type: p.tipo_entrega } : {}),
        ...(p.pagamento && p.pagamento !== 'nao_informado' ? { payment_method: p.pagamento } : {}),
        address: e.rua ?? '', address_number: e.numero ?? '', neighborhood: e.bairro ?? '', address_cep: e.cep ?? '',
        notes: [p.observacoes, e.complemento && `Compl.: ${e.complemento}`, p.troco_para && `Troco para R$ ${p.troco_para}`].filter(Boolean).join(' · '),
        ...(quandoOk ? { agendado: true, scheduled_date: p.data, scheduled_time: p.hora } : {}),
        itens: p.itens ?? [],
        duvidas: p.duvidas ?? [],
      })
    } catch (err) {
      toast.error(err.message)
    } finally {
      setMontandoIA(false)
    }
  }

  // Pix Copia e Cola com o valor dentro: duas mensagens, a segunda só com o código, para o
  // cliente segurar o dedo e copiar.
  const cobrarPix = async (valor, pedidoRef = null) => {
    if (!settings.pix_key) return toast.error('Cadastre a chave Pix em Configurações primeiro.')
    if (!(valor > 0)) return toast.error('Valor inválido.')
    if (!window.confirm(`Mandar o Pix Copia e Cola de ${formatCurrency(valor)} para ${nomeDaConversa(conversa)}?`)) return
    const codigo = pixCopiaECola({
      chave: settings.pix_key, nome: settings.pix_name || settings.store_name || 'Coxelli', cidade: 'Natal',
      valor, identificador: pedidoRef?.codigo_cliente || pedidoRef?.order_number || '***',
    })
    const nome = String(pedidoRef?.customer_name ?? conversa?.nome ?? '').trim().split(/\s+/)[0]
    try {
      setCitando(null)
      await enfileirar({ tipo: 'texto', texto: `Oi${nome ? `, ${nome}` : ''}! O ${pedidoRef ? `seu pedido${pedidoRef.codigo_cliente ? ` *${pedidoRef.codigo_cliente}*` : ''} ficou` : 'valor ficou'} em *${formatCurrency(valor)}*.\n\nCopie o código abaixo e cole no app do seu banco, em *Pix Copia e Cola*. O valor já vai preenchido 🧡` })
      await enfileirar({ tipo: 'texto', texto: codigo })
    } catch {
      toast.error('Não consegui mandar o Pix.')
    }
  }

  const pixAvulso = () => {
    const sugestao = pedidoAberto ? String(faltaReceber(pedidoAberto)).replace('.', ',') : ''
    const entrada = window.prompt('Valor do Pix (R$):', sugestao)
    if (entrada === null) return
    const valor = Number(String(entrada).replace(/[^\d,.]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.'))
    cobrarPix(valor, pedidoAberto && Math.abs(valor - faltaReceber(pedidoAberto)) < 0.01 ? pedidoAberto : null)
  }

  // Reação: grava como pendente; o PC da loja manda pela Evolution. Tocar na mesma tira.
  // O menu abre junto da setinha (topo do balão) e vai para o lado onde cabe: mede o espaço livre
  // abaixo da setinha e acima do balão na área das mensagens. Balão alto não empurra o menu para fora.
  const ALTURA_MENU = 210
  const paraCima = (el) => {
    const a = areaRef.current?.getBoundingClientRect()
    const linha = (el.closest('.group\\/linha') ?? el).getBoundingClientRect()
    if (!a) return false
    const abaixo = a.bottom - (linha.top + 32)
    const acima = linha.top - a.top
    return abaixo < ALTURA_MENU && acima > abaixo
  }

  const reagir = async (m, emoji) => {
    setReagindo(null)
    const tirar = m.reacoes?.loja === emoji
    const { error } = await supabase.from('zap_mensagens').update({ reacao_pendente: tirar ? '-' : emoji }).eq('id', m.id)
    if (error) toast.error('Não consegui reagir.')
    else carregarMensagens()
  }

  // Ações da mensagem, como no WhatsApp. Apagar e editar só valem para mensagem da loja e
  // dentro do prazo do WhatsApp (~2 dias para apagar, 15 min para editar); quem executa é o PC da loja.
  const podeEditar = (m) => m.de_mim && m.wa_id && m.tipo === 'texto' && !m.apagada && agora - new Date(m.criada_em) < 15 * 60 * 1000
  const podeApagar = (m) => m.de_mim && m.wa_id && !m.apagada && agora - new Date(m.criada_em) < 48 * 60 * 60 * 1000

  const copiar = async (m) => {
    setMenuDe(null)
    try { await navigator.clipboard.writeText(m.texto ?? ''); toast.success('Copiado.') } catch { toast.error('Não consegui copiar.') }
  }

  const editarMensagem = async (m) => {
    setMenuDe(null)
    const novo = window.prompt('Editar mensagem:', m.texto ?? '')
    if (novo === null || !novo.trim() || novo.trim() === m.texto) return
    const { error } = await supabase.from('zap_mensagens').update({ acao_pendente: { tipo: 'editar', texto: novo.trim() }, erro: null }).eq('id', m.id)
    if (error) toast.error('Não consegui editar.')
    else carregarMensagens()
  }

  const apagarMensagem = async (m) => {
    setMenuDe(null)
    if (!window.confirm('Apagar esta mensagem para todos? O cliente vai ver "Mensagem apagada".')) return
    const { error } = await supabase.from('zap_mensagens').update({ acao_pendente: { tipo: 'apagar' }, erro: null }).eq('id', m.id)
    if (error) toast.error('Não consegui apagar.')
    else carregarMensagens()
  }

  const encaminharPara = async (destino) => {
    const m = encaminhando
    setEncaminhando(null)
    if (!m || !destino) return
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('zap_mensagens').insert({
      conversa: destino.chave, de_mim: true, status: 'enviar', enviada_por: user?.email ?? null,
      tipo: m.midia_path ? m.tipo : 'texto', texto: m.texto,
      midia_path: m.midia_path ?? null, midia_tipo: m.midia_tipo ?? null, midia_nome: m.midia_nome ?? null,
    })
    if (error) return toast.error('Não consegui encaminhar.')
    toast.success(`Encaminhada para ${nomeDaConversa(destino)}.`)
  }

  const ativarAvisos = async () => {
    if (typeof Notification === 'undefined') return
    setAvisos(await Notification.requestPermission())
  }

  const respostasFiltradas = texto.startsWith('/')
    ? respostas.filter(r => r.titulo.toLowerCase().includes(texto.slice(1).toLowerCase()))
    : respostas

  if (conversas === null) {
    return <div className="flex flex-1 items-center justify-center text-sm text-gray-500">Carregando conversas…</div>
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 overflow-hidden bg-white lg:rounded-xl lg:border lg:border-gray-200 lg:shadow-sm">
        {/* Lista de conversas */}
        <aside className={`${aberta ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-r border-gray-200 md:w-[320px] lg:w-[340px] 2xl:w-[380px]`}>
          <header className="flex h-16 shrink-0 items-center justify-between bg-[#f0f2f5] px-4">
            <h2 className="font-sans text-lg font-semibold text-gray-900">Conversas</h2>
            <div className="flex items-center gap-1">
              {avisos === 'default' && (
                <button onClick={ativarAvisos} title="Avisar mensagem nova" aria-label="Avisar mensagem nova" className={ICONE}><HiBell size={20} /></button>
              )}
              <button onClick={novaConversa} title="Nova conversa" aria-label="Nova conversa" className={ICONE}><HiPlus size={20} /></button>
            </div>
          </header>
          <div className="shrink-0 space-y-2 border-b border-gray-200 px-3 py-2">
            <label className="flex h-9 items-center gap-2 rounded-lg bg-[#f0f2f5] px-3 focus-within:ring-2 focus-within:ring-green-600/30">
              <HiSearch className="shrink-0 text-gray-500" size={16} />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Pesquisar nome ou telefone" aria-label="Pesquisar" className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-500" />
            </label>
            <div className="flex gap-2">
              {[['todas', 'Todas'], ['naoLidas', `Não lidas${naoLidas ? ` · ${naoLidas}` : ''}`]].map(([id, rotulo]) => (
                <button key={id} onClick={() => setFiltro(id)} aria-pressed={filtro === id}
                  className={`h-7 rounded-full px-3 text-[13px] transition-colors ${filtro === id ? 'bg-green-100 font-semibold text-green-800' : 'bg-[#f0f2f5] text-gray-600 hover:bg-gray-200'}`}>
                  {rotulo}
                </button>
              ))}
            </div>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {visiveis.length === 0 && (
              <li className="px-6 py-10 text-center text-sm text-gray-500">
                {conversas.length === 0 ? 'As conversas aparecem aqui assim que o painel do PC da loja ligar o atendimento.'
                  : filtro === 'naoLidas' ? 'Nenhuma conversa não lida.' : 'Nenhuma conversa com esse nome ou telefone.'}
              </li>
            )}
            {visiveis.map(c => (
              <li key={c.chave}>
                <button onClick={() => abrir(c.chave)} aria-current={aberta === c.chave ? 'true' : undefined}
                  className={`flex h-[72px] w-full items-center gap-3 px-3 text-left transition-colors ${aberta === c.chave ? 'bg-[#f0f2f5]' : 'hover:bg-gray-50'}`}>
                  <Avatar c={c} tamanho="h-12 w-12" />
                  <div className="flex h-full min-w-0 flex-1 flex-col justify-center border-b border-gray-100">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-[15px] leading-5 ${c.nao_lidas ? 'font-semibold text-gray-900' : 'text-gray-900'}`}>{nomeDaConversa(c)}</span>
                      <span className={`shrink-0 text-xs leading-5 ${c.nao_lidas ? 'font-semibold text-green-600' : 'text-gray-500'}`}>{quandoNaLista(c.ultima_em)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] leading-5 text-gray-500">{c.ultima_de_mim && 'Você: '}{previaDaLista(c.ultima_msg)}</span>
                      {c.nao_lidas > 0 && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-green-500 px-1.5 text-[11px] font-bold text-white">{c.nao_lidas}</span>}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Conversa aberta */}
        <section className={`${aberta ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
          {!conversa ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-[#f0f2f5] p-6 text-center">
              <p className="text-base font-semibold text-gray-700">Atendimento Coxelli</p>
              <p className="max-w-xs text-sm text-gray-500">Escolha uma conversa na lista, ou comece uma nova no +.</p>
            </div>
          ) : (
            <>
              <header className="@container flex h-16 shrink-0 items-center gap-2 border-b border-gray-200 bg-[#f0f2f5] px-2 sm:gap-3 sm:px-4">
                <button onClick={() => { abertaRef.current = null; setAberta(null) }} className={`${ICONE} md:hidden`} aria-label="Voltar"><HiArrowLeft size={20} /></button>
                <Avatar c={conversa} />
                <button onClick={renomear} title="Renomear" className="group/nome min-w-0 flex-1 text-left">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[15px] font-semibold leading-5 text-gray-900">{nomeDaConversa(conversa)}</span>
                    <HiPencil className="shrink-0 text-gray-400 opacity-0 transition-opacity group-hover/nome:opacity-100" size={13} />
                  </span>
                  {conversa.telefone && conversa.nome && (
                    <span className="block truncate whitespace-nowrap text-xs leading-4 text-gray-500">{telefoneNaTela(conversa.telefone)}</span>
                  )}
                </button>
                <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                  <button onClick={() => setMostrarFicha(v => !v)} title="Ficha do cliente" aria-label="Ficha do cliente" aria-pressed={mostrarFicha}
                    className={`${ICONE} min-[1380px]:hidden ${mostrarFicha ? 'bg-gray-200 text-gray-800' : ''}`}><HiUser size={20} /></button>
                  <button onClick={montarComIA} disabled={montandoIA} title="A IA lê a conversa e monta o pedido para você conferir"
                    className={`${BOTAO} w-9 border border-primary/40 bg-white text-primary hover:bg-primary/5 disabled:opacity-60 @[30rem]:w-auto @[30rem]:px-3`}>
                    <HiSparkles className={montandoIA ? 'animate-pulse' : ''} size={16} />
                    <span className="hidden @[30rem]:inline">{montandoIA ? 'Lendo…' : 'Montar pedido'}</span>
                  </button>
                  <button onClick={abrirPedido} title="Criar pedido"
                    className={`${BOTAO} w-9 bg-primary text-white hover:bg-primary/90 @[30rem]:w-auto @[30rem]:px-3`}>
                    <HiPlus size={16} />
                    <span className="hidden @[30rem]:inline">Pedido</span>
                  </button>
                </div>
              </header>

              <CardPedidoAberto
                pedido={pedidoAberto}
                aoCobrar={PIX_LIGADO ? (p) => cobrarPix(faltaReceber(p), p) : null}
                aoMudar={carregarPedidos}
              />
              <div className="relative flex min-h-0 flex-1">
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="relative flex min-h-0 flex-1 flex-col">
                  <div ref={areaRef}
                    onScroll={() => { const longe = !noFim(); setLongeDoFim(longe); if (!longe) setNovasAbaixo(0) }}
                    className="min-h-0 flex-1 overflow-y-auto bg-[#efeae2] px-3 py-3 sm:px-6 xl:px-12" onClick={() => { if (menuDe) setMenuDe(null) }}>
                    {temMais && (
                      <div className="mb-3 text-center">
                        <button onClick={carregarAnteriores} className="h-7 rounded-full bg-white/95 px-3 text-xs text-gray-600 shadow-sm hover:bg-white">Carregar mensagens anteriores</button>
                      </div>
                    )}
                    {mensagens.length === 0 && (
                      <p className="mx-auto mt-4 w-fit rounded-lg bg-[#fff5c4] px-3 py-1.5 text-center text-xs text-gray-700 shadow-sm">Nenhuma mensagem ainda nesta conversa.</p>
                    )}
                    {mensagens.map((m, i) => {
                      const novoDia = i === 0 || new Date(mensagens[i - 1].criada_em).toDateString() !== new Date(m.criada_em).toDateString()
                      // sequência do mesmo lado: balões mais juntos, e só o primeiro tem a "ponta"
                      const continua = !novoDia && i > 0 && mensagens[i - 1].de_mim === m.de_mim
                      const temMidia = !!(m.midia_path && links[m.midia_path])
                      const legenda = m.tipo === 'localizacao' || (m.tipo === 'documento' && temMidia && m.texto === m.midia_nome) ? null
                    : m.tipo === 'texto' || temMidia ? m.texto : `${ROTULO_MIDIA[m.tipo] ?? 'Mensagem'}${m.texto ? ` · ${m.texto}` : ''}`
                      const acoes = [
                        m.wa_id && !m.apagada && { rotulo: 'Responder', fazer: () => { setMenuDe(null); setCitando(m); caixaRef.current?.focus() } },
                        m.wa_id && !m.apagada && { rotulo: 'Reagir', fazer: () => { setMenuDe(null); setReagindo(m.id) } },
                        m.texto && !m.apagada && { rotulo: 'Copiar', fazer: () => copiar(m) },
                        !m.apagada && (m.texto || m.midia_path) && { rotulo: 'Encaminhar', fazer: () => { setMenuDe(null); setEncaminhando(m) } },
                        podeEditar(m) && { rotulo: 'Editar', fazer: () => editarMensagem(m) },
                        podeApagar(m) && { rotulo: 'Apagar para todos', fazer: () => apagarMensagem(m), perigo: true },
                      ].filter(Boolean)
                      const reacoes = Object.entries(m.reacoes ?? {}).filter(([, e]) => e)
                      const pendente = m.reacao_pendente && m.reacao_pendente !== '-' ? m.reacao_pendente : null
                      return (
                        <div key={m.id}>
                          {novoDia && (
                            <div className="sticky top-0 z-10 my-3 text-center first:mt-0">
                              <span className="inline-block rounded-lg bg-white/95 px-3 py-1 text-xs text-gray-600 shadow-sm">{rotuloDoDia(m.criada_em)}</span>
                            </div>
                          )}
                          <div className={`group/linha relative flex items-start gap-1.5 ${m.de_mim ? 'justify-end' : 'justify-start'} ${continua ? 'mt-0.5' : 'mt-2'} ${reacoes.length || pendente ? 'mb-3' : ''}`}>
                            <div
                              onClick={(e) => {
                                // tela de toque: como no WhatsApp do celular, tocar na mensagem abre o menu
                                if (!acoes.length || !window.matchMedia('(hover: none)').matches || e.target.closest('a, button, audio, video')) return
                                e.stopPropagation()
                                setAbrirParaCima(paraCima(e.currentTarget))
                                setMenuDe(d => (d === m.id ? null : m.id))
                              }}
                              className={`relative max-w-[85%] rounded-lg px-2.5 pb-1.5 pt-1.5 text-[14.5px] leading-5 text-gray-900 shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] sm:max-w-[75%] lg:max-w-[65%] ${
                              m.de_mim ? 'bg-[#d9fdd3]' : 'bg-white'} ${!continua ? (m.de_mim ? 'rounded-tr-none' : 'rounded-tl-none') : ''} ${m.status === 'erro' ? 'ring-2 ring-red-400' : ''}`}>
                              {m.responde_texto && (
                                <div className="mb-1 rounded-md border-l-4 border-green-600 bg-black/5 px-2 py-1 text-[13px] leading-[18px] text-gray-600 line-clamp-3">{previaDaLista(m.responde_texto)}</div>
                              )}
                              {m.apagada ? (
                                <>
                                  <p className="italic text-gray-500">🚫 {m.de_mim ? 'Você apagou esta mensagem' : 'Mensagem apagada'}</p>
                                  {!m.de_mim && legenda && <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-gray-400 line-through" title="O cliente apagou; só a equipe vê">{legenda}</p>}
                                </>
                              ) : (
                                <>
                                  <Midia m={m} url={m.midia_path ? links[m.midia_path] : null} aoAmpliar={setFotoGrande}
                                    foto={m.de_mim ? null : conversa.foto_url} inicial={m.de_mim ? 'Eu' : (conversa.nome || '?').trim()[0]?.toUpperCase()} />
                                  {legenda && <p className={`whitespace-pre-wrap break-words ${temMidia ? 'mt-1' : ''}`}><ComLinks texto={legenda} /></p>}
                                </>
                              )}
                              {m.acao_pendente && <p className="mt-0.5 text-[11px] text-gray-500">{m.acao_pendente.tipo === 'apagar' ? 'apagando…' : 'editando…'}</p>}
                              {m.erro && m.status !== 'erro' && <p className="mt-0.5 text-[11px] text-red-600">{m.erro}</p>}
                              <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] leading-4 text-gray-500">
                                {m.editada && !m.apagada && <span>Editada</span>}
                                <span>{horario(m.criada_em)}</span>
                                <Situacao m={m} agora={agora} />
                              </p>
                              {(reacoes.length > 0 || pendente) && (
                                <span className={`absolute -bottom-3 ${m.de_mim ? 'right-2' : 'left-2'} rounded-full bg-white px-1.5 py-px text-[13px] shadow ring-1 ring-black/5`}
                                  title={reacoes.map(([de, e]) => `${de === 'loja' ? 'Loja' : 'Cliente'}: ${e}`).join(' · ')}>
                                  {reacoes.filter(([de]) => !(de === 'loja' && pendente)).map(([, e]) => e).join('')}{pendente && <span className="opacity-50">{pendente}</span>}
                                </span>
                              )}
                              {reagindo === m.id && (
                                <div className={`absolute z-20 flex gap-0.5 rounded-full bg-white px-2 py-1 shadow-xl ring-1 ring-black/5 ${abrirParaCima ? '-top-11' : 'top-8'} ${m.de_mim ? 'right-0' : 'left-0'}`} onClick={e => e.stopPropagation()}>
                                  {REACOES.map(e => (
                                    <button key={e} type="button" onClick={() => reagir(m, e)} className={`flex h-8 w-8 items-center justify-center rounded-full text-xl transition-transform hover:scale-125 ${m.reacoes?.loja === e ? 'bg-gray-200' : ''}`}>{e}</button>
                                  ))}
                                  <button type="button" onClick={() => setReagindo(null)} aria-label="Fechar" className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"><HiX size={16} /></button>
                                </div>
                              )}
                            </div>
                            {acoes.length > 0 && (
                              <div className={`shrink-0 self-start pt-1 ${m.de_mim ? 'order-first' : ''}`}>
                                <button onClick={(e) => { e.stopPropagation(); setAbrirParaCima(paraCima(e.currentTarget)); setMenuDe(d => (d === m.id ? null : m.id)) }} aria-label="Mais opções"
                                  className={`flex h-6 w-6 items-center justify-center rounded-full bg-white/80 text-gray-500 shadow-sm transition-opacity hover:text-gray-700 ${menuDe === m.id ? 'opacity-100' : 'pointer-events-none opacity-0 [@media(hover:hover)]:pointer-events-auto [@media(hover:hover)]:group-hover/linha:opacity-100'}`}>
                                  <HiChevronDown size={16} />
                                </button>
                                {menuDe === m.id && (
                                  <div className={`absolute z-30 w-48 overflow-hidden rounded-lg bg-white py-1.5 text-sm shadow-xl ring-1 ring-black/5 ${abrirParaCima ? 'bottom-full mb-1' : 'top-8'} ${m.de_mim ? 'right-0' : 'left-0'}`} onClick={e => e.stopPropagation()}>
                                    {acoes.map(a => (
                                      <button key={a.rotulo} type="button" onClick={a.fazer} className={`block w-full px-4 py-2 text-left hover:bg-gray-100 ${a.perigo ? 'text-red-600' : 'text-gray-800'}`}>{a.rotulo}</button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    <div ref={fimRef} />
                  </div>
                  {longeDoFim && (
                    <button type="button" onClick={descerAoFim} aria-label="Ir para a mensagem mais recente"
                      className="absolute bottom-3 right-3 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-600 shadow-md ring-1 ring-black/5 transition-colors hover:bg-gray-50 sm:right-5">
                      <HiChevronDown size={22} />
                      {novasAbaixo > 0 && (
                        <span className="absolute -top-1.5 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#25d366] px-1 text-[11px] font-bold text-white">{novasAbaixo}</span>
                      )}
                    </button>
                  )}
                  </div>

                  {/* Painéis acima da caixa: emojis e respostas rápidas */}
                  {painel === 'emojis' && (
                    <div className="grid max-h-48 shrink-0 grid-cols-8 gap-1 overflow-y-auto border-t border-gray-200 bg-white p-2 sm:grid-cols-12 lg:grid-cols-16">
                      {EMOJIS.map(em => (
                        <button key={em} type="button" onClick={() => { setTexto(t => t + em); caixaRef.current?.focus() }} className="flex h-10 items-center justify-center rounded-lg text-2xl hover:bg-gray-100">{em}</button>
                      ))}
                    </div>
                  )}
                  {(painel === 'rapidas' || texto.startsWith('/')) && (
                    <div className="max-h-60 shrink-0 overflow-y-auto border-t border-gray-200 bg-white">
                      {respostasFiltradas.map(r => (
                        <div key={r.id} className="flex items-start gap-2 border-b border-gray-100 px-4 py-2.5 hover:bg-gray-50">
                          <button type="button" onClick={() => { setTexto(r.texto); setPainel(null); caixaRef.current?.focus() }} className="min-w-0 flex-1 text-left">
                            <p className="text-sm font-semibold text-gray-900">/{r.titulo.toLowerCase()}</p>
                            <p className="truncate text-xs text-gray-500">{r.texto.split('\n')[0]}</p>
                          </button>
                          <button type="button" onClick={() => apagarResposta(r)} className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-red-500" title="Apagar"><HiX size={14} /></button>
                        </div>
                      ))}
                      {respostasFiltradas.length === 0 && <p className="px-4 py-2.5 text-xs text-gray-500">Nenhuma resposta rápida{texto.length > 1 ? ' com esse nome' : ''}.</p>}
                      <button type="button" onClick={novaResposta} className="w-full px-4 py-2.5 text-left text-sm font-semibold text-green-700 hover:bg-gray-50">+ Nova resposta rápida</button>
                    </div>
                  )}
                  {citando && (
                    <div className="flex shrink-0 items-center gap-2 border-t border-gray-200 bg-[#f0f2f5] px-3 pt-2">
                      <div className="min-w-0 flex-1 rounded-lg border-l-4 border-green-600 bg-white px-3 py-1.5 text-xs text-gray-600">
                        <p className="font-semibold text-green-700">{citando.de_mim ? 'Você' : nomeDaConversa(conversa)}</p>
                        <p className="truncate">{citando.texto ?? ROTULO_MIDIA[citando.tipo]}</p>
                      </div>
                      <button type="button" onClick={() => setCitando(null)} className={ICONE} aria-label="Cancelar resposta"><HiX size={18} /></button>
                    </div>
                  )}

                  <form onSubmit={enviar} className={`flex shrink-0 items-end gap-1 bg-[#f0f2f5] px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:gap-2 sm:px-4 ${citando ? '' : 'border-t border-gray-200'}`}>
                    {gravando ? (
                      <>
                        <button type="button" onClick={cancelarGravacao} className={ICONE} title="Cancelar" aria-label="Cancelar gravação"><HiX size={22} /></button>
                        <div className="flex h-10 flex-1 items-center gap-2 rounded-full bg-white px-4 text-sm text-red-600 shadow-sm">
                          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" /> Gravando… toque no quadrado para enviar
                        </div>
                        <button type="button" onClick={gravar} className={`${ICONE} bg-green-600 text-white hover:bg-green-700 hover:text-white`} title="Enviar áudio" aria-label="Enviar áudio"><HiStop size={18} /></button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => setPainel(p => (p === 'emojis' ? null : 'emojis'))} className={`${ICONE} ${painel === 'emojis' ? 'bg-gray-200 text-gray-800' : ''}`} title="Emojis" aria-label="Emojis"><HiEmojiHappy size={22} /></button>
                        <button type="button" onClick={() => arquivoRef.current?.click()} className={ICONE} title="Foto ou arquivo" aria-label="Anexar"><HiPaperClip size={22} /></button>
                        <button type="button" onClick={() => setPainel(p => (p === 'rapidas' ? null : 'rapidas'))} className={`${ICONE} ${painel === 'rapidas' ? 'bg-gray-200 text-gray-800' : ''}`} title="Respostas rápidas (ou digite /)" aria-label="Respostas rápidas"><HiLightningBolt size={20} /></button>
                        {PIX_LIGADO && <button type="button" onClick={pixAvulso} className={ICONE} title="Mandar Pix Copia e Cola com valor" aria-label="Pix"><HiQrcode size={20} /></button>}
                        <input ref={arquivoRef} type="file" className="hidden" accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                          onChange={e => subirArquivo(e.target.files?.[0])} />
                        <textarea
                          ref={caixaRef}
                          value={texto}
                          onChange={e => { setTexto(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px` }}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) enviar(e) }}
                          onPaste={e => { const f = e.clipboardData?.files?.[0]; if (f) { e.preventDefault(); subirArquivo(f) } }}
                          rows={1}
                          placeholder="Mensagem"
                          aria-label="Mensagem"
                          className="block h-10 max-h-32 min-w-0 flex-1 resize-none rounded-[20px] bg-white px-4 py-2.5 text-[15px] leading-5 text-gray-900 shadow-sm outline-none placeholder:text-gray-500"
                        />
                        {texto.trim() ? (
                          <button type="submit" disabled={enviando} className={`${ICONE} bg-green-600 text-white hover:bg-green-700 hover:text-white`} aria-label="Enviar">
                            <HiPaperAirplane className="rotate-90" size={18} />
                          </button>
                        ) : (
                          <button type="button" onClick={gravar} disabled={enviando} className={`${ICONE} bg-green-600 text-white hover:bg-green-700 hover:text-white`} title="Gravar áudio" aria-label="Gravar áudio">
                            <HiMicrophone size={20} />
                          </button>
                        )}
                      </>
                    )}
                  </form>
                </div>

                {/* Ficha do cliente: coluna fixa em tela larga, painel por cima nas menores */}
                <aside className={`${mostrarFicha ? 'flex' : 'hidden'} absolute inset-y-0 right-0 z-20 w-80 max-w-full flex-col border-l border-gray-200 bg-white shadow-2xl min-[1380px]:static min-[1380px]:flex min-[1380px]:w-72 min-[1380px]:shadow-none`}>
                  <div className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 px-4">
                    <p className="text-sm font-semibold text-gray-900">Cliente</p>
                    <button onClick={() => setMostrarFicha(false)} className={`${ICONE} h-8 w-8 min-[1380px]:hidden`} aria-label="Fechar ficha"><HiX size={16} /></button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <FichaDoCliente
                      pedidos={pedidosCliente}
                      carregando={pedidosCliente === null}
                      temTelefone={!!conversa.telefone}
                      aoRepetir={(p) => { setMostrarFicha(false); repetirPedido(p) }}
                    />
                  </div>
                </aside>
              </div>
            </>
          )}
        </section>
      </div>

      {fotoGrande && <FotoGrande url={fotoGrande} aoFechar={() => setFotoGrande(null)} />}
      {encaminhando && (
        <EscolherConversa
          conversas={conversas.filter(c => c.chave !== aberta)}
          aoEscolher={encaminharPara}
          aoFechar={() => setEncaminhando(null)}
        />
      )}

      <NovoPedidoModal
        aberto={pedido !== null}
        inicial={pedido}
        aoFechar={() => setPedido(null)}
        aoCriar={async (criado) => {
          setPedido(null)
          carregarPedidos()
          // conversa sem nome ou sem telefone aprende com o pedido criado a partir dela
          if (!conversa || (conversa.nome && conversa.telefone) || !criado) return
          const digitos = String(criado.customer_phone ?? '').replace(/\D/g, '')
          await supabase.from('zap_conversas').update({
            nome: conversa.nome || criado.customer_name || null,
            ...(!conversa.nome && criado.customer_name ? { nome_origem: 'pedido' } : {}),
            telefone: conversa.telefone || (digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : null),
          }).eq('chave', conversa.chave)
          carregarConversas()
        }}
      />
    </div>
  )
}
