import { useEffect, useState } from 'react'
import { getOrders, getTodayOrders } from '../../services/orders'
import { formatCurrency } from '../../utils/format'
import { STATUS_LABELS, STATUS_COLORS } from '../../utils/format'
import Badge from '../../components/ui/Badge'
import Loading from '../../components/ui/Loading'

export default function DashboardPage() {
  const [todayOrders, setTodayOrders] = useState([])
  const [allOrders, setAllOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('7d')

  useEffect(() => {
    Promise.all([getTodayOrders(), getOrders()])
      .then(([today, all]) => {
        setTodayOrders(today)
        setAllOrders(all)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Loading />

  const validOrders = allOrders.filter(o => o.status !== 'cancelado')

  // Today stats
  const todayValid = todayOrders.filter(o => o.status !== 'cancelado')
  const todayRevenue = todayValid.reduce((sum, o) => sum + Number(o.total), 0)
  const activeOrders = todayOrders.filter(o => !['entregue', 'cancelado'].includes(o.status))

  // Chart data
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
  const chartData = []
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - i)
    const nextDate = new Date(date)
    nextDate.setDate(nextDate.getDate() + 1)

    const dayOrders = validOrders.filter(o => {
      const d = new Date(o.created_at)
      return d >= date && d < nextDate
    })

    chartData.push({
      label: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      revenue: dayOrders.reduce((sum, o) => sum + Number(o.total), 0),
      count: dayOrders.length,
    })
  }

  const maxRevenue = Math.max(...chartData.map(d => d.revenue), 1)
  const totalPeriod = chartData.reduce((sum, d) => sum + d.revenue, 0)
  const totalOrdersPeriod = chartData.reduce((sum, d) => sum + d.count, 0)

  // Best sellers (all time)
  const productCounts = {}
  const productRevenue = {}
  validOrders.forEach(o => {
    o.order_items?.forEach(item => {
      productCounts[item.product_name] = (productCounts[item.product_name] || 0) + item.quantity
      productRevenue[item.product_name] = (productRevenue[item.product_name] || 0) + Number(item.total_price)
    })
  })
  const bestSellers = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* Today Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Pedidos Hoje" value={todayOrders.length} color="bg-blue-500" />
        <StatCard label="Ativos" value={activeOrders.length} color="bg-orange-500" />
        <StatCard label="Faturamento Hoje" value={formatCurrency(todayRevenue)} color="bg-green-500" />
        <StatCard label="Ticket Medio" value={todayValid.length > 0 ? formatCurrency(todayRevenue / todayValid.length) : 'R$ 0,00'} color="bg-purple-500" />
      </div>

      {/* Sales Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-lg">Vendas</h2>
            <p className="text-gray-500 text-sm">
              {formatCurrency(totalPeriod)} em {totalOrdersPeriod} pedidos
            </p>
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {[
              { key: '7d', label: '7 dias' },
              { key: '30d', label: '30 dias' },
              { key: '90d', label: '90 dias' },
            ].map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  period === p.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Bar chart */}
        <div className="flex items-end gap-1 h-40 mt-4">
          {chartData.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
              {/* Tooltip */}
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs rounded-lg px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                {d.label}: {formatCurrency(d.revenue)} ({d.count} ped.)
              </div>
              <div
                className="w-full bg-primary/80 hover:bg-primary rounded-t transition-all cursor-pointer min-h-[2px]"
                style={{ height: `${(d.revenue / maxRevenue) * 100}%` }}
              />
              {days <= 14 && (
                <span className="text-[9px] text-gray-400 mt-0.5">{d.label}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent orders */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="font-semibold text-lg mb-4">Pedidos Recentes</h2>
          {todayOrders.length === 0 ? (
            <p className="text-gray-500 text-sm">Nenhum pedido hoje.</p>
          ) : (
            <div className="space-y-3">
              {todayOrders.slice(0, 8).map(order => (
                <div key={order.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <span className="font-medium">#{order.order_number}</span>
                    <span className="text-gray-500 text-sm ml-2">{order.customer_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{formatCurrency(order.total)}</span>
                    <Badge className={STATUS_COLORS[order.status]}>{STATUS_LABELS[order.status]}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Best sellers */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="font-semibold text-lg mb-4">Mais Vendidos (geral)</h2>
          {bestSellers.length === 0 ? (
            <p className="text-gray-500 text-sm">Nenhuma venda ainda.</p>
          ) : (
            <div className="space-y-3">
              {bestSellers.map(([name, count], i) => {
                const maxCount = bestSellers[0][1]
                return (
                  <div key={name} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-400 w-5">{i + 1}.</span>
                        <span className="font-medium text-sm">{name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold">{count} un.</span>
                        <span className="text-gray-400 text-xs ml-2">{formatCurrency(productRevenue[name])}</span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 ml-7">
                      <div
                        className="bg-primary h-1.5 rounded-full transition-all"
                        style={{ width: `${(count / maxCount) * 100}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full ${color}`} />
        <div>
          <p className="text-gray-500 text-xs">{label}</p>
          <p className="text-lg font-bold">{value}</p>
        </div>
      </div>
    </div>
  )
}
