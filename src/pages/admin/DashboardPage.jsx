import { useEffect, useState } from 'react'
import { getTodayOrders } from '../../services/orders'
import { formatCurrency } from '../../utils/format'
import { STATUS_LABELS, STATUS_COLORS } from '../../utils/format'
import Badge from '../../components/ui/Badge'
import Loading from '../../components/ui/Loading'

export default function DashboardPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getTodayOrders()
      .then(setOrders)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Loading />

  const revenue = orders
    .filter(o => o.status !== 'cancelado')
    .reduce((sum, o) => sum + Number(o.total), 0)

  const activeOrders = orders.filter(o => !['entregue', 'cancelado'].includes(o.status))

  // Best sellers
  const productCounts = {}
  orders.forEach(o => {
    o.order_items?.forEach(item => {
      productCounts[item.product_name] = (productCounts[item.product_name] || 0) + item.quantity
    })
  })
  const bestSellers = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Pedidos Hoje" value={orders.length} icon="📦" />
        <StatCard label="Pedidos Ativos" value={activeOrders.length} icon="🔥" />
        <StatCard label="Faturamento Hoje" value={formatCurrency(revenue)} icon="💰" />
        <StatCard label="Ticket Médio" value={orders.length > 0 ? formatCurrency(revenue / orders.length) : 'R$ 0,00'} icon="📊" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent orders */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="font-semibold text-lg mb-4">Pedidos Recentes</h2>
          {orders.length === 0 ? (
            <p className="text-text-light text-sm">Nenhum pedido hoje.</p>
          ) : (
            <div className="space-y-3">
              {orders.slice(0, 8).map(order => (
                <div key={order.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <span className="font-medium">#{order.order_number}</span>
                    <span className="text-text-light text-sm ml-2">{order.customer_name}</span>
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
          <h2 className="font-semibold text-lg mb-4">Mais Vendidos Hoje</h2>
          {bestSellers.length === 0 ? (
            <p className="text-text-light text-sm">Nenhuma venda hoje.</p>
          ) : (
            <div className="space-y-3">
              {bestSellers.map(([name, count], i) => (
                <div key={name} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '▪️'}</span>
                    <span className="font-medium">{name}</span>
                  </div>
                  <span className="text-text-light text-sm">{count} un.</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, icon }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className="text-text-light text-sm">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </div>
    </div>
  )
}
