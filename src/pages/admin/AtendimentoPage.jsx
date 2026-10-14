import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  HiArrowLeft, HiPaperAirplane, HiPencil, HiPlus, HiSearch, HiPaperClip, HiMicrophone, HiStop,
  HiEmojiHappy, HiLightningBolt, HiReply, HiX, HiBell, HiDocumentText, HiSparkles, HiUser, HiQrcode,
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

const previaDaLista = (t) => String(t ?? '').replace(/^\[(\w+)\]$/, (_, tipo) => ROTULO_MIDIA[tipo] ?? 'Mensagem')

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
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}

/** Texto com link clicável. */
function ComLinks({ texto }) {
  const partes = String(texto).split(/(https?:\/\/[^\s]+)/g)
  return partes.map((p, i) => (/^https?:\/\//.test(p)
    ? <a key={i} href={p} target="_blank" rel="noreferrer" className="underline break-all">{p}</a>
    : <span key={i}>{p}</span>))
}

function Avatar({ c, tamanho = 'h-10 w-10' }) {
  const [falhou, setFalhou] = useState(false)
  if (c.foto_url && !falhou) {
    return <img src={c.foto_url} alt="" onError={() => setFalhou(true)} className={`${tamanho} shrink-0 rounded-full object-cover`} />
  }
  const inicial = (c.nome || '?').trim()[0]?.toUpperCase() ?? '?'
  return <div className={`${tamanho} flex shrink-0 items-center justify-center rounded-full bg-gray-200 font-semibold text-gray-500`}>{inicial}</div>
}

