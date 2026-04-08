import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { HiSearch, HiHome, HiRefresh, HiCheck, HiClock, HiTruck, HiX } from 'react-icons/hi'
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
  const [searchParams] = useSearchParams()
  const [inputNumber, setInputNumber] = useState(orderNumber || searchParams.get('pedido') || '')
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searched, setSearched] = useState(false)

  const fetchOrder = useCallback(async (num) => {
    if (!num) return
    setLoading(true)
    setError(null)
    try {
      const data = await getOrderByNumber(parseInt(num))
      setOrder(data)
      setSearched(true)
    } catch {
      setOrder(null)
      setError('Pedido nao encontrado. Verifique o numero e tente novamente.')
      setSearched(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (orderNumber) {
      fetchOrder(orderNumber)
    }
  }, [orderNumber, fetchOrder])

  // Auto-refresh every 30s
  useEffect(() => {
    if (!order) return
    const interval = setInterval(() => {
      fetchOrder(order.order_number)
    }, 30000)
    return () => clearInterval(interval)
  }, [order, fetchOrder])

  const handleSearch = (e) => {
    e.preventDefault()
    fetchOrder(inputNumber.replace(/\D/g, ''))
  }

  const currentStep = order ? getStepIndex(order.status) : -1

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

        {/* Search form */}
        {!orderNumber && (
          <form onSubmit={handleSearch} className="mb-8">
            <div className="bg-surface card-organic border border-border/60 p-5 shadow-sm">
              <label className="block text-sm font-semibold text-text-warm mb-2 font-display">
                Numero do pedido
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-light font-bold">#</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={inputNumber}
                    onChange={e => setInputNumber(e.target.value)}
                    placeholder="Ex: 42"
                    className="w-full pl-8 pr-4 py-3 border-2 border-border rounded-xl outline-none focus:border-primary transition-colors font-display text-lg font-bold"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!inputNumber || loading}
                  className="px-5 bg-primary text-white rounded-xl font-bold font-display flex items-center gap-2 hover:bg-primary-dark transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <HiSearch size={20} />
                  Buscar
                </button>
              </div>
            </div>
          </form>
        )}

        {loading && <Loading />}

        {error && searched && (
          <div className="bg-danger/5 card-organic border-2 border-danger/30 p-6 text-center">
            <div className="w-12 h-12 bg-danger/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <HiX className="text-danger" size={24} />
            </div>
            <p className="text-danger font-display font-bold">{error}</p>
          </div>
        )}

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
