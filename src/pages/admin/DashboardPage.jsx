import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getOrders } from '../../services/orders'
import { formatCurrency, STATUS_LABELS, STATUS_COLORS } from '../../utils/format'
import Badge from '../../components/ui/Badge'
import Loading from '../../components/ui/Loading'
import AppInstallsCard from '../../components/admin/AppInstallsCard'

/**
 * Painel de números da loja.
 *
 * Um filtro de período só, no topo, vale para tudo abaixo dele: faturamento, gráfico, formas de
 * pagamento e sabores. "Em aberto" e "Próximos agendados" não dependem do período — são o que
 * ainda falta entregar.
 *
 * Venda é todo pedido que não foi cancelado, pela data em que foi feito (a mesma conta da tela
 * de pedidos). Encomenda agendada conta no dia em que foi fechada, não no da retirada.
 */

const PERIODOS = [
  { key: 'hoje', label: 'Hoje' },
  { key: '7d', label: '7 dias', dias: 7 },
  { key: '30d', label: '30 dias', dias: 30 },
  { key: 'tudo', label: 'Desde o início' },
]

const PAGAMENTO = {
  dinheiro: 'Dinheiro',
  pix: 'Pix na loja',
  pix_online: 'Pix pelo site',
  credito: 'Crédito',
  debito: 'Débito',
}

const ABERTOS = ['pendente', 'em_preparo', 'saiu_entrega']
const DIA = 24 * 60 * 60 * 1000

const inicioDoDia = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const somaTotal = (lista) => lista.reduce((s, o) => s + Number(o.total), 0)
const diaMes = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

