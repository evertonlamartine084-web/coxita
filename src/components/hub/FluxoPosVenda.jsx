import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { HiStar } from 'react-icons/hi'
import { supabase } from '../../services/supabase'
import { updateSetting } from '../../services/settings'
import Loading from '../ui/Loading'
import { Bloco, Cartao, Ranking } from './HubUi'
import { formatCurrency, formatPercent } from '../../utils/format'
import { VARIAVEIS_POS_VENDA, mensagemDePosVenda, alertaDeNotaBaixa } from '../../utils/crm'

/**
 * Funil de pós-venda (hub → CRM): pedir a nota → nota alta vai ao Google, nota baixa vira alerta
 * no grupo → convite para a segunda compra. Quem manda é o painel do PC da loja; as regras de
 * quem recebe estão em supabase/crm-pos-venda.sql.
 */

const ETAPAS = [
  {
    chave: 'avaliacao',
    titulo: '1. Pedir a nota',
    explica: 'Depois da entrega, pede a avaliação pelo link do pedido. Uma vez por pessoa a cada 30 dias; não vai para quem já avaliou nem para pedido que teve reposição.',
    tempo: { campo: 'horas_apos', rotulo: 'Horas depois da entrega', min: 1, max: 72 },
  },
  {
    chave: 'alerta',
    titulo: '2. Nota baixa vira alerta',
    explica: 'Nota de 1 a 3 manda um aviso no grupo da loja com o telefone, para alguém ligar. Nota 4 ou 5: a própria página convida a pessoa a avaliar no Google.',
  },
  {
    chave: 'recompra',
    titulo: '3. Segunda compra',
    explica: 'Quem comprou uma vez só e não voltou recebe um convite. Não vai para quem deu nota baixa.',
    tempo: { campo: 'dias_apos', rotulo: 'Dias depois da entrega', min: 3, max: 60 },
    cupom: true,
  },
]

const EXEMPLO = {
  nome: 'Maria Souza', public_token: 'exemplo', order_number: 123, telefone: '(84) 99999-0000',
  rating: 2, comentario: 'Os salgados chegaram frios.',
}

