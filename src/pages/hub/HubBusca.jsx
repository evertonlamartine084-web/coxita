import { useOutletContext } from 'react-router-dom'
import Loading from '../../components/ui/Loading'
import { Bloco, Cartao, GraficoDias, Ranking, SemDados } from '../../components/hub/HubUi'
import { formatPercent } from '../../utils/format'
import { variacao, diasDoPeriodo, formatarNumero, rotuloDia, APARELHOS } from '../../utils/hub'

const posicao = (p) => (p ? p.toFixed(1).replace('.', ',') : '—')

/**
 * Google Busca (Search Console): quando a Coxelli aparece na pesquisa grátis do Google, o que a
 * pessoa digitou, a posição e quantos clicaram. O Google libera esses dados com uns 2 dias de
 * atraso, por isso os últimos dias do gráfico ficam vazios.
 */
export default function HubBusca() {
  const { periodo, google, carregandoGoogle } = useOutletContext()
  if (!google || (carregandoGoogle && !google.busca)) return <Loading />
  const sc = google.busca
  if (!sc) return <SemDados fonte="Search Console" erro={google.erro || google.erros?.join(' ')} />

  const t = sc.total ?? { cliques: 0, aparicoes: 0, ctr: 0, posicao: 0 }
  const t0 = sc.totalAnterior ?? { cliques: 0, aparicoes: 0, ctr: 0, posicao: 0 }
  const porDia = new Map(sc.porDia.map(d => [d.chave, d]))
  const ultimoDia = sc.porDia.map(d => d.chave).sort().at(-1)
  const grafico = diasDoPeriodo(periodo).map(data => ({
    data, barra: porDia.get(data)?.cliques ?? 0, linha: porDia.get(data)?.aparicoes ?? 0,
  }))
  const caminho = (url) => url.replace('https://coxelli.com.br', '') || '/'

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cartao titulo="Cliques" valor={formatarNumero(t.cliques)} variacao={variacao(t.cliques, t0.cliques)} destaque />
        <Cartao titulo="Aparições" valor={formatarNumero(t.aparicoes)} variacao={variacao(t.aparicoes, t0.aparicoes)} detalhe="vezes que apareceu" />
        <Cartao titulo="Taxa de clique" valor={formatPercent((t.ctr || 0) * 100)} variacao={variacao(t.ctr, t0.ctr)} />
        <Cartao titulo="Posição média" valor={posicao(t.posicao)} variacao={t0.posicao ? variacao(t.posicao, t0.posicao) : null} menorMelhor detalhe="1 = primeiro lugar" />
      </div>

      <Bloco
        titulo="Cliques e aparições por dia"
        subtitulo={`Barras: cliques. Linha: aparições. O Google entrega com ~2 dias de atraso${ultimoDia ? ` (último dia com dado: ${rotuloDia(ultimoDia)})` : ''}.`}
      >
        <GraficoDias dados={grafico} nomeBarra="Cliques" nomeLinha="Aparições" formatarBarra={(v) => `${v} cliques`} formatarLinha={(v) => `${v} aparições`} />
      </Bloco>

      <Bloco titulo="O que as pessoas pesquisaram" subtitulo="Pesquisas em que a Coxelli apareceu. Posição alta (perto de 1) com poucos cliques pede título melhor; posição baixa pede conteúdo.">
        {sc.consultas.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-text-light">
                  <th className="py-1.5">Pesquisa</th><th className="text-right">Cliques</th><th className="text-right">Aparições</th><th className="text-right">Posição</th>
                </tr>
              </thead>
              <tbody>
                {sc.consultas.map(c => (
                  <tr key={c.chave} className="border-t border-border">
                    <td className="py-1.5">{c.chave}</td>
                    <td className="text-right tabular-nums">{c.cliques}</td>
                    <td className="text-right tabular-nums">{c.aparicoes}</td>
                    <td className={`text-right tabular-nums ${c.posicao <= 3 ? 'font-semibold text-green-700' : c.posicao <= 10 ? '' : 'text-text-light'}`}>{posicao(c.posicao)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-text-light">Sem pesquisas no período (ou o Google ainda não liberou).</p>}
      </Bloco>

      <div className="grid gap-5 md:grid-cols-2">
        <Bloco titulo="Páginas que aparecem no Google">
          <Ranking
            itens={sc.paginas.map(p => ({ nome: caminho(p.chave), valor: p.aparicoes, texto: `${p.aparicoes}`, extra: `${p.cliques} cliques · pos. ${posicao(p.posicao)}` }))}
            cor="bg-accent/15"
          />
        </Bloco>
        <Bloco titulo="Aparelho de quem pesquisou">
          <Ranking itens={sc.aparelhos.map(a => ({ nome: APARELHOS[a.chave] ?? a.chave, valor: a.aparicoes, extra: `${a.cliques} cliques` }))} cor="bg-festa/15" />
        </Bloco>
      </div>
    </div>
  )
}