function Midia({ m, url }) {
  if (!url) return null
  if (m.tipo === 'audio') return <audio controls src={url} className="max-w-[260px]" />
  if (m.tipo === 'figurinha') return <img src={url} alt="Figurinha" className="h-28 w-28 object-contain" />
  if (m.tipo === 'video') return <video controls src={url} className="max-h-72 rounded-md" />
  if (m.tipo === 'documento') {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-md bg-black/5 px-3 py-2 no-underline">
        <HiDocumentText size={22} /> <span className="truncate">{m.midia_nome || 'Documento'}</span>
      </a>
    )
  }
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt="Foto" className="max-h-72 rounded-md object-cover" />
    </a>
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
        if (m.conversa && m.conversa === abertaRef.current) { rolarRef.current = true; carregarMensagens() }
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
    if (rolarRef.current) fimRef.current?.scrollIntoView({ block: 'end' })
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
        midia_nome: arquivo.name || null, texto: texto.trim() || null,
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
    const { error } = await supabase.from('zap_conversas').update({ nome: nome.trim() || null }).eq('chave', conversa.chave)
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

  const ativarAvisos = async () => {
    if (typeof Notification === 'undefined') return
    setAvisos(await Notification.requestPermission())
  }

  const respostasFiltradas = texto.startsWith('/')
    ? respostas.filter(r => r.titulo.toLowerCase().includes(texto.slice(1).toLowerCase()))
    : respostas

  if (conversas === null) return <p className="text-gray-500">Carregando conversas…</p>

  return (
    <div>
      <div className={`${aberta ? 'hidden md:flex' : 'flex'} items-center justify-between mb-4`}>
        <h1 className="text-2xl font-bold">Atendimento</h1>
        {avisos === 'default' && (
          <button onClick={ativarAvisos} className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm">
            <HiBell /> Avisar mensagem nova
          </button>
        )}
      </div>

      <div className="flex h-[calc(100vh-10rem)] min-h-[440px] overflow-hidden rounded-xl border border-gray-200 bg-white">
        {/* Lista de conversas */}
        <aside className={`${aberta ? 'hidden md:flex' : 'flex'} w-full md:w-96 shrink-0 flex-col border-r border-gray-200`}>
          <div className="space-y-2 border-b border-gray-200 p-3">
            <div className="flex gap-2">
              <label className="flex flex-1 items-center gap-2 rounded-lg bg-gray-100 px-3 py-2">
                <HiSearch className="text-gray-400" />
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Pesquisar nome ou telefone" className="w-full bg-transparent text-sm outline-none" />
              </label>
              <button onClick={novaConversa} title="Nova conversa" className="rounded-lg bg-green-600 px-3 text-white"><HiPlus /></button>
            </div>
            <div className="flex gap-2 text-sm">
              {[['todas', 'Todas'], ['naoLidas', `Não lidas${naoLidas ? ` (${naoLidas})` : ''}`]].map(([id, rotulo]) => (
                <button key={id} onClick={() => setFiltro(id)} className={`rounded-full px-3 py-1 ${filtro === id ? 'bg-green-100 font-semibold text-green-800' : 'bg-gray-100 text-gray-600'}`}>{rotulo}</button>
              ))}
            </div>
          </div>
          <ul className="flex-1 overflow-y-auto">
            {visiveis.length === 0 && (
              <li className="p-6 text-center text-sm text-gray-500">
                {conversas.length === 0 ? 'As conversas aparecem aqui assim que o painel do PC da loja ligar o atendimento.'
                  : filtro === 'naoLidas' ? 'Nenhuma conversa não lida.' : 'Nenhuma conversa com esse nome ou telefone.'}
              </li>
            )}
            {visiveis.map(c => (
              <li key={c.chave}>
                <button onClick={() => abrir(c.chave)} className={`flex w-full items-center gap-3 border-b border-gray-100 px-3 py-2.5 text-left hover:bg-gray-50 ${aberta === c.chave ? 'bg-gray-100' : ''}`}>
                  <Avatar c={c} tamanho="h-12 w-12" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`truncate ${c.nao_lidas ? 'font-bold' : 'font-medium'}`}>{nomeDaConversa(c)}</span>
                      <span className={`shrink-0 text-xs ${c.nao_lidas ? 'font-semibold text-green-600' : 'text-gray-400'}`}>{quandoNaLista(c.ultima_em)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-gray-500">{c.ultima_de_mim && 'Você: '}{previaDaLista(c.ultima_msg)}</span>
                      {c.nao_lidas > 0 && <span className="shrink-0 rounded-full bg-green-500 px-1.5 text-[11px] font-bold text-white">{c.nao_lidas}</span>}
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
            <div className="m-auto p-6 text-center text-sm text-gray-500">Escolha uma conversa ou comece uma nova no +.</div>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2">
                <button onClick={() => { abertaRef.current = null; setAberta(null) }} className="md:hidden text-gray-500" aria-label="Voltar"><HiArrowLeft size={20} /></button>
                <Avatar c={conversa} />
                <div className="min-w-0 flex-1">
                  <button onClick={renomear} className="flex max-w-full items-center gap-1.5 text-left" title="Renomear">
                    <span className="truncate font-semibold">{nomeDaConversa(conversa)}</span>
                    <HiPencil className="shrink-0 text-gray-400" size={14} />
                  </button>
                  {conversa.telefone && conversa.nome && <p className="text-xs text-gray-500">{telefoneNaTela(conversa.telefone)}</p>}
                </div>
                <button onClick={() => setMostrarFicha(v => !v)} title="Ficha do cliente"
                  className={`rounded-lg px-2 py-1.5 xl:hidden ${mostrarFicha ? 'bg-gray-200' : 'text-gray-500'}`}><HiUser size={18} /></button>
                <button onClick={montarComIA} disabled={montandoIA} title="A IA lê a conversa e monta o pedido para você conferir"
                  className="flex items-center gap-1 rounded-lg border border-primary px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-50">
                  <HiSparkles className={montandoIA ? 'animate-pulse' : ''} /> {montandoIA ? 'Lendo…' : 'Montar'}<span className="hidden 2xl:inline"> pedido</span>
                </button>
                <button onClick={abrirPedido} className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90">
                  <HiPlus /> <span className="hidden 2xl:inline">Criar pedido</span>
                </button>
              </header>

              <CardPedidoAberto
                pedido={pedidoAberto}
                aoCobrar={PIX_LIGADO ? (p) => cobrarPix(faltaReceber(p), p) : null}
                aoMudar={carregarPedidos}
              />
              <div className="relative flex min-h-0 flex-1">
              <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex-1 overflow-y-auto bg-[#efeae2] px-3 py-2 md:px-10">
                {temMais && (
                  <div className="my-2 text-center">
                    <button onClick={carregarAnteriores} className="rounded-full bg-white/90 px-3 py-1 text-xs text-gray-600 shadow-sm">Carregar mensagens anteriores</button>
                  </div>
                )}
                {mensagens.length === 0 && (
                  <p className="mx-auto mt-4 w-fit rounded-lg bg-[#fff5c4] px-3 py-1.5 text-center text-xs text-gray-700">Nenhuma mensagem ainda nesta conversa.</p>
                )}
                {mensagens.map((m, i) => {
                  const novoDia = i === 0 || new Date(mensagens[i - 1].criada_em).toDateString() !== new Date(m.criada_em).toDateString()
                  const temMidia = !!(m.midia_path && links[m.midia_path])
                  const legenda = m.tipo === 'texto' || temMidia ? m.texto : `${ROTULO_MIDIA[m.tipo] ?? 'Mensagem'}${m.texto ? ` · ${m.texto}` : ''}`
                  const botaoResponder = m.wa_id && (
                    <button onClick={() => { setCitando(m); caixaRef.current?.focus() }} title="Responder" className="text-gray-500 opacity-40 md:opacity-0 md:group-hover:opacity-100"><HiReply /></button>
                  )
                  return (
                    <div key={m.id}>
                      {novoDia && (
                        <div className="my-3 text-center">
                          <span className="rounded-lg bg-white/90 px-3 py-1 text-xs capitalize text-gray-600 shadow-sm">{rotuloDoDia(m.criada_em)}</span>
                        </div>
                      )}
                      <div className={`group mb-1 flex items-center gap-1 ${m.de_mim ? 'justify-end' : 'justify-start'}`}>
                        {m.de_mim && botaoResponder}
                        <div className={`max-w-[85%] md:max-w-[65%] rounded-lg px-2.5 py-1.5 text-sm shadow-sm ${
                          m.de_mim ? 'rounded-tr-none bg-[#d9fdd3] text-gray-900' : 'rounded-tl-none bg-white text-gray-900'
                        } ${m.status === 'erro' ? 'ring-2 ring-red-400' : ''}`}>
                          {m.responde_texto && (
                            <div className="mb-1 rounded border-l-4 border-green-600 bg-black/5 px-2 py-1 text-xs text-gray-600 line-clamp-3">{previaDaLista(m.responde_texto)}</div>
                          )}
                          <Midia m={m} url={m.midia_path ? links[m.midia_path] : null} />
                          {legenda && <p className="whitespace-pre-wrap break-words"><ComLinks texto={legenda} /></p>}
                          <p className="mt-0.5 flex justify-end gap-1 text-[10px] text-gray-500">
                            {horario(m.criada_em)} <Situacao m={m} agora={agora} />
                          </p>
                        </div>
                        {!m.de_mim && botaoResponder}
                      </div>
                    </div>
                  )
                })}
                <div ref={fimRef} />
              </div>

              {/* Painéis acima da caixa: emojis e respostas rápidas */}
              {painel === 'emojis' && (
                <div className="grid max-h-44 grid-cols-10 gap-1 overflow-y-auto border-t border-gray-200 bg-white p-2 text-xl md:grid-cols-14">
                  {EMOJIS.map(em => <button key={em} type="button" onClick={() => { setTexto(t => t + em); caixaRef.current?.focus() }} className="rounded hover:bg-gray-100">{em}</button>)}
                </div>
              )}
              {(painel === 'rapidas' || texto.startsWith('/')) && (
                <div className="max-h-56 overflow-y-auto border-t border-gray-200 bg-white">
                  {respostasFiltradas.map(r => (
                    <div key={r.id} className="flex items-start gap-2 border-b border-gray-100 px-3 py-2 hover:bg-gray-50">
                      <button type="button" onClick={() => { setTexto(r.texto); setPainel(null); caixaRef.current?.focus() }} className="min-w-0 flex-1 text-left">
                        <p className="text-sm font-semibold">/{r.titulo}</p>
                        <p className="truncate text-xs text-gray-500">{r.texto}</p>
                      </button>
                      <button type="button" onClick={() => apagarResposta(r)} className="text-gray-400 hover:text-red-500" title="Apagar"><HiX /></button>
                    </div>
                  ))}
                  {respostasFiltradas.length === 0 && <p className="px-3 py-2 text-xs text-gray-500">Nenhuma resposta rápida{texto.length > 1 ? ' com esse nome' : ''}.</p>}
                  <button type="button" onClick={novaResposta} className="w-full px-3 py-2 text-left text-sm font-semibold text-green-700 hover:bg-gray-50">+ Nova resposta rápida</button>
                </div>
              )}
              {citando && (
                <div className="flex items-center gap-2 border-t border-gray-200 bg-gray-50 px-3 py-2">
                  <div className="min-w-0 flex-1 rounded border-l-4 border-green-600 bg-white px-2 py-1 text-xs text-gray-600">
                    <p className="font-semibold text-green-700">{citando.de_mim ? 'Você' : nomeDaConversa(conversa)}</p>
                    <p className="truncate">{citando.texto ?? ROTULO_MIDIA[citando.tipo]}</p>
                  </div>
                  <button type="button" onClick={() => setCitando(null)} className="text-gray-500"><HiX /></button>
                </div>
              )}

              <form onSubmit={enviar} className="flex items-end gap-1.5 border-t border-gray-200 bg-gray-50 p-2">
                {gravando ? (
                  <>
                    <button type="button" onClick={cancelarGravacao} className="p-2 text-gray-500" title="Cancelar"><HiX size={22} /></button>
                    <div className="flex flex-1 items-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm text-red-600">
                      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" /> Gravando… toque no quadrado para enviar
                    </div>
                    <button type="button" onClick={gravar} className="rounded-full bg-green-600 p-2.5 text-white" title="Enviar áudio"><HiStop size={18} /></button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => setPainel(p => (p === 'emojis' ? null : 'emojis'))} className="p-2 text-gray-500" title="Emojis"><HiEmojiHappy size={22} /></button>
                    <button type="button" onClick={() => arquivoRef.current?.click()} className="p-2 text-gray-500" title="Foto ou arquivo"><HiPaperClip size={22} /></button>
                    <button type="button" onClick={() => setPainel(p => (p === 'rapidas' ? null : 'rapidas'))} className="p-2 text-gray-500" title="Respostas rápidas (ou digite /)"><HiLightningBolt size={22} /></button>
                    {PIX_LIGADO && <button type="button" onClick={pixAvulso} className="p-2 text-gray-500" title="Mandar Pix Copia e Cola com valor"><HiQrcode size={22} /></button>}
                    <input ref={arquivoRef} type="file" className="hidden" accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                      onChange={e => subirArquivo(e.target.files?.[0])} />
                    <textarea
                      ref={caixaRef}
                      value={texto}
                      onChange={e => setTexto(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) enviar(e) }}
                      onPaste={e => { const f = e.clipboardData?.files?.[0]; if (f) { e.preventDefault(); subirArquivo(f) } }}
                      rows={1}
                      placeholder="Mensagem"
                      className="max-h-32 flex-1 resize-none rounded-lg bg-white px-3 py-2.5 text-sm outline-none"
                    />
                    {texto.trim() ? (
                      <button type="submit" disabled={enviando} className="rounded-full bg-green-600 p-2.5 text-white disabled:opacity-40" aria-label="Enviar">
                        <HiPaperAirplane className="rotate-90" size={18} />
                      </button>
                    ) : (
                      <button type="button" onClick={gravar} disabled={enviando} className="rounded-full bg-green-600 p-2.5 text-white disabled:opacity-40" title="Gravar áudio">
                        <HiMicrophone size={18} />
                      </button>
                    )}
                  </>
                )}
              </form>
              </div>
              {/* Ficha do cliente: coluna fixa em tela larga, painel pelo botão nas menores */}
              <aside className={`${mostrarFicha ? 'block' : 'hidden'} absolute inset-y-0 right-0 z-10 w-72 max-w-full overflow-y-auto border-l border-gray-200 bg-white shadow-xl xl:static xl:block xl:shrink-0 xl:shadow-none`}>
                <p className="border-b border-gray-200 px-4 py-2.5 font-semibold">Cliente</p>
                <FichaDoCliente
                  pedidos={pedidosCliente}
                  carregando={pedidosCliente === null}
                  temTelefone={!!conversa.telefone}
                  aoRepetir={repetirPedido}
                />
              </aside>
              </div>
            </>
          )}
        </section>
      </div>

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
            telefone: conversa.telefone || (digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : null),
          }).eq('chave', conversa.chave)
          carregarConversas()
        }}
      />
    </div>
  )
}
