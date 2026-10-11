import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../services/supabase'
import { updateSetting } from '../../services/settings'
import Loading from '../ui/Loading'
import { Bloco, Cartao } from './HubUi'
import { formatCurrency } from '../../utils/format'

/**
 * Pedido lançado no painel só com o primeiro nome ("Pablo", "Camila") fica sem telefone, e sem
 * telefone não há recompra, pós-venda nem histórico do cliente. Aqui cada pedido assim ganha os
 * contatos prováveis do Zap da loja — mesmo nome e conversa perto do dia do pedido — e um clique
 * grava o número no pedido. Os contatos vêm do painel do PC da loja (zap_contatos).
 */

const DIA = 24 * 60 * 60 * 1000
const CANAIS_COM_ZAP = ['whatsapp', 'balcao', 'site']
const NOMES_GENERICOS = /^(compras anteriores|ifood|cliente|balc[aã]o)/i

const normalizar = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim()
const primeiro = (s) => normalizar(s).split(/\s+/)[0] || ''
const telValido = (t) => /^[1-9][1-9]9?[2-9]\d{7}$/.test((t || '').replace(/\D/g, '').slice(-11))

const diaIso = (d) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

/** "5584999991234" → "(84) 99999-1234"; número de fora fica com +. */
function formatarNumero(n) {
  if (n.startsWith('55') && (n.length === 12 || n.length === 13)) {
    const l = n.slice(2)
    return l.length === 11 ? `(${l.slice(0, 2)}) ${l.slice(2, 7)}-${l.slice(7)}` : `(${l.slice(0, 2)}) ${l.slice(2, 6)}-${l.slice(6)}`
  }
  return `+${n}`
}

/**
 * Pontos de um contato para um pedido: nome (primeiro nome igual vale 3; aparece no nome todo, 1)
 * e conversa (no dia do pedido, 3; até 3 dias antes, 2; no dia marcado da entrega, 1).
 */
function pontuar(pedido, contato) {
  const p1 = primeiro(pedido.customer_name)
  const nomes = [contato.nome, contato.nome_perfil].map(normalizar).filter(Boolean)
  let nome = 0
  if (p1 && nomes.some(n => n.split(/\s+/)[0] === p1)) nome = 3
  else if (p1.length >= 3 && nomes.some(n => n.includes(p1))) nome = 1

  const feito = new Date(pedido.created_at)
  let conversa = 0
  if (contato.dias?.[diaIso(feito)]) conversa = 3
  else if ([1, 2, 3].some(k => contato.dias?.[diaIso(+feito - k * DIA)])) conversa = 2
  else if (pedido.scheduled_for && contato.dias?.[diaIso(pedido.scheduled_for)]) conversa = 1
  return { total: nome + conversa, nome, conversa }
}

