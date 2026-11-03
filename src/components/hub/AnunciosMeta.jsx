import { useCallback, useEffect, useState } from 'react'
import { HiRefresh } from 'react-icons/hi'
import { supabase } from '../../services/supabase'
import Loading from '../ui/Loading'
import { Bloco, Cartao, GraficoDias } from './HubUi'
import { diasDoPeriodo, formatarMoeda, formatarNumero } from '../../utils/hub'
import { julgarAnuncios } from '../../utils/vigiaMeta'

/**
 * Anúncios da Meta no hub: gasto e conversas no Zap (função hub-meta, que lê a conta de anúncios
 * Coxelli só para ver) e os pedidos de quem chamou pelo botão do anúncio (crm_leads_do_anuncio,
 * o mesmo casamento por telefone do funil "Lead do anúncio").
 */

const moeda = (v) => formatarMoeda(v, 'BRL')
const VEREDITO = {
  matar: { nome: 'desligar', cor: 'bg-red-100 text-red-700' },
  vencendo: { nome: 'ganhando', cor: 'bg-green-100 text-green-700' },
  testando: { nome: 'testando', cor: 'bg-amber-100 text-amber-800' },
}

export default function AnunciosMeta({ periodo }) {
  const [meta, setMeta] = useState(null)
  const [leads, setLeads] = useState(null)
  const [teste, setTeste] = useState(null)
  const [carregando, setCarregando] = useState(false)

  const buscar = useCallback(async (atualizar = false) => {
    setCarregando(true)
    try {
      const [m, l] = await Promise.all([
        supabase.functions.invoke('hub-meta', { body: { inicio: periodo.inicio, fim: periodo.final, atualizar } }),
        supabase.rpc('crm_leads_do_anuncio', { p_desde: periodo.ini.toISOString() }),
      ])
      // erro da função vem com a mensagem dela no corpo (ex.: token ainda não gravado)
      const erroMeta = m.error ? (await m.error.context?.json?.().catch(() => null))?.erro || m.error.message : null
      setMeta(erroMeta ? { erro: erroMeta } : m.data)
      setLeads(l.data ?? [])
      // teste de criativos: os mesmos números que o vigia usa no grupo, desde o início do teste
      const { data: vigia } = await supabase.from('crm_fluxos').select('ativo, config').eq('id', 'vigia_meta').maybeSingle()
      if (vigia) {
        const hoje = new Date().toLocaleDateString('sv-SE')
        const t = await supabase.functions.invoke('hub-meta', { body: { inicio: vigia.config.inicio, fim: hoje, atualizar } })
        setTeste(t.data?.anuncios ? { ...vigia, julgados: julgarAnuncios(t.data.anuncios, vigia.config) } : null)
      }
    } finally {
      setCarregando(false)
    }
  }, [periodo])

  useEffect(() => { buscar() }, [buscar])

  if (!meta || !leads) return <Loading />

  const atualizar = (
    <button type="button" onClick={() => buscar(true)} disabled={carregando}
      className="flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary ring-1 ring-border hover:bg-cream disabled:opacity-50">
      <HiRefresh className={carregando ? 'animate-spin' : ''} /> Atualizar
    </button>
  )

  if (meta.erro) {
    return (
      <Bloco titulo="📱 Meta (Instagram e Facebook)" acao={atualizar}>
        <p className="text-sm text-text-light">Não deu para ler a Meta: {meta.erro}</p>
      </Bloco>
    )
  }

  const soma = (lista, k) => lista.reduce((s, x) => s + (x[k] || 0), 0)
  const gasto = soma(meta.porDia, 'gasto')
  const conversas = soma(meta.porDia, 'conversas')
  const hoje = meta.porDia.find(d => d.data === periodo.final) ?? { gasto: 0, conversas: 0 }
  const pedidos = leads.filter(l => l.pedido)
  const valorPedidos = pedidos.reduce((s, l) => s + Number(l.valor || 0), 0)
  const dia = new Map(meta.porDia.map(d => [d.data, d]))
  const grafico = diasDoPeriodo(periodo).map(data => ({ data, barra: dia.get(data)?.gasto ?? 0, linha: dia.get(data)?.conversas ?? 0 }))
  const atualizadoEm = meta.atualizadoEm ? new Date(meta.atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-sans text-lg font-bold text-brown">📱 Meta (Instagram e Facebook)</h2>
        <span className="flex items-center gap-2 text-xs text-text-light">
          {atualizadoEm && `lido às ${atualizadoEm}`} {atualizar}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cartao titulo="Gasto no período" valor={moeda(gasto)} destaque detalhe={`hoje ${moeda(hoje.gasto)}`} />
        <Cartao titulo="Conversas no Zap" valor={formatarNumero(conversas)}
          detalhe={conversas ? `${moeda(gasto / conversas)} cada · hoje ${hoje.conversas}` : 'nenhuma ainda'} />
        <Cartao titulo="Pedidos do anúncio" valor={pedidos.length}
          detalhe={pedidos.length ? `${moeda(valorPedidos)} · de ${leads.length} que chamaram` : `${leads.length} chamaram pelo botão`} />
        <Cartao titulo="Custo por pedido" valor={pedidos.length && gasto ? moeda(gasto / pedidos.length) : '—'}
          detalhe={valorPedidos && gasto ? `cada R$ 1 de anúncio trouxe ${moeda(valorPedidos / gasto)}` : null} />
      </div>

      {gasto > 0 && (
        <Bloco titulo="Gasto por dia" subtitulo="Barras: gasto. Linha: conversas iniciadas no Zap pelo anúncio.">
          <GraficoDias dados={grafico} nomeBarra="Gasto" nomeLinha="Conversas" formatarBarra={moeda} formatarLinha={(v) => `${v} conversas`} />
        </Bloco>
      )}

      {teste?.julgados.length > 0 && (
        <Bloco titulo="🧪 Teste de criativos"
          subtitulo={`Anúncios no ar desde ${new Date(`${teste.config.inicio}T12:00:00`).toLocaleDateString('pt-BR')}, do mais barato por conversa ao mais caro. ${teste.ativo ? 'O vigia só avisa no grupo da loja quando um deve ser desligado.' : 'Vigia desligado.'}`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-text-light">
                  <th className="py-1.5">Anúncio</th><th className="text-right">Gasto</th><th className="text-right">Conversas</th>
                  <th className="text-right">Por conversa</th><th className="pl-3">Vigia</th>
                </tr>
              </thead>
              <tbody>
                {teste.julgados.map(a => (
                  <tr key={a.anuncio_id} className="border-t border-border">
                    <td className="py-2 font-semibold">{a.anuncio}</td>
                    <td className="text-right tabular-nums">{moeda(a.gasto)}</td>
                    <td className="text-right tabular-nums">{a.conversas}</td>
                    <td className="text-right tabular-nums">{a.custo ? moeda(a.custo) : '—'}</td>
                    <td className="pl-3 text-xs">
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${VEREDITO[a.veredito].cor}`}>{VEREDITO[a.veredito].nome}</span>
                      <span className="ml-1.5 text-text-light">{a.motivo}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Bloco>
      )}

      {meta.campanhas.length > 0 && (
        <Bloco titulo="Campanhas da Meta" subtitulo="Pedidos: quem chamou pelo botão do anúncio e fez pedido com o mesmo telefone.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-text-light">
                  <th className="py-1.5">Campanha</th><th className="text-right">Gasto</th><th className="text-right">Aparições</th>
                  <th className="text-right">Conversas</th><th className="text-right">Por conversa</th>
                </tr>
              </thead>
              <tbody>
                {meta.campanhas.map(c => (
                  <tr key={c.campanha} className="border-t border-border">
                    <td className="py-2 font-semibold">{c.campanha}</td>
                    <td className="text-right tabular-nums">{moeda(c.gasto)}</td>
                    <td className="text-right tabular-nums">{formatarNumero(c.impressoes)}</td>
                    <td className="text-right tabular-nums">{c.conversas}</td>
                    <td className="text-right tabular-nums">{c.conversas ? moeda(c.gasto / c.conversas) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Bloco>
      )}
    </div>
  )
}
