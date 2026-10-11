import { useOutletContext } from 'react-router-dom'
import Loading from '../../components/ui/Loading'
import { Bloco, Cartao, GraficoDias, SemDados } from '../../components/hub/HubUi'
import { formatCurrency, formatPercent } from '../../utils/format'
import { variacao, normalizarData, formatarMoeda, formatarNumero, CANAIS_GA, DIAS_SEMANA } from '../../utils/hub'

/**
 * Resumo: o período em oito números (vendas em cima, Google embaixo), o gráfico de vendas com as
 * visitas por cima e uma lista curta do que chama atenção, escrita a partir dos próprios dados.
 */
export default function HubResumo() {
  const { vendas, clientes, google, carregandoGoogle } = useOutletContext()
  if (!vendas) return <Loading />

  const { atual: a, anterior: b } = vendas
  const ga = google?.analytics
  const sc = google?.busca
  const tot = (periodo) => ga?.totais?.find(t => (t.periodo ?? 0) === periodo)
  const visitas = tot(0)?.sessions ?? null
  const visitasAnt = tot(1)?.sessions ?? null
  const gasto = (ga?.campanhas ?? []).reduce((s, c) => s + c.advertiserAdCost, 0)
  const conversao = visitas ? (a.doSite / visitas) * 100 : null
  const conversaoAnt = visitasAnt ? (b.doSite / visitasAnt) * 100 : null

  const visitasPorDia = new Map((ga?.porDia ?? []).map(d => [normalizarData(d.date), d.sessions]))
  const grafico = vendas.porDia.map(d => ({ data: d.data, barra: d.faturamento, linha: ga ? (visitasPorDia.get(d.data) ?? 0) : undefined }))

  const destaques = montarDestaques({ vendas, clientes, ga, sc })

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cartao titulo="Faturamento" valor={formatCurrency(a.faturamento)} variacao={variacao(a.faturamento, b.faturamento)} destaque />
        <Cartao titulo="Pedidos" valor={a.pedidos} variacao={variacao(a.pedidos, b.pedidos)} />
        <Cartao titulo="Ticket médio" valor={formatCurrency(a.ticket)} variacao={variacao(a.ticket, b.ticket)} />
        <Cartao titulo="Clientes novos" valor={a.novos} variacao={variacao(a.novos, b.novos)} detalhe={`${a.voltaram} voltaram`} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cartao titulo="Visitas no site" valor={visitas === null ? (carregandoGoogle ? '…' : '—') : formatarNumero(visitas)} variacao={visitas === null ? undefined : variacao(visitas, visitasAnt)} />
        <Cartao
          titulo="Visita que vira pedido"
          valor={conversao === null ? '—' : formatPercent(conversao)}
          variacao={conversao === null ? undefined : variacao(conversao, conversaoAnt)}
          detalhe={`${a.doSite} pedidos pelo site`}
        />
        <Cartao
          titulo="Cliques no Google"
          valor={sc?.total ? formatarNumero(sc.total.cliques) : (carregandoGoogle ? '…' : '—')}
          variacao={sc?.total ? variacao(sc.total.cliques, sc.totalAnterior?.cliques ?? 0) : undefined}
          detalhe={sc?.total ? `${formatarNumero(sc.total.aparicoes)} aparições` : null}
        />
        <Cartao
          titulo="Gasto com anúncios"
          valor={ga ? formatarMoeda(gasto, ga.moeda) : (carregandoGoogle ? '…' : '—')}
          detalhe={ga && gasto === 0 ? 'campanhas pausadas' : null}
          menorMelhor
        />
      </div>

      {google?.erro && <SemDados fonte="Google" erro={google.erro} />}

      <Bloco titulo="Vendas e visitas por dia" subtitulo="Barras: faturamento do dia. Linha: visitas no site.">
        <GraficoDias dados={grafico} nomeBarra="Faturamento" nomeLinha="Visitas" formatarBarra={formatCurrency} formatarLinha={(v) => `${v} visitas`} />
      </Bloco>

      <Bloco titulo="O que chama atenção">
        {destaques.length ? (
          <ul className="space-y-2 text-sm">
            {destaques.map((d, i) => <li key={i} className="flex gap-2"><span aria-hidden="true">{d.icone}</span><span>{d.texto}</span></li>)}
          </ul>
        ) : <p className="text-sm text-text-light">Pouco movimento no período para tirar conclusão.</p>}
      </Bloco>
    </div>
  )
}