export default function ContatosDoZap() {
  const [contatos, setContatos] = useState(null)
  const [pedidos, setPedidos] = useState(null)
  const [sinc, setSinc] = useState({ pedido: '', feito: '' })
  const [descartados, setDescartados] = useState(() => new Set())
  const [gravando, setGravando] = useState(null)

  const carregar = useCallback(async () => {
    const [c, p, s] = await Promise.all([
      supabase.from('zap_contatos').select('*'),
      supabase.from('orders').select('id, order_number, customer_name, customer_phone, canal, created_at, scheduled_for, total, status')
        .neq('status', 'cancelado').order('created_at', { ascending: false }),
      supabase.from('settings').select('key, value').in('key', ['zap_sincronizar_pedido', 'zap_sincronizado_em']),
    ])
    const erro = c.error || p.error || s.error
    if (erro) { toast.error(erro.message); return }
    setContatos(c.data ?? [])
    setPedidos(p.data ?? [])
    const v = (k) => s.data?.find(x => x.key === k)?.value || ''
    setSinc({ pedido: v('zap_sincronizar_pedido'), feito: v('zap_sincronizado_em') })
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // enquanto a loja não termina o pedido de sincronização, confere de novo a cada 20 s
  const esperando = sinc.pedido && sinc.pedido > sinc.feito
  useEffect(() => {
    if (!esperando) return
    const t = setInterval(carregar, 20000)
    return () => clearInterval(t)
  }, [esperando, carregar])

  const semTelefone = useMemo(() => (pedidos ?? []).filter(o =>
    CANAIS_COM_ZAP.includes(o.canal || 'site') && !telValido(o.customer_phone) && !NOMES_GENERICOS.test(o.customer_name || '')), [pedidos])

  const sugestoes = useMemo(() => {
    if (!contatos) return new Map()
    const m = new Map()
    for (const o of semTelefone) {
      const lista = contatos
        .map(c => ({ c, ...pontuar(o, c) }))
        .filter(x => x.total >= 3 && !descartados.has(`${o.id}|${x.c.numero}`))
        .sort((a, b) => b.total - a.total || (b.c.ultima_msg || '').localeCompare(a.c.ultima_msg || ''))
        .slice(0, 3)
      m.set(o.id, lista)
    }
    return m
  }, [contatos, semTelefone, descartados])

  if (!contatos || !pedidos) return <Loading />

  const pedirSincronizacao = async () => {
    try {
      const agora = new Date().toISOString()
      await updateSetting('zap_sincronizar_pedido', agora)
      setSinc(s => ({ ...s, pedido: agora }))
      toast.success('Pedido enviado. O painel do PC da loja sincroniza em até 2 minutos.')
    } catch (e) {
      toast.error(e.message || 'Não foi possível pedir a sincronização.')
    }
  }

  const ligar = async (pedido, contato) => {
    setGravando(pedido.id)
    try {
      const telefone = formatarNumero(contato.numero)
      const { error } = await supabase.from('orders').update({ customer_phone: telefone }).eq('id', pedido.id)
      if (error) throw error
      toast.success(`#${pedido.order_number} ${pedido.customer_name}: ${telefone}`)
      setPedidos(lista => lista.map(o => (o.id === pedido.id ? { ...o, customer_phone: telefone } : o)))
    } catch (e) {
      toast.error(e.message || 'Não foi possível gravar o telefone.')
    } finally {
      setGravando(null)
    }
  }

  const certeiros = semTelefone
    .map(o => ({ o, s: sugestoes.get(o.id) ?? [] }))
    .filter(({ s }) => s.length && s[0].nome === 3 && s[0].conversa >= 2 && (s.length === 1 || s[1].total < s[0].total))

  const ligarCerteiros = async () => {
    if (!confirm(`Gravar o telefone em ${certeiros.length} pedidos onde o nome e a conversa no dia batem com um contato só?`)) return
    for (const { o, s } of certeiros) await ligar(o, s[0].c)
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cartao titulo="Contatos do Zap" valor={contatos.length} detalhe={sinc.feito ? `lidos em ${new Date(sinc.feito).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : 'ainda não sincronizado'} />
        <Cartao titulo="Pedidos sem telefone" valor={semTelefone.length} detalhe="Zap, balcão e site (sem iFood)" destaque />
        <Cartao titulo="Com sugestão" valor={semTelefone.filter(o => sugestoes.get(o.id)?.length).length} />
        <Cartao titulo="Certeiros" valor={certeiros.length} detalhe="nome + conversa no dia" />
      </div>

      <Bloco
        titulo="📇 Ligar pedidos aos contatos do Zap"
        subtitulo="Para cada pedido sem telefone, os contatos do WhatsApp da loja com o mesmo nome e conversa perto do dia do pedido. Confira e clique no certo."
        acao={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={pedirSincronizacao} disabled={esperando}
              className="cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold text-primary ring-1 ring-border hover:bg-cream disabled:opacity-60">
              {esperando ? 'Sincronizando no PC da loja…' : 'Sincronizar contatos agora'}
            </button>
            {certeiros.length > 0 && (
              <button type="button" onClick={ligarCerteiros} disabled={!!gravando}
                className="cursor-pointer rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-dark disabled:opacity-60">
                Ligar os {certeiros.length} certeiros
              </button>
            )}
          </div>
        }
      >
        {!contatos.length ? (
          <p className="text-sm text-text-light">
            Nenhum contato ainda. Os contatos chegam quando o painel do PC da loja sincroniza com a Evolution (precisa estar com o
            armazenamento de conversas ligado).
          </p>
        ) : semTelefone.length === 0 ? (
          <p className="text-sm text-text-light">Todos os pedidos têm telefone. 🎉</p>
        ) : (
          <ul className="divide-y divide-border">
            {semTelefone.map(o => {
              const lista = sugestoes.get(o.id) ?? []
              return (
                <li key={o.id} className="py-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
                    <span className="font-semibold">#{o.order_number} {o.customer_name}</span>
                    <span className="text-xs text-text-light">
                      {new Date(o.created_at).toLocaleDateString('pt-BR')} · {formatCurrency(o.total)} · {o.canal}
                    </span>
                  </div>
                  {lista.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {lista.map(({ c, nome, conversa }) => (
                        <div key={c.numero} className="flex items-center gap-2 rounded-xl bg-cream px-3 py-2 text-xs">
                          <div>
                            <p className="font-semibold">{c.nome || c.nome_perfil || 'sem nome'} {c.nome && c.nome_perfil && c.nome !== c.nome_perfil && <span className="font-normal text-text-light">({c.nome_perfil})</span>}</p>
                            <p className="text-text-light">
                              {formatarNumero(c.numero)} · {nome === 3 ? 'mesmo nome' : nome ? 'nome parecido' : 'nome diferente'} ·{' '}
                              {conversa === 3 ? 'conversou no dia' : conversa === 2 ? 'conversou dias antes' : conversa ? 'conversou no dia da entrega' : 'sem conversa perto'}
                            </p>
                          </div>
                          <button type="button" disabled={gravando === o.id} onClick={() => ligar(o, c)}
                            className="cursor-pointer rounded-lg bg-green-600 px-2.5 py-1.5 font-semibold text-white hover:bg-green-700 disabled:opacity-60">
                            É esse
                          </button>
                          <button type="button" title="Não é esse" onClick={() => setDescartados(d => new Set(d).add(`${o.id}|${c.numero}`))}
                            className="cursor-pointer px-1 text-text-light hover:text-red-600">✕</button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-text-light">Nenhum contato provável. Dá para pôr o telefone à mão no pedido.</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Bloco>
    </div>
  )
}
