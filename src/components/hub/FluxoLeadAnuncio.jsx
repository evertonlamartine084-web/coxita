import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../services/supabase'
import Loading from '../ui/Loading'
import { Bloco, Cartao } from './HubUi'
import { formatCurrency } from '../../utils/format'
import { VARIAVEIS_LEAD, mensagemDeLead } from '../../utils/crm'

/**
 * Lead do anúncio (hub → CRM): quem chamou no Zap pelo botão do anúncio e não fechou recebe uma
 * mensagem de retomada depois de X horas de conversa parada. Quem manda é o painel do PC da loja,
 * pela fila do Atendimento; as regras estão em supabase/sql/crm-lead-anuncio.sql.
 */

const quando = (d) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function FluxoLeadAnuncio({ periodo }) {
  const [fluxo, setFluxo] = useState(null)
  const [rascunho, setRascunho] = useState(null)
  const [leads, setLeads] = useState(null)
  const [envios, setEnvios] = useState([])
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    const [f, l, e] = await Promise.all([
      supabase.from('crm_fluxos').select('*').eq('id', 'lead_anuncio').single(),
      supabase.rpc('crm_leads_do_anuncio', { p_desde: periodo.ini.toISOString() }),
      supabase.from('crm_envios').select('conversa, status, enviado_em').eq('etapa', 'lead_anuncio'),
    ])
    const erro = f.error || l.error || e.error
    if (erro) { toast.error(erro.message); return }
    setFluxo(f.data)
    setRascunho(r => r ?? structuredClone(f.data.config))
    setLeads((l.data ?? []).sort((a, b) => new Date(b.lead_em) - new Date(a.lead_em)))
    setEnvios(e.data ?? [])
  }, [periodo])

  useEffect(() => { carregar() }, [carregar])

  const numeros = useMemo(() => {
    if (!leads) return null
    const retomada = new Map(envios.filter(e => e.status === 'enviado').map(e => [e.conversa, e.enviado_em]))
    const recebeu = leads.filter(l => retomada.has(l.conversa))
    const voltaram = recebeu.filter(l => l.pedido && new Date(l.pedido_em) > new Date(retomada.get(l.conversa)))
    return {
      leads: leads.length,
      fecharam: leads.filter(l => l.pedido).length,
      valor: leads.reduce((s, l) => s + Number(l.valor || 0), 0),
      receberam: recebeu.length,
      voltaram: voltaram.length,
      retomada,
    }
  }, [leads, envios])

  if (!fluxo || !rascunho || !numeros) return <Loading />

  const salvar = async (mudancas = {}) => {
    setSalvando(true)
    try {
      const { data, error } = await supabase.from('crm_fluxos')
        .update({ config: rascunho, atualizado_em: new Date().toISOString(), ...mudancas })
        .eq('id', fluxo.id).select().single()
      if (error) throw error
      setFluxo(data)
      toast.success('ativo' in mudancas ? (mudancas.ativo ? 'Lead do anúncio ligado. O painel da loja começa a mandar.' : 'Lead do anúncio desligado.') : 'Lead do anúncio salvo.')
    } catch (e) {
      toast.error(e.message || 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  const mudar = (campo, valor) => setRascunho(r => ({ ...r, [campo]: valor }))
  const alterado = JSON.stringify(rascunho) !== JSON.stringify(fluxo.config)
  const taxa = numeros.leads ? Math.round((numeros.fecharam / numeros.leads) * 100) : 0

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cartao titulo="Chamaram pelo anúncio" valor={numeros.leads} detalhe="botão “Quero encomendar um cento”" />
        <Cartao titulo="Viraram pedido" valor={`${numeros.fecharam} (${taxa}%)`} detalhe={formatCurrency(numeros.valor)} destaque />
        <Cartao titulo="Receberam a retomada" valor={numeros.receberam} />
        <Cartao titulo="Fecharam depois dela" valor={`${numeros.voltaram} de ${numeros.receberam}`} />
      </div>

      <Bloco
        titulo="📣 Lead do anúncio"
        subtitulo="Quem chamou pelo anúncio, ficou sem conversa e não pediu recebe uma mensagem, uma vez só. Depois de 2 dias parada a conversa já esfriou e não recebe."
        acao={
          <button type="button" disabled={salvando} onClick={() => salvar({ ativo: !fluxo.ativo })}
            className={`cursor-pointer rounded-full px-4 py-2 text-sm font-bold ring-1 disabled:opacity-60 ${
              fluxo.ativo ? 'bg-green-600 text-white ring-green-700 hover:bg-green-700' : 'bg-white text-text-light ring-border hover:bg-cream'
            }`}>
            {fluxo.ativo ? '● Ligado' : '○ Desligado'}
          </button>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-3">
              <label>
                <span className="mb-1 block text-xs text-text-light">Horas de conversa parada</span>
                <input type="number" min="2" max="72" value={rascunho.horas_sem_conversa}
                  onChange={e => mudar('horas_sem_conversa', Number(e.target.value))}
                  className="w-20 rounded-lg border border-border px-2 py-1.5" />
              </label>
              <label>
                <span className="mb-1 block text-xs text-text-light">Mandar das</span>
                <input type="number" min="0" max="23" value={rascunho.hora_inicio}
                  onChange={e => mudar('hora_inicio', Number(e.target.value))}
                  className="w-16 rounded-lg border border-border px-2 py-1.5" />
              </label>
              <label>
                <span className="mb-1 block text-xs text-text-light">até as (h)</span>
                <input type="number" min="1" max="24" value={rascunho.hora_fim}
                  onChange={e => mudar('hora_fim', Number(e.target.value))}
                  className="w-16 rounded-lg border border-border px-2 py-1.5" />
              </label>
              <label className="min-w-[200px] flex-1">
                <span className="mb-1 block text-xs text-text-light">Texto do botão do anúncio</span>
                <input value={rascunho.gatilho} onChange={e => mudar('gatilho', e.target.value)}
                  className="w-full rounded-lg border border-border px-2 py-1.5" />
              </label>
            </div>
            <textarea rows={8} value={rascunho.mensagem} onChange={e => mudar('mensagem', e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 font-mono text-xs leading-relaxed" />
            <p className="text-xs text-text-light">
              Variáveis: {VARIAVEIS_LEAD.map(v => <span key={v.chave}><code className="font-semibold text-brown">{v.chave}</code> {v.explica}</span>)}
            </p>
          </div>
          <div className="rounded-2xl bg-[#e5ddd5] p-3">
            <div className="ml-auto max-w-[92%] whitespace-pre-wrap rounded-xl rounded-tr-none bg-[#dcf8c6] px-3 py-2 text-sm shadow-sm">
              {mensagemDeLead({ nome: 'Maria Souza' }, rascunho)}
            </div>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={!alterado || salvando} onClick={() => salvar()}
            className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50">
            Salvar
          </button>
          {alterado && (
            <button type="button" onClick={() => setRascunho(structuredClone(fluxo.config))} className="cursor-pointer text-xs text-text-light hover:underline">
              Desfazer
            </button>
          )}
        </div>
      </Bloco>

      <Bloco titulo="Quem chamou pelo anúncio" subtitulo="Do mais novo para o mais antigo. Pedido = mesmo telefone depois de chamar.">
        {leads.length ? (
          <ul className="divide-y divide-border text-sm">
            {leads.map(l => (
              <li key={l.conversa} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="w-24 text-xs text-text-light">{quando(l.lead_em)}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{/\p{L}/u.test(l.nome || '') ? l.nome : l.telefone}</span>
                {l.pedido ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">#{l.pedido} · {formatCurrency(l.valor)}</span>
                ) : numeros.retomada.has(l.conversa) ? (
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">Retomada {quando(numeros.retomada.get(l.conversa))}</span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Sem pedido</span>
                )}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-text-light">Ninguém chamou pelo anúncio no período.</p>}
      </Bloco>
    </div>
  )
}