export default function DashboardPage() {
  const [pedidos, setPedidos] = useState(null)
  const [erro, setErro] = useState(null)
  const [periodo, setPeriodo] = useState('7d')

  useEffect(() => {
    getOrders().then(setPedidos).catch(e => setErro(e.message))
  }, [])

  const dados = useMemo(() => (pedidos ? calcular(pedidos, periodo) : null), [pedidos, periodo])

  if (erro) return <p className="text-sm text-red-600">Não foi possível carregar os pedidos: {erro}</p>
  if (!dados) return <Loading />

  const { atual, anterior, rotuloAnterior, barras, pagamentos, sabores, abertos, agendados, deHoje, primeiraVenda } = dados
  const faturado = somaTotal(atual)
  const ticket = atual.length ? faturado / atual.length : 0
  const aEntregar = somaTotal(atual.filter(o => ABERTOS.includes(o.status)))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div role="tablist" aria-label="Período" className="flex w-full gap-1 rounded-lg bg-white p-1 shadow-sm ring-1 ring-border sm:w-auto">
          {PERIODOS.map(p => (
            <button
              key={p.key}
              role="tab"
              aria-selected={periodo === p.key}
              onClick={() => setPeriodo(p.key)}
              className={`flex-1 cursor-pointer whitespace-nowrap rounded-md px-2 py-1.5 text-sm font-semibold transition-colors sm:flex-none sm:px-3 ${
                periodo === p.key ? 'bg-primary text-white' : 'text-text-light hover:bg-bg-warm'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Números do período */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:gap-4">
        <div className="col-span-2 rounded-xl border border-border bg-white p-5 lg:col-span-1">
          <p className="text-sm text-text-light">Faturamento</p>
          <p className="mt-1 text-4xl font-bold text-text">{formatCurrency(faturado)}</p>
          <Comparacao atual={faturado} anterior={anterior === null ? null : somaTotal(anterior)} rotulo={rotuloAnterior} />
          {aEntregar > 0 && (
            <p className="mt-1 text-sm text-text-light">inclui {formatCurrency(aEntregar)} ainda não entregue</p>
          )}
        </div>
        <Numero rotulo="Pedidos" valor={atual.length}
          nota={anterior === null ? `desde ${diaMes(primeiraVenda)}` : `${anterior.length} ${rotuloAnterior}`} />
        <Numero rotulo="Ticket médio" valor={formatCurrency(ticket)} nota="por pedido" />
        <Numero largo rotulo="Em aberto" valor={formatCurrency(somaTotal(abertos))}
          nota={`${abertos.length} ${abertos.length === 1 ? 'pedido ainda não entregue' : 'pedidos ainda não entregues'}`} />
      </section>

      <GraficoVendas barras={barras} porHora={periodo === 'hoje'} />

      <section className="grid gap-6 lg:grid-cols-2">
        <Ranking
          titulo="Como pagaram"
          subtitulo="Valor no período"
          itens={pagamentos}
          formatar={v => formatCurrency(v)}
          extra={item => `${item.pedidos} ${item.pedidos === 1 ? 'pedido' : 'pedidos'}`}
          vazio="Nenhuma venda no período."
        />
        <Ranking
          titulo="Sabores mais pedidos"
          subtitulo="Unidades no período"
          itens={sabores}
          formatar={v => `${v.toLocaleString('pt-BR')} un.`}
          vazio="Nenhum sabor vendido no período."
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <ListaPedidos titulo="Próximos agendados" pedidos={agendados} mostrarAgenda
          vazio="Nenhuma encomenda agendada." />
        <ListaPedidos titulo="Pedidos de hoje" pedidos={deHoje} vazio="Nenhum pedido hoje ainda." />
      </section>

      <AppInstallsCard />
    </div>
  )
}

function calcular(pedidos, periodo) {
  const validos = pedidos.filter(o => o.status !== 'cancelado')
  const agora = new Date()
  const hoje = inicioDoDia(agora)
  const primeiraVenda = validos.length
    ? inicioDoDia(new Date(Math.min(...validos.map(o => new Date(o.created_at)))))
    : hoje

  const entre = (ini, fim) => validos.filter(o => {
    const d = new Date(o.created_at)
    return d >= ini && d < fim
  })

  let inicio, anterior = null, rotuloAnterior = ''
  if (periodo === 'hoje') {
    inicio = hoje
    // ontem até a mesma hora: comparar o dia inteiro de ontem com meia manhã de hoje engana
    anterior = entre(new Date(hoje - DIA), new Date(agora - DIA))
    rotuloAnterior = 'ontem até esta hora'
  } else if (periodo === 'tudo') {
    inicio = primeiraVenda
  } else {
    const dias = PERIODOS.find(p => p.key === periodo).dias
    inicio = new Date(hoje - (dias - 1) * DIA)
    anterior = entre(new Date(inicio - dias * DIA), inicio)
    rotuloAnterior = `nos ${dias} dias anteriores`
  }
  const atual = entre(inicio, new Date(+agora + 1))

  // barras: por hora no "hoje", por dia no resto
  const barras = []
  if (periodo === 'hoje') {
    const horas = atual.map(o => new Date(o.created_at).getHours())
    const primeira = Math.min(8, ...horas)
    const ultima = Math.max(22, ...horas)
    for (let h = primeira; h <= ultima; h++) {
      const daHora = atual.filter(o => new Date(o.created_at).getHours() === h)
      barras.push({ rotulo: `${h}h`, completo: `${h}h às ${h + 1}h`, valor: somaTotal(daHora), pedidos: daHora.length })
    }
  } else {
    for (let d = new Date(inicio); d <= hoje; d = new Date(+d + DIA)) {
      const doDia = entre(d, new Date(+d + DIA))
      barras.push({
        rotulo: diaMes(d),
        completo: d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
        valor: somaTotal(doDia),
        pedidos: doDia.length,
      })
    }
  }

  const porPagamento = {}
  const porSabor = {}
  for (const o of atual) {
    const chave = o.payment_method || 'outro'
    porPagamento[chave] ??= { nome: PAGAMENTO[chave] ?? chave, valor: 0, pedidos: 0 }
    porPagamento[chave].valor += Number(o.total)
    porPagamento[chave].pedidos += 1
    for (const item of o.order_items ?? []) {
      for (const f of item.order_item_flavors ?? []) {
        porSabor[f.flavor_name] = (porSabor[f.flavor_name] ?? 0) + f.quantity * (item.quantity || 1)
      }
    }
  }

  const abertos = pedidos.filter(o => ABERTOS.includes(o.status))
  const agendados = abertos
    .filter(o => o.scheduled_for && new Date(o.scheduled_for) >= hoje)
    .sort((a, b) => new Date(a.scheduled_for) - new Date(b.scheduled_for))
  const deHoje = pedidos.filter(o => new Date(o.created_at) >= hoje)

  return {
    atual,
    anterior,
    rotuloAnterior,
    barras,
    pagamentos: Object.values(porPagamento).sort((a, b) => b.valor - a.valor),
    sabores: Object.entries(porSabor)
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8),
    abertos,
    agendados,
    deHoje,
    primeiraVenda,
  }
}

function Comparacao({ atual, anterior, rotulo }) {
  if (anterior === null) return <p className="mt-1 text-sm text-text-light">Tudo o que já foi vendido</p>
  if (anterior === 0) {
    return <p className="mt-1 text-sm text-text-light">Sem vendas {rotulo}</p>
  }
  const variacao = ((atual - anterior) / anterior) * 100
  const subiu = variacao >= 0
  return (
    <p className="mt-1 text-sm text-text-light">
      <span className={`font-semibold ${subiu ? 'text-success' : 'text-danger'}`}>
        {subiu ? '▲' : '▼'} {Math.abs(variacao).toFixed(0)}%
      </span>{' '}
      contra {formatCurrency(anterior)} {rotulo}
    </p>
  )
}

function Numero({ rotulo, valor, nota, largo }) {
  return (
    <div className={`rounded-xl border border-border bg-white p-4 lg:p-5 ${largo ? 'col-span-2 lg:col-span-1' : ''}`}>
      <p className="text-sm text-text-light">{rotulo}</p>
      <p className="mt-1 text-2xl font-bold text-text">{valor}</p>
      {nota && <p className="mt-1 text-sm text-text-light">{nota}</p>}
    </div>
  )
}

/** Teto do eixo num número redondo: 345 vira 400, 1.230 vira 1.500. */
function tetoRedondo(max) {
  if (max <= 0) return 100
  const base = 10 ** Math.floor(Math.log10(max))
  const passo = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(m => m * base >= max)
  return passo * base
}

function GraficoVendas({ barras, porHora }) {
  const [foco, setFoco] = useState(null)
  const teto = tetoRedondo(Math.max(...barras.map(b => b.valor)))
  const total = barras.reduce((s, b) => s + b.valor, 0)
  const pedidos = barras.reduce((s, b) => s + b.pedidos, 0)
  const destaque = foco === null ? null : barras[foco]
  // com muitas barras, rótulo em toda barra vira borrão: mostra uns 8 e o resto fica no toque
  const cadaQuantos = Math.ceil(barras.length / 8)

  return (
    <section className="rounded-xl border border-border bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Vendas {porHora ? 'por hora' : 'por dia'}</h2>
        <p className="text-sm text-text-light" aria-live="polite">
          {destaque
            ? <><strong className="text-text">{destaque.completo}</strong> · {formatCurrency(destaque.valor)} · {destaque.pedidos} {destaque.pedidos === 1 ? 'pedido' : 'pedidos'}</>
            : <>{formatCurrency(total)} em {pedidos} {pedidos === 1 ? 'pedido' : 'pedidos'} · toque numa barra para ver o dia</>}
        </p>
      </div>

      <div className="mt-5 flex gap-2">
        {/* eixo */}
        <div className="flex h-48 flex-col justify-between text-right text-xs tabular-nums text-text-light">
          {[teto, teto / 2, 0].map(v => <span key={v} className="-translate-y-1/2 leading-none first:translate-y-0 last:translate-y-0">{formatCurrency(v).replace(',00', '')}</span>)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-48">
            {[0, 50, 100].map(p => (
              <div key={p} className="absolute inset-x-0 border-t border-border" style={{ bottom: `${p}%` }} />
            ))}
            <div className="absolute inset-0 flex items-end gap-0.5" onMouseLeave={() => setFoco(null)}>
              {barras.map((b, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`${b.completo}: ${formatCurrency(b.valor)}, ${b.pedidos} pedidos`}
                  onMouseEnter={() => setFoco(i)}
                  onFocus={() => setFoco(i)}
                  onBlur={() => setFoco(null)}
                  onClick={() => setFoco(foco === i ? null : i)}
                  className="flex h-full min-w-0 flex-1 cursor-pointer items-end justify-center outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span
                    className={`block w-full max-w-12 rounded-t transition-colors ${foco === i ? 'bg-primary-dark' : 'bg-primary'}`}
                    style={{ height: b.valor > 0 ? `max(${(b.valor / teto) * 100}%, 3px)` : 0 }}
                  />
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 flex gap-0.5 text-xs tabular-nums text-text-light">
            {barras.map((b, i) => (
              <span key={i} className="min-w-0 flex-1 text-center">
                {i % cadaQuantos === 0 ? b.rotulo : ''}
              </span>
            ))}
          </div>
        </div>
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-text-light hover:text-text">Ver em tabela</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead className="text-text-light">
            <tr><th className="py-1 font-medium">{porHora ? 'Hora' : 'Dia'}</th><th className="py-1 text-right font-medium">Pedidos</th><th className="py-1 text-right font-medium">Valor</th></tr>
          </thead>
          <tbody>
            {barras.filter(b => b.pedidos > 0).map((b, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-1">{b.completo}</td>
                <td className="py-1 text-right">{b.pedidos}</td>
                <td className="py-1 text-right">{formatCurrency(b.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  )
}

function Ranking({ titulo, subtitulo, itens, formatar, extra, vazio }) {
  const maior = itens[0]?.valor || 1
  const soma = itens.reduce((s, i) => s + i.valor, 0)
  return (
    <section className="rounded-xl border border-border bg-white p-5">
      <h2 className="text-lg font-semibold">{titulo}</h2>
      <p className="text-sm text-text-light">{subtitulo}</p>
      {itens.length === 0 ? (
        <p className="mt-4 text-sm text-text-light">{vazio}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {itens.map(item => (
            <li key={item.nome}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-medium text-text">{item.nome}</span>
                <span className="shrink-0 tabular-nums">
                  <strong className="text-text">{formatar(item.valor)}</strong>
                  <span className="ml-2 text-text-light">
                    {extra ? extra(item) : `${Math.round((item.valor / soma) * 100)}%`}
                  </span>
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-bg-warm">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${(item.valor / maior) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ListaPedidos({ titulo, pedidos, vazio, mostrarAgenda }) {
  return (
    <section className="rounded-xl border border-border bg-white p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">{titulo}</h2>
        <Link to="/admin/pedidos" className="text-sm font-semibold text-primary hover:underline">Ver pedidos</Link>
      </div>
      {pedidos.length === 0 ? (
        <p className="mt-4 text-sm text-text-light">{vazio}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {pedidos.slice(0, 8).map(o => (
            <li key={o.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate">
                  <span className="font-semibold">#{o.order_number}</span>
                  <span className="ml-2 text-text">{o.customer_name}</span>
                </p>
                {mostrarAgenda && (
                  <p className="text-text-light">
                    {new Date(o.scheduled_for).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-semibold tabular-nums">{formatCurrency(o.total)}</span>
                <Badge className={STATUS_COLORS[o.status]}>{STATUS_LABELS[o.status]}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