export default function FluxoPosVenda({ periodo }) {
  const [fluxo, setFluxo] = useState(null)
  const [rascunho, setRascunho] = useState(null)
  const [resumo, setResumo] = useState(null)
  const [avaliacoes, setAvaliacoes] = useState([])
  const [linkGoogle, setLinkGoogle] = useState(null)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    const [f, r, a, s] = await Promise.all([
      supabase.from('crm_fluxos').select('*').eq('id', 'pos_venda').single(),
      supabase.rpc('crm_pos_venda_resumo', { p_desde: periodo.ini.toISOString() }),
      supabase.from('reviews').select('*').gte('created_at', periodo.ini.toISOString()).order('created_at', { ascending: false }),
      supabase.from('settings').select('value').eq('key', 'google_avaliacao_url').maybeSingle(),
    ])
    const erro = f.error || r.error || a.error
    if (erro) { toast.error(erro.message); return }
    setFluxo(f.data)
    setRascunho(x => x ?? structuredClone(f.data.config))
    setResumo(r.data)
    setAvaliacoes(a.data ?? [])
    setLinkGoogle(l => l ?? (s.data?.value || ''))
  }, [periodo])

  useEffect(() => { carregar() }, [carregar])

  if (!fluxo || !rascunho || !resumo) return <Loading />

  const salvar = async (mudancas = {}) => {
    setSalvando(true)
    try {
      const { data, error } = await supabase.from('crm_fluxos')
        .update({ config: rascunho, atualizado_em: new Date().toISOString(), ...mudancas })
        .eq('id', fluxo.id).select().single()
      if (error) throw error
      setFluxo(data)
      toast.success('ativo' in mudancas ? (mudancas.ativo ? 'Pós-venda ligado. O painel da loja começa a mandar.' : 'Pós-venda desligado.') : 'Pós-venda salvo.')
    } catch (e) {
      toast.error(e.message || 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  const salvarLinkGoogle = async () => {
    const url = linkGoogle.trim()
    if (url && !/^https:\/\//.test(url)) return toast.error('O link tem que começar com https://')
    try {
      await updateSetting('google_avaliacao_url', url)
      toast.success(url ? 'Link do Google salvo.' : 'Link do Google removido.')
    } catch (e) {
      toast.error(e.message || 'Não foi possível salvar o link.')
    }
  }

  const mudarEtapa = (etapa, campo, valor) => setRascunho(r => ({ ...r, [etapa]: { ...r[etapa], [campo]: valor } }))
  const alterado = JSON.stringify(rascunho) !== JSON.stringify(fluxo.config)
  const taxaNota = resumo.pedidos_de_nota ? (resumo.avaliaram / resumo.pedidos_de_nota) * 100 : null
  const notas = [5, 4, 3, 2, 1].map(n => ({ nome: `${n} ★`, valor: Number(resumo.notas?.[n] ?? 0), texto: `${resumo.notas?.[n] ?? 0}` }))

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cartao titulo="Pedidos de nota" valor={resumo.pedidos_de_nota} detalhe={taxaNota !== null ? `${formatPercent(taxaNota, 0)} avaliaram` : null} />
        <Cartao titulo="Nota média" valor={resumo.nota_media ? `${String(resumo.nota_media).replace('.', ',')} ★` : '—'} detalhe={`${avaliacoes.length} avaliações no período`} destaque />
        <Cartao titulo="Alertas de nota baixa" valor={resumo.alertas} />
        <Cartao titulo="Voltaram a comprar" valor={`${resumo.voltaram} de ${resumo.convites}`} detalhe={resumo.valor_voltou > 0 ? formatCurrency(resumo.valor_voltou) : 'convites de 2ª compra'} />
      </div>

      <Bloco
        titulo="💛 Funil de pós-venda"
        subtitulo="Mensagens ao cliente só no horário abaixo. O alerta de nota baixa vai para o grupo a qualquer hora."
        acao={
          <button type="button" disabled={salvando} onClick={() => salvar({ ativo: !fluxo.ativo })}
            className={`cursor-pointer rounded-full px-4 py-2 text-sm font-bold ring-1 disabled:opacity-60 ${
              fluxo.ativo ? 'bg-green-600 text-white ring-green-700 hover:bg-green-700' : 'bg-white text-text-light ring-border hover:bg-cream'
            }`}>
            {fluxo.ativo ? '● Ligado' : '○ Desligado'}
          </button>
        }
      >
        <div className="mb-4 flex flex-wrap items-end gap-3 text-sm">
          <label>
            <span className="mb-1 block text-xs text-text-light">Mandar das</span>
            <input type="number" min="0" max="23" value={rascunho.hora_inicio}
              onChange={e => setRascunho(r => ({ ...r, hora_inicio: Number(e.target.value) }))}
              className="w-16 rounded-lg border border-border px-2 py-1.5" />
          </label>
          <label>
            <span className="mb-1 block text-xs text-text-light">até as (h)</span>
            <input type="number" min="1" max="24" value={rascunho.hora_fim}
              onChange={e => setRascunho(r => ({ ...r, hora_fim: Number(e.target.value) }))}
              className="w-16 rounded-lg border border-border px-2 py-1.5" />
          </label>
          <label className="min-w-[240px] flex-1">
            <span className="mb-1 block text-xs text-text-light">Link para avaliar no Google (aparece para quem dá 4 ou 5)</span>
            <span className="flex gap-2">
              <input value={linkGoogle} onChange={e => setLinkGoogle(e.target.value)} placeholder="https://g.page/r/…/review"
                className="min-w-0 flex-1 rounded-lg border border-border px-2 py-1.5" />
              <button type="button" onClick={salvarLinkGoogle} className="cursor-pointer rounded-lg px-3 text-xs font-semibold text-primary ring-1 ring-border hover:bg-cream">
                Salvar link
              </button>
            </span>
          </label>
        </div>
        {!linkGoogle && (
          <p className="mb-4 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 ring-1 ring-amber-200">
            Sem o link do Google, quem dá nota alta não é convidado a avaliar lá. Ele fica no Perfil da Empresa → “Pedir avaliações”.
          </p>
        )}

        <div className="space-y-4">
          {ETAPAS.map(et => {
            const cfg = rascunho[et.chave] ?? {}
            return (
              <div key={et.chave} className={`rounded-xl border p-4 ${cfg.ativo ? 'border-border' : 'border-dashed border-border opacity-80'}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="max-w-xl">
                    <p className="font-semibold text-brown">{et.titulo}</p>
                    <p className="text-xs text-text-light">{et.explica}</p>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" checked={!!cfg.ativo} onChange={e => mudarEtapa(et.chave, 'ativo', e.target.checked)} className="size-4" />
                    {cfg.ativo ? 'Ativa' : 'Parada'}
                  </label>
                </div>

                {et.chave === 'alerta' ? (
                  <div className="mt-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-light">Como chega no grupo</p>
                    <div className="whitespace-pre-wrap rounded-xl bg-[#dcf8c6] px-3 py-2 text-sm">{alertaDeNotaBaixa(EXEMPLO)}</div>
                  </div>
                ) : (
                  <div className="mt-3 grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2 text-sm">
                      <div className="flex flex-wrap gap-3">
                        <label>
                          <span className="mb-1 block text-xs text-text-light">{et.tempo.rotulo}</span>
                          <input type="number" min={et.tempo.min} max={et.tempo.max} value={cfg[et.tempo.campo] ?? ''}
                            onChange={e => mudarEtapa(et.chave, et.tempo.campo, Number(e.target.value))}
                            className="w-20 rounded-lg border border-border px-2 py-1.5" />
                        </label>
                        {et.cupom && (
                          <label>
                            <span className="mb-1 block text-xs text-text-light">Cupom (opcional)</span>
                            <input value={cfg.cupom ?? ''} onChange={e => mudarEtapa(et.chave, 'cupom', e.target.value.toUpperCase())} placeholder="VOLTA10"
                              className="w-28 rounded-lg border border-border px-2 py-1.5" />
                          </label>
                        )}
                      </div>
                      <textarea rows={6} value={cfg.mensagem ?? ''} onChange={e => mudarEtapa(et.chave, 'mensagem', e.target.value)}
                        className="w-full rounded-lg border border-border px-3 py-2 font-mono text-xs leading-relaxed" />
                      {et.cupom && cfg.cupom && !(cfg.mensagem ?? '').includes('{cupom}') && (
                        <p className="text-xs text-amber-700">O cupom só aparece se a mensagem tiver {'{cupom}'}. Ele precisa existir em Cupons no painel.</p>
                      )}
                    </div>
                    <div className="rounded-2xl bg-[#e5ddd5] p-3">
                      <div className="ml-auto max-w-[92%] whitespace-pre-wrap rounded-xl rounded-tr-none bg-[#dcf8c6] px-3 py-2 text-sm shadow-sm">
                        {mensagemDePosVenda({ ...EXEMPLO, etapa: et.chave }, cfg)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <p className="mt-3 text-xs text-text-light">
          Variáveis: {VARIAVEIS_POS_VENDA.map(v => <span key={v.chave} className="mr-3 inline-block"><code className="font-semibold text-brown">{v.chave}</code> {v.explica}</span>)}
        </p>
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={!alterado || salvando} onClick={() => salvar()}
            className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50">
            Salvar pós-venda
          </button>
          {alterado && (
            <button type="button" onClick={() => setRascunho(structuredClone(fluxo.config))} className="cursor-pointer text-xs text-text-light hover:underline">
              Desfazer
            </button>
          )}
        </div>
      </Bloco>

      <div className="grid gap-5 md:grid-cols-2">
        <Bloco titulo="Notas no período">
          <Ranking itens={notas} cor="bg-secondary/40" limite={5} vazio="Nenhuma nota ainda." />
        </Bloco>
        <Bloco titulo="O que disseram" subtitulo="Avaliações mais recentes.">
          {avaliacoes.length ? (
            <ul className="space-y-3 text-sm">
              {avaliacoes.slice(0, 12).map(a => (
                <li key={a.id} className="border-b border-border pb-2 last:border-0">
                  <span className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(n => <HiStar key={n} className={n <= a.rating ? 'text-secondary' : 'text-border'} />)}
                    <span className="ml-2 font-semibold">{a.customer_name}</span>
                    <span className="ml-auto text-xs text-text-light">#{a.order_number} · {new Date(a.created_at).toLocaleDateString('pt-BR')}</span>
                  </span>
                  {a.comment && <p className="mt-1 italic text-text-light">“{a.comment}”</p>}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-text-light">Nenhuma avaliação no período.</p>}
        </Bloco>
      </div>
    </div>
  )
}
