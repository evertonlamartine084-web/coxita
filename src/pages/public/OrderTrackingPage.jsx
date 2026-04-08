import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { HiHome, HiRefresh, HiCheck, HiClock, HiTruck, HiX, HiArrowRight } from 'react-icons/hi'
import { getOrderByNumber } from '../../services/orders'
import { formatCurrency, formatDate, PAYMENT_LABELS } from '../../utils/format'
import Button from '../../components/ui/Button'
import Loading from '../../components/ui/Loading'

const STEPS = [
  { key: 'pendente', label: 'Pedido recebido', icon: HiClock, description: 'Seu pedido foi recebido e esta aguardando confirmacao' },
  { key: 'em_preparo', label: 'Em preparo', icon: HiRefresh, description: 'Estamos preparando suas coxinhas com carinho' },
  { key: 'saiu_entrega', label: 'Saiu para entrega', icon: HiTruck, description: 'Seu pedido esta a caminho!' },
  { key: 'entregue', label: 'Entregue', icon: HiCheck, description: 'Pedido entregue. Bom apetite!' },
]

function getStepIndex(status) {
  if (status === 'cancelado') return -1
  return STEPS.findIndex(s => s.key === status)
}

export default function OrderTrackingPage() {
  const { orderNumber } = useParams()
  const lastOrder = localStorage.getItem('coxita-last-order')
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const fetchOrder = useCallback(async (num) => {
    if (!num) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await getOrderByNumber(parseInt(num))
      setOrder(data)
      setNotFound(false)
    } catch {
      setOrder(null)
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrder(orderNumber || lastOrder)
  }, [orderNumber])

  // Auto-refresh every 30s
  useEffect(() => {
    if (!order) return
    const interval = setInterval(() => {
      fetchOrder(order.order_number)
    }, 30000)
    return () => clearInterval(interval)
  }, [order, fetchOrder])

  const currentStep = order ? getStepIndex(order.status) : -1

  if (loading) return <Loading />

  // No order found - show empty state
  if (!order) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-bg-warm to-bg">
        <div className="max-w-lg mx-auto px-4 py-20 text-center">
          <div className="relative inline-block mb-6">
            <div className="absolute inset-0 bg-primary/5 rounded-full scale-150" />
            <img src="/logo.png" alt="" className="relative w-24 h-24 object-contain mx-auto opacity-40" />
          </div>
          <h2 className="font-display text-2xl font-bold mb-2 text-text">
            {notFound ? 'Pedido nao encontrado' : 'Nenhum pedido ainda'}
          </h2>
          <p className="text-text-light mb-8 max-w-sm mx-auto">
            {notFound
              ? 'O pedido que voce procura nao existe.'
              : 'Faca seu primeiro pedido e acompanhe por aqui!'}
          </p>
          <Link to="/cardapio">
            <Button variant="festive" className="gap-2">
              Ver cardapio
              <HiArrowRight size={18} />
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-bg-warm to-bg">
      <div className="max-w-lg mx-auto px-4 py-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <img src="/logo.png" alt="" className="w-12 h-12 object-contain" />
          </div>
          <h1 className="font-display text-3xl font-extrabold text-text mb-1">Acompanhar pedido</h1>
          <p className="text-text-light text-sm">Veja o status do seu pedido em tempo real</p>
        </div>

        {order && !loading && (
          <div className="space-y-5">
            {/* Order info card */}
            <div className="bg-surface card-organic border border-border/60 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs text-text-light uppercase tracking-wider font-semibold">Pedido</p>
                  <p className="font-display text-3xl font-extrabold text-primary">#{order.order_number}</p>
                </div>
                <button
                  onClick={() => fetchOrder(order.order_number)}
                  className="p-2 text-text-light hover:text-primary hover:bg-primary/5 rounded-xl transition-colors cursor-pointer"
                  title="Atualizar"
                >
                  <HiRefresh size={22} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-text-light text-xs">Cliente</p>
                  <p className="font-semibold text-text">{order.customer_name}</p>
                </div>
                <div>
                  <p className="text-text-light text-xs">Pagamento</p>
                  <p className="font-semibold text-text">{PAYMENT_LABELS[order.payment_method]}</p>
                </div>
                <div>
                  <p className="text-text-light text-xs">Total</p>
                  <p className="font-semibold text-text">{formatCurrency(order.total)}</p>
                </div>
                <div>
                  <p className="text-text-light text-xs">Feito em</p>
                  <p className="font-semibold text-text">{formatDate(order.created_at)}</p>
                </div>
              </div>
            </div>

            {/* Status tracker */}
            {order.status === 'cancelado' ? (
              <div className="bg-danger/5 card-organic border-2 border-danger/30 p-6 text-center">
                <div className="w-14 h-14 bg-danger/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <HiX className="text-danger" size={28} />
                </div>
                <h2 className="font-display text-xl font-bold text-danger mb-1">Pedido cancelado</h2>
                <p className="text-text-light text-sm">Este pedido foi cancelado.</p>
              </div>
            ) : (
              <div className="bg-surface card-organic border border-border/60 p-6 shadow-sm">
                <h2 className="font-display text-lg font-bold text-text mb-6">Status do pedido</h2>

                <div className="relative">
                  {STEPS.map((step, i) => {
                    const isCompleted = i <= currentStep
                    const isCurrent = i === currentStep
                    const Icon = step.icon

                    return (
                      <div key={step.key} className="flex gap-4 relative">
                        {/* Line */}
                        {i < STEPS.length - 1 && (
                          <div
                            className={`absolute left-[19px] top-[40px] w-0.5 h-[calc(100%-20px)] transition-colors duration-500 ${
                              i < currentStep ? 'bg-accent' : 'bg-border'
                            }`}
                          />
                        )}

                        {/* Circle */}
                        <div
                          className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500 ${
                            isCurrent
                              ? 'bg-accent text-white shadow-lg shadow-accent/30 scale-110'
                              : isCompleted
                              ? 'bg-accent text-white'
                              : 'bg-border/50 text-text-light'
                          }`}
                        >
                          {isCompleted && !isCurrent ? (
                            <HiCheck size={18} />
                          ) : (
                            <Icon size={18} className={isCurrent ? 'animate-pulse' : ''} />
                          )}
                        </div>

                        {/* Text */}
                        <div className={`pb-8 ${i === STEPS.length - 1 ? 'pb-0' : ''}`}>
                          <p
                            className={`font-display font-bold text-sm transition-colors ${
                              isCompleted ? 'text-text' : 'text-text-light'
                            }`}
                          >
                            {step.label}
                          </p>
                          <p
                            className={`text-xs mt-0.5 transition-colors ${
                              isCurrent ? 'text-accent font-semibold' : 'text-text-light'
                            }`}
                          >
                            {isCurrent ? step.description : isCompleted ? 'Concluido' : 'Aguardando'}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Auto refresh notice */}
                <div className="mt-6 pt-4 border-t border-border/50">
                  <p className="text-center text-text-light text-xs">
                    Atualiza automaticamente a cada 30 segundos
                  </p>
                </div>
              </div>
            )}

            {/* Items */}
            <div className="bg-surface card-organic border border-border/60 p-5 shadow-sm">
              <h3 className="font-display font-bold text-text mb-3">Itens do pedido</h3>
              <div className="space-y-2">
                {order.order_items?.map(item => (
                  <div key={item.id} className="flex justify-between items-center text-sm">
                    <span className="text-text">
                      <span className="font-bold text-primary">{item.quantity}x</span>{' '}
                      {item.product_name}
                    </span>
                    <span className="font-semibold text-text">{formatCurrency(item.total_price)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-border/50 flex justify-between">
                <span className="font-display font-bold text-text">Total</span>
                <span className="font-display font-extrabold text-primary text-lg">{formatCurrency(order.total)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Back home */}
        <Link to="/" className="block mt-8">
          <Button variant="outline" className="w-full gap-2">
            <HiHome size={18} />
            Voltar ao inicio
          </Button>
        </Link>
      </div>
    </div>
  )
}
