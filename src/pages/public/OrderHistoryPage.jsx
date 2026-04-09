import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getOrdersByNumbers } from '../../services/orders'
import { getProducts } from '../../services/products'
import { useCartStore } from '../../store/cartStore'
import { formatCurrency, STATUS_LABELS, STATUS_COLORS } from '../../utils/format'
import Badge from '../../components/ui/Badge'
import Loading from '../../components/ui/Loading'
import toast from 'react-hot-toast'

export default function OrderHistoryPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [reordering, setReordering] = useState(null)
  const myOrderNumbers = JSON.parse(localStorage.getItem('coxita-my-orders') || '[]')
  const navigate = useNavigate()
  const { addItem, clearCart } = useCartStore()

  useEffect(() => {
    if (myOrderNumbers.length === 0) {
      setLoading(false)
      return
    }
    getOrdersByNumbers(myOrderNumbers)
      .then(setOrders)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const handleReorder = async (order) => {
    setReordering(order.id)
    try {
      const products = await getProducts()
      let added = 0

      clearCart()
      order.order_items?.forEach(item => {
        const product = products.find(p => p.id === item.product_id)
        if (product) {
          for (let i = 0; i < item.quantity; i++) {
            addItem({
              id: product.id,
              name: product.name,
              price: product.price,
              image_url: product.image_url,
            })
          }
          added++
        }
      })

      if (added === 0) {
        toast.error('Os produtos desse pedido nao estao mais disponiveis')
      } else {
        if (added < (order.order_items?.length || 0)) {
          toast('Alguns itens nao estao mais disponiveis', { icon: '⚠️' })
        } else {
          toast.success('Itens adicionados ao carrinho!')
        }
        navigate('/carrinho')
      }
    } catch {
      toast.error('Erro ao carregar produtos')
    } finally {
      setReordering(null)
    }
  }

  if (loading) return <Loading />

  if (myOrderNumbers.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="text-6xl mb-4">📋</div>
        <h1 className="font-display text-2xl font-bold mb-2">Historico de pedidos</h1>
        <p className="text-text-light mb-6">Faca seu primeiro pedido para ver o historico aqui.</p>
        <Link
          to="/cardapio"
          className="inline-block bg-primary text-white font-bold px-6 py-3 rounded-xl no-underline hover:bg-primary-dark transition-colors"
        >
          Ver cardapio
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="font-display text-2xl font-bold mb-6">Meus pedidos</h1>

      {orders.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-5xl mb-4">📦</div>
          <p className="text-text-light">Nenhum pedido encontrado.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(order => (
            <div key={order.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Header */}
              <button
                onClick={() => setSelectedOrder(selectedOrder === order.id ? null : order.id)}
                className="w-full px-4 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-display font-bold text-lg text-primary">#{order.order_number}</span>
                  <Badge className={STATUS_COLORS[order.status]}>{STATUS_LABELS[order.status]}</Badge>
                </div>
                <div className="text-right">
                  <p className="font-bold">{formatCurrency(order.total)}</p>
                  <p className="text-xs text-text-light">
                    {new Date(order.created_at).toLocaleDateString('pt-BR', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </p>
                </div>
              </button>

              {/* Detail */}
              {selectedOrder === order.id && (
                <div className="px-4 pb-4 border-t border-gray-100">
                  <div className="pt-3 space-y-2">
                    {order.order_items?.map(item => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span>
                          <span className="font-bold text-primary mr-1">{item.quantity}x</span>
                          {item.product_name}
                        </span>
                        <span className="font-medium">{formatCurrency(item.total_price)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-dashed border-gray-200 mt-3 pt-3 space-y-1 text-sm">
                    <div className="flex justify-between text-text-light">
                      <span>Subtotal</span>
                      <span>{formatCurrency(order.subtotal)}</span>
                    </div>
                    {order.discount > 0 && (
                      <div className="flex justify-between text-accent font-semibold">
                        <span>Desconto{order.coupon_code ? ` (${order.coupon_code})` : ''}</span>
                        <span>-{formatCurrency(order.discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-text-light">
                      <span>Entrega</span>
                      <span>{order.delivery_fee > 0 ? formatCurrency(order.delivery_fee) : 'Gratis'}</span>
                    </div>
                    <div className="flex justify-between font-bold text-base pt-1 border-t border-gray-200">
                      <span>Total</span>
                      <span className="text-primary">{formatCurrency(order.total)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4">
                    {!['entregue', 'cancelado'].includes(order.status) && (
                      <Link
                        to="/acompanhar"
                        className="flex-1 text-center bg-primary text-white font-bold py-2.5 rounded-xl text-sm no-underline hover:bg-primary-dark transition-colors"
                      >
                        Acompanhar
                      </Link>
                    )}
                    <button
                      onClick={() => handleReorder(order)}
                      disabled={reordering === order.id}
                      className="flex-1 text-center border-2 border-primary text-primary font-bold py-2.5 rounded-xl text-sm hover:bg-primary/5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {reordering === order.id ? 'Adicionando...' : 'Pedir de novo'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
