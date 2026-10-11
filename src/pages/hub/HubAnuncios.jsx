import { useOutletContext } from 'react-router-dom'
import Loading from '../../components/ui/Loading'
import { Bloco, Cartao, GraficoDias, SemDados } from '../../components/hub/HubUi'
import { normalizarData, diasDoPeriodo, formatarMoeda, formatarNumero } from '../../utils/hub'

/**
 * Anúncios do Google Ads, lidos pelo Analytics (as contas estão vinculadas): gasto, cliques e
 * conversões por campanha. Conversão aqui é evento principal do site: pedido feito ou clique no
 * WhatsApp. O custo por pedido usa os pedidos do site no período, que é o que o anúncio traz.
 */
export default function HubAnuncios() {
  const { periodo, vendas, google, carregandoGoogle } = useOutletContext()
  if (!google || !vendas || (carregandoGoogle && !google.analytics)) return <Loading />
  const ga = google.analytics
  if (!ga) return <SemDados fonte="Google Analytics" erro={google.erro || google.erros?.join(' ')} />

  const moeda = (v) => formatarMoeda(v, ga.moeda)
  const campanhas = ga.campanhas.filter(c => c.sessionGoogleAdsCampaignName !== '(not set)' && (c.advertiserAdCost > 0 || c.advertiserAdClicks > 0))
  const soma = (k) => campanhas.reduce((s, c) => s + (c[k] || 0), 0)
  const gasto = soma('advertiserAdCost')
  const cliques = soma('advertiserAdClicks')
  const conversoes = soma('keyEvents')
  const porDia = new Map()
  for (const d of ga.anunciosPorDia) {
    const dia = porDia.get(normalizarData(d.date)) ?? { advertiserAdCost: 0, advertiserAdClicks: 0 }
    dia.advertiserAdCost += d.advertiserAdCost
    dia.advertiserAdClicks += d.advertiserAdClicks
    porDia.set(normalizarData(d.date), dia)
  }
  const grafico = diasDoPeriodo(periodo).map(data => ({
    data, barra: porDia.get(data)?.advertiserAdCost ?? 0, linha: porDia.get(data)?.advertiserAdClicks ?? 0,
  }))

  return (
    <div className="space-y-5">
      {ga.moeda !== 'BRL' && (
        <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
          O Analytics está configurado em {ga.moeda}: os valores abaixo estão nessa moeda. Dá para trocar para real em
          Administrador → Detalhes da propriedade → Moeda.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cartao titulo="Gasto" valor={moeda(gasto)} destaque detalhe={gasto === 0 ? 'nenhuma campanha rodando' : null} />
        <Cartao titulo="Cliques" valor={formatarNumero(cliques)} detalhe={cliques ? `${moeda(gasto / cliques)} por clique` : null} />
        <Cartao titulo="Conversões" valor={formatarNumero(conversoes)} detalhe={conversoes ? `${moeda(gasto / conversoes)} cada` : 'pedido ou WhatsApp'} />
        <Cartao
          titulo="Custo por pedido do site"
          valor={vendas.atual.doSite && gasto ? moeda(gasto / vendas.atual.doSite) : '—'}
          detalhe={`${vendas.atual.doSite} pedidos pelo site`}
        />
      </div>

      {gasto > 0 ? (
        <>
          <Bloco titulo="Gasto por dia" subtitulo="Barras: gasto. Linha: cliques no anúncio.">
            <GraficoDias dados={grafico} nomeBarra="Gasto" nomeLinha="Cliques" formatarBarra={moeda} formatarLinha={(v) => `${v} cliques`} />
          </Bloco>

          <Bloco titulo="Campanhas" subtitulo="Conversões aqui são as que o Analytics ligou à campanha. O próprio Google Ads costuma contar mais (ele também conta quem viu o anúncio e voltou depois).">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-text-light">
                    <th className="py-1.5">Campanha</th><th className="text-right">Gasto</th><th className="text-right">Aparições</th>
                    <th className="text-right">Cliques</th><th className="text-right">Por clique</th><th className="text-right">Conversões</th>
                  </tr>
                </thead>
                <tbody>
                  {campanhas.map(c => (
                    <tr key={c.sessionGoogleAdsCampaignName} className="border-t border-border">
                      <td className="py-2 font-semibold">{c.sessionGoogleAdsCampaignName}</td>
                      <td className="text-right tabular-nums">{moeda(c.advertiserAdCost)}</td>
                      <td className="text-right tabular-nums">{formatarNumero(c.advertiserAdImpressions)}</td>
                      <td className="text-right tabular-nums">{formatarNumero(c.advertiserAdClicks)}</td>
                      <td className="text-right tabular-nums">{c.advertiserAdClicks ? moeda(c.advertiserAdCost / c.advertiserAdClicks) : '—'}</td>
                      <td className="text-right tabular-nums">{c.keyEvents}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Bloco>
        </>
      ) : (
        <Bloco titulo="Sem anúncio no período">
          <p className="text-sm text-text-light">
            Nenhuma campanha gastou neste período. Quando voltarem a rodar, o gasto, os cliques e o custo por pedido aparecem
            aqui sozinhos. Para ver campanhas antigas, escolha um período maior.
          </p>
        </Bloco>
      )}
    </div>
  )
}
