import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HiArrowLeft, HiPaperAirplane, HiPlus, HiSearch } from 'react-icons/hi'
import toast from 'react-hot-toast'
import { supabase } from '../../services/supabase'
import { aCada } from '../../utils/aCada'
import { mascararTelefone } from '../../utils/format'
import NovoPedidoModal from '../../components/admin/NovoPedidoModal'

/**
 * Atendimento do WhatsApp dentro do painel, em qualquer aparelho (supabase/zap-atendimento.sql).
 *
 * As mensagens chegam pela função zap-webhook, que a Evolution do PC da loja chama. Responder
 * daqui grava a mensagem com status 'enviar'; quem envia de verdade é o painel do PC da loja
 * (utils/zapDoGrupo.js, enviarFilaDoAtendimento), com o mesmo espaçamento de proteção do número.
 */

const ROTULO_MIDIA = {
  imagem: '📷 Foto', video: '🎥 Vídeo', audio: '🎤 Áudio', documento: '📄 Documento',
  figurinha: '🙂 Figurinha', contato: '👤 Contato', localizacao: '📍 Localização', outro: 'Mensagem',
}

/**
 * 558488204664 -> (84) 98820-4664. O WhatsApp guarda muito celular sem o 9; cortar os 11 últimos
 * dígitos dava "(58) 48820-4664".
 */
function telefoneNaTela(t) {
  if (!t) return ''
  let d = String(t).replace(/\D/g, '')
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2)
  if (d.length === 10 && /[6-9]/.test(d[2])) d = `${d.slice(0, 2)}9${d.slice(2)}`
  return d.length === 10 || d.length === 11 ? mascararTelefone(d) : `+${String(t).replace(/\D/g, '')}`
}

const nomeDaConversa = (c) => c.nome || (c.telefone ? telefoneNaTela(c.telefone) : 'Sem número')

function Avatar({ c }) {
  const [falhou, setFalhou] = useState(false)
  if (c.foto_url && !falhou) {
    return <img src={c.foto_url} alt="" onError={() => setFalhou(true)} className="h-10 w-10 shrink-0 rounded-full object-cover" />
  }
  const inicial = (c.nome || '?').trim()[0]?.toUpperCase() ?? '?'
  return <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-200 font-semibold text-gray-500">{inicial}</div>
}

function Midia({ m, url }) {
  if (!url) return null
  if (m.tipo === 'audio') return <audio controls src={url} className="max-w-[240px]" />
  if (m.tipo === 'figurinha') return <img src={url} alt="Figurinha" className="h-28 w-28 object-contain" />
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt="Foto" className="max-h-64 rounded-md object-cover" />
    </a>
  )
}