function montarDestaques({ vendas, clientes, ga, sc }) {
  const out = []
  const { atual: a, anterior: b } = vendas

  const dv = variacao(a.faturamento, b.faturamento)
  if (dv !== null && dv !== Infinity && Math.abs(dv) >= 10) {
    out.push({ icone: dv > 0 ? '📈' : '📉', texto: `O faturamento ${dv > 0 ? 'subiu' : 'caiu'} ${formatPercent(Math.abs(dv), 0)} em relação ao período anterior (${formatCurrency(b.faturamento)} → ${formatCurrency(a.faturamento)}).` })
  }

  const canais = Object.entries(vendas.porCanal).sort((x, y) => y[1].faturamento - x[1].faturamento)
  if (canais.length && a.faturamento > 0) {
    const [nome, v] = canais[0]
    const rot = { site: 'site', whatsapp: 'WhatsApp', ifood: 'iFood', balcao: 'balcão' }[nome] ?? nome
    out.push({ icone: '🛒', texto: `${formatPercent((v.faturamento / a.faturamento) * 100, 0)} do faturamento veio do ${rot}.` })
  }

  const semana = vendas.porSemana.map((d, i) => ({ ...d, i })).sort((x, y) => y.faturamento - x.faturamento)
  if (semana[0]?.pedidos > 1) out.push({ icone: '📅', texto: `${DIAS_SEMANA[semana[0].i]} foi o dia que mais vendeu (${formatCurrency(semana[0].faturamento)} em ${semana[0].pedidos} pedidos).` })

  if (ga?.canais?.length) {
    const total = ga.canais.reduce((s, c) => s + c.sessions, 0)
    const top = ga.canais[0]
    if (total > 0) out.push({ icone: '🌐', texto: `A maior parte das visitas veio de ${CANAIS_GA[top.sessionDefaultChannelGroup] ?? top.sessionDefaultChannelGroup}: ${formatPercent((top.sessions / total) * 100, 0)}.` })
  }

  const ev = (nome) => ga?.funil?.find(f => f.eventName === nome && (f.periodo ?? 0) === 0)?.totalUsers ?? 0
  if (ev('add_to_cart') >= 3) {
    const compraram = ev('purchase')
    out.push({ icone: '🧺', texto: `${ev('add_to_cart')} pessoas puseram algo no carrinho e ${compraram} finalizaram a compra no site. Quem desiste no meio é oportunidade.` })
  }

  const top = [...(sc?.consultas ?? [])].sort((x, y) => y.aparicoes - x.aparicoes)[0]
  if (top?.aparicoes > 1) out.push({ icone: '🔎', texto: `A pesquisa que mais mostrou a Coxelli no Google foi “${top.chave}” (${top.aparicoes} aparições, posição ${top.posicao.toFixed(1).replace('.', ',')}).` })

  if (clientes?.sumidos?.length) {
    out.push({ icone: '💬', texto: `${clientes.sumidos.length} clientes que já compraram mais de uma vez estão há mais de 30 dias sem pedir. A lista está em Clientes.` })
  }

  if (vendas.reposicoes.length) {
    const custo = vendas.reposicoes.reduce((s, o) => s + Number(o.reposicao_valor || 0), 0)
    out.push({ icone: '⚠️', texto: `${vendas.reposicoes.length} ${vendas.reposicoes.length === 1 ? 'reposição' : 'reposições'} no período${custo ? `, valendo ${formatCurrency(custo)}` : ''}.` })
  }
  return out
}
