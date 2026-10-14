import { useOutletContext } from 'react-router-dom'
import Loading from '../../components/ui/Loading'
import { Bloco, Cartao, GraficoDias, Ranking } from '../../components/hub/HubUi'
import { formatCurrency, formatPercent, CANAIS } from '../../utils/format'
import { variacao, DIAS_SEMANA, TAXA_IFOOD } from '../../utils/hub'
import { rotuloDaOrigem } from '../../services/origem'

/**
 * Vendas: o que vendeu, por onde, quando e para onde. "Fica na loja" desconta a taxa do iFood
 * (23% + 3,2% sobre a cesta); nos outros canais é o próprio total.
 */
export default function HubVendas() {
  const { vendas } = useOutletContext()
  if (!vendas) return <Loading />
  const { atual: a, anterior: b } = vendas

  const canais = Object.entries(vendas.porCanal)
    .map(([k, v]) => ({ k, ...v }))
    .sort((x, y) => y.faturamento - x.faturamento)

  const semana = vendas.porSemana.map((d, i) => ({ nome: DIAS_SEMANA[i], valor: d.faturamento, extra: `${d.pedidos} ped.` }))
  const horas = vendas.porHora
    .map((n, h) => ({ nome: `${h}h às ${h + 1}h`, valor: n, texto: `${n} pedidos` }))
    .filter(h => h.valor > 0)
  const produtos = Object.entries(vendas.porProduto)
    .map(([nome, v]) => ({ nome, valor: v.valor, extra: `${v.quantidade} un.` }))
    .sort((x, y) => y.valor - x.valor)
  const sabores = Object.entries(vendas.porSabor)
    .map(([nome, n]) => ({ nome, valor: n, texto: `${n} un.` }))
    .sort((x, y) => y.valor - x.valor)
  const bairros = Object.entries(vendas.porBairro)
    .map(([nome, n]) => ({ nome, valor: n, texto: `${n} entregas` }))
    .sort((x, y) => y.valor - x.valor)
  const totalEntrega = vendas.porEntrega.entrega + vendas.porEntrega.retirada
  const origens = Object.entries(vendas.porOrigem ?? {})
    .map(([k, v]) => ({
      nome: k === 'sem_registro' ? 'Sem registro (antes de 14/10)' : rotuloDaOrigem({ canal: k }),
      valor: v.faturamento, extra: `${v.pedidos} ped.`,
    }))
    .sort((x, y) => y.valor - x.valor)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cartao titulo="Faturamento" valor={formatCurrency(a.faturamento)} variacao={variacao(a.faturamento, b.faturamento)} destaque />
        <Cartao titulo="Fica na loja" valor={formatCurrency(a.liquido)} variacao={variacao(a.liquido, b.liquido)} detalhe="sem a taxa do iFood" />
        <Cartao titulo="Pedidos" valor={a.pedidos} variacao={variacao(a.pedidos, b.pedidos)} detalhe={vendas.cancelados ? `${vendas.cancelados} cancelados` : null} />
        <Cartao titulo="Ticket médio" valor={formatCurrency(a.ticket)} variacao={variacao(a.ticket, b.ticket)} />
      </div>

      <Bloco titulo="Faturamento por dia" subtitulo="Barras: faturamento. Linha: número de pedidos.">
        <GraficoDias
          dados={vendas.porDia.map(d => ({ data: d.data, barra: d.faturamento, linha: d.pedidos }))}
          nomeBarra="Faturamento" nomeLinha="Pedidos" formatarBarra={formatCurrency} formatarLinha={(v) => `${v} pedidos`}
        />
      </Bloco>

      <Bloco titulo="Por onde vendeu" subtitulo={`No iFood fica ${formatPercent((1 - TAXA_IFOOD) * 100, 1)} da cesta; a entrega não paga taxa.`}>
        {canais.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-text-light">
                  <th className="py-1.5">Canal</th><th className="text-right">Pedidos</th><th className="text-right">Faturamento</th>
                  <th className="text-right">Fica na loja</th><th className="text-right">Ticket</th><th className="text-right">% do total</th>
                </tr>
              </thead>
              <tbody>
                {canais.map(c => (
                  <tr key={c.k} className="border-t border-border">
                    <td className="py-2 font-semibold">{CANAIS[c.k]?.rotulo ?? c.k}</td>
                    <td className="text-right tabular-nums">{c.pedidos}</td>
                    <td className="text-right tabular-nums">{formatCurrency(c.faturamento)}</td>
                    <td className="text-right tabular-nums">{formatCurrency(c.liquido)}</td>
                    <td className="text-right tabular-nums">{formatCurrency(c.faturamento / c.pedidos)}</td>
                    <td className="text-right tabular-nums">{formatPercent((c.faturamento / a.faturamento) * 100, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-text-light">Nenhuma venda no período.</p>}
      </Bloco>

      <Bloco titulo="De onde vieram os pedidos do site" subtitulo="A última origem da visita nos 30 dias antes do pedido: anúncio do Google, busca, Perfil, Instagram ou direto. Registrado desde 14/10.">
        <Ranking itens={origens} formatar={formatCurrency} vazio="Nenhum pedido do site no período." />
      </Bloco>

      <div className="grid gap-5 md:grid-cols-2">
        <Bloco titulo="Dia da semana" subtitulo="Faturamento somado de cada dia no período.">
          <Ranking itens={semana} formatar={formatCurrency} limite={7} />
        </Bloco>
        <Bloco titulo="Horário em que o pedido chega">
          <Ranking itens={[...horas].sort((x, y) => y.valor - x.valor)} limite={8} />
        </Bloco>
        <Bloco titulo="Produtos que mais faturaram">
          <Ranking itens={produtos} formatar={formatCurrency} />
        </Bloco>
        <Bloco titulo="Sabores mais pedidos" subtitulo="Em unidades de salgado.">
          <Ranking itens={sabores} cor="bg-secondary/40" />
        </Bloco>
        <Bloco titulo="Bairros das entregas" subtitulo={totalEntrega ? `${formatPercent((vendas.porEntrega.entrega / totalEntrega) * 100, 0)} dos pedidos foram entrega; o resto, retirada.` : null}>
          <Ranking itens={bairros} cor="bg-festa/15" vazio="Nenhuma entrega no período." />
        </Bloco>
        <Bloco titulo="Reposições" subtitulo="Pedidos refeitos sem cobrança.">
          {vendas.reposicoes.length ? (
            <ul className="space-y-1.5 text-sm">
              {vendas.reposicoes.map(o => (
                <li key={o.id} className="flex justify-between gap-2">
                  <span>#{o.order_number} {o.customer_name} — {o.reposicao_motivo}</span>
                  <span className="shrink-0 tabular-nums">{formatCurrency(o.reposicao_valor || 0)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-text-light">Nenhuma reposição no período. 👏</p>}
        </Bloco>
      </div>
    </div>
  )
}