function quando(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const hoje = new Date()
  return d.toDateString() === hoje.toDateString()
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function textoDaMensagem(m, temMidia) {
  if (m.tipo === 'texto') return m.texto
  if (temMidia) return m.texto
  return `${ROTULO_MIDIA[m.tipo] ?? 'Mensagem'}${m.texto ? ` · ${m.texto}` : ''}`
}

function SituacaoDoEnvio({ m, agora }) {
  if (!m.de_mim) return null
  if (m.status === 'erro') return <span className="text-red-200" title={m.erro ?? ''}>⚠ não enviou</span>
  if (m.status === 'enviar' || m.status === 'enviando') {
    const parada = agora - new Date(m.criada_em) > 90 * 1000
    return <span title="Quem envia é o painel do PC da loja">{parada ? '⏳ esperando o PC da loja' : '⏳'}</span>
  }
  return <span>✓</span>
}

export default function AtendimentoPage() {
  const [conversas, setConversas] = useState(null)
  const [busca, setBusca] = useState('')
  const [aberta, setAberta] = useState(null)
  const [mensagens, setMensagens] = useState([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [pedido, setPedido] = useState(null)
  const [agora, setAgora] = useState(0)
  const [links, setLinks] = useState({}) // midia_path -> link assinado
  const fimRef = useRef(null)
  const ultimaVistaRef = useRef(null)

  const carregarConversas = useCallback(async () => {
    const { data, error } = await supabase.from('zap_conversas').select('*')
      .order('ultima_em', { ascending: false, nullsFirst: false }).limit(150)
    if (!error) setConversas(data)
  }, [])

  useEffect(() => {
    Promise.resolve().then(carregarConversas)
    return aCada(carregarConversas, 5000)
  }, [carregarConversas])

  const carregarMensagens = useCallback(async () => {
    if (!aberta) return
    const { data, error } = await supabase.from('zap_mensagens').select('*')
      .eq('conversa', aberta).order('criada_em', { ascending: false }).limit(150)
    if (error) return
    setMensagens(data.reverse())
    setAgora(Date.now())
    // link assinado (1 h) só para mídia que ainda não tem
    const faltam = data.map(m => m.midia_path).filter(Boolean)
    if (faltam.length) {
      setLinks(atuais => {
        const novos = faltam.filter(p => !atuais[p])
        if (novos.length) {
          supabase.storage.from('zap-midia').createSignedUrls(novos, 3600).then(({ data: assinados }) => {
            if (assinados?.length) setLinks(a => ({ ...a, ...Object.fromEntries(assinados.filter(x => x.signedUrl).map(x => [x.path, x.signedUrl])) }))
          })
        }
        return atuais
      })
    }
    // chegou mensagem com a conversa aberta: já conta como lida
    const ultima = data[0]
    if (ultima && !ultima.de_mim && ultima.id !== ultimaVistaRef.current) {
      ultimaVistaRef.current = ultima.id
      supabase.from('zap_conversas').update({ nao_lidas: 0 }).eq('chave', aberta).then(() => {})
    }
  }, [aberta])

  const abrir = (chave) => {
    setMensagens([])
    ultimaVistaRef.current = null
    setAberta(chave)
  }

  useEffect(() => {
    if (!aberta) return
    supabase.from('zap_conversas').update({ nao_lidas: 0 }).eq('chave', aberta).then(() => carregarConversas())
    Promise.resolve().then(carregarMensagens)
    return aCada(carregarMensagens, 3000)
  }, [aberta, carregarMensagens, carregarConversas])

  useEffect(() => { fimRef.current?.scrollIntoView({ block: 'end' }) }, [mensagens.length, aberta])

  const conversa = conversas?.find(c => c.chave === aberta) ?? null
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const digitos = termo.replace(/\D/g, '')
    return (conversas ?? []).filter(c => !termo
      || (c.nome ?? '').toLowerCase().includes(termo)
      || (digitos && (c.telefone ?? '').includes(digitos)))
  }, [conversas, busca])

  const enviar = async (e) => {
    e.preventDefault()
    const corpo = texto.trim()
    if (!corpo || !aberta) return
    setEnviando(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('zap_mensagens').insert({
      conversa: aberta, de_mim: true, texto: corpo, tipo: 'texto', status: 'enviar',
      enviada_por: user?.email ?? null,
    })
    setEnviando(false)
    if (error) return toast.error('Não consegui mandar. Tente de novo.')
    setTexto('')
    carregarMensagens()
  }

  const abrirPedido = () => {
    if (!conversa) return
    setPedido({
      customer_name: conversa.nome ?? '',
      customer_phone: conversa.telefone ? telefoneNaTela(conversa.telefone) : '',
      canal: 'whatsapp',
    })
  }

  if (conversas === null) return <p className="text-gray-500">Carregando conversas…</p>

  return (
    <div>
      <div className={`${aberta ? 'hidden md:flex' : 'flex'} items-center justify-between mb-4`}>
        <h1 className="text-2xl font-bold">Atendimento</h1>
      </div>

      <div className="flex h-[calc(100vh-10rem)] min-h-[420px] overflow-hidden rounded-xl border border-gray-200 bg-white">
        {/* Lista de conversas */}
        <aside className={`${aberta ? 'hidden md:flex' : 'flex'} w-full md:w-80 shrink-0 flex-col border-r border-gray-200`}>
          <div className="border-b border-gray-200 p-3">
            <label className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2">
              <HiSearch className="text-gray-400" />
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Nome ou telefone"
                className="w-full text-sm outline-none"
              />
            </label>
          </div>
          <ul className="flex-1 overflow-y-auto">
            {visiveis.length === 0 && (
              <li className="p-6 text-center text-sm text-gray-500">
                {conversas.length === 0
                  ? 'As conversas aparecem aqui assim que o painel do PC da loja ligar o atendimento.'
                  : 'Nenhuma conversa com esse nome ou telefone.'}
              </li>
            )}
            {visiveis.map(c => (
              <li key={c.chave}>
                <button
                  onClick={() => abrir(c.chave)}
                  className={`flex w-full items-start gap-3 border-b border-gray-100 px-3 py-3 text-left hover:bg-gray-50 ${aberta === c.chave ? 'bg-green-50' : ''}`}
                >
                  <Avatar c={c} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-sm ${c.nao_lidas ? 'font-bold' : 'font-medium'}`}>{nomeDaConversa(c)}</span>
                      <span className={`shrink-0 text-xs ${c.nao_lidas ? 'font-semibold text-green-700' : 'text-gray-400'}`}>{quando(c.ultima_em)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-gray-500">
                        {c.ultima_de_mim && 'Você: '}{c.ultima_msg ?? ''}
                      </span>
                      {c.nao_lidas > 0 && (
                        <span className="shrink-0 rounded-full bg-green-600 px-1.5 text-[11px] font-bold text-white">{c.nao_lidas}</span>
                      )}
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
            <div className="m-auto p-6 text-center text-sm text-gray-500">Escolha uma conversa.</div>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-gray-200 px-3 py-2.5">
                <button onClick={() => setAberta(null)} className="md:hidden text-gray-500" aria-label="Voltar">
                  <HiArrowLeft size={20} />
                </button>
                <Avatar c={conversa} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{nomeDaConversa(conversa)}</p>
                  {conversa.telefone && conversa.nome && (
                    <p className="text-xs text-gray-500">{telefoneNaTela(conversa.telefone)}</p>
                  )}
                </div>
                <button
                  onClick={abrirPedido}
                  className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
                >
                  <HiPlus /> Criar pedido
                </button>
              </header>

              <div className="flex-1 space-y-2 overflow-y-auto bg-[#efeae2] p-3">
                {mensagens.length === 0 && (
                  <p className="mx-auto w-fit rounded-lg bg-white/80 px-3 py-1.5 text-center text-xs text-gray-600">
                    As mensagens desta conversa aparecem a partir de agora.
                    {conversa.ultima_msg && <><br />Última antes disso: “{conversa.ultima_msg}”</>}
                  </p>
                )}
                {mensagens.map(m => (
                  <div key={m.id} className={`flex ${m.de_mim ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-lg px-3 py-1.5 text-sm shadow-sm ${
                      m.de_mim ? 'bg-green-700 text-white' : 'bg-white text-gray-900'
                    } ${m.status === 'erro' ? 'ring-2 ring-red-400' : ''}`}>
                      <Midia m={m} url={m.midia_path ? links[m.midia_path] : null} />
                      {textoDaMensagem(m, !!(m.midia_path && links[m.midia_path])) && (
                        <p className="whitespace-pre-wrap break-words">{textoDaMensagem(m, !!(m.midia_path && links[m.midia_path]))}</p>
                      )}
                      <p className={`mt-0.5 flex justify-end gap-1.5 text-[10px] ${m.de_mim ? 'text-green-100' : 'text-gray-400'}`}>
                        {quando(m.criada_em)} <SituacaoDoEnvio m={m} agora={agora} />
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={fimRef} />
              </div>

              <form onSubmit={enviar} className="flex items-end gap-2 border-t border-gray-200 p-2">
                <textarea
                  value={texto}
                  onChange={e => setTexto(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) enviar(e) }}
                  rows={1}
                  placeholder="Escreva uma mensagem"
                  className="max-h-32 flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
                />
                <button
                  type="submit"
                  disabled={enviando || !texto.trim()}
                  className="rounded-full bg-green-600 p-2.5 text-white disabled:opacity-40"
                  aria-label="Enviar"
                >
                  <HiPaperAirplane className="rotate-90" size={18} />
                </button>
              </form>
            </>
          )}
        </section>
      </div>

      <NovoPedidoModal
        aberto={pedido !== null}
        inicial={pedido}
        aoFechar={() => setPedido(null)}
        aoCriar={() => setPedido(null)}
      />
    </div>
  )
}
