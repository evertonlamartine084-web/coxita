import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { HiHome, HiRefresh, HiCheck, HiClock, HiTruck, HiX, HiArrowRight, HiBell, HiStar, HiChat, HiPaperAirplane } from 'react-icons/hi'
import { getOrderByNumber, getOrderMessages, sendOrderMessage, markMessagesRead } from '../../services/orders'
import { createReview, getReviewByOrderId } from '../../services/reviews'
import { formatCurrency, formatDate, PAYMENT_LABELS, STATUS_LABELS } from '../../utils/format'
import Button from '../../components/ui/Button'
import Loading from '../../components/ui/Loading'
import ShareButtons from '../../components/share/ShareButtons'
import { registerPushSubscription } from '../../services/pushNotifications'
import toast from 'react-hot-toast'

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

function sendNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/logo.png' })
  }
}

export default function OrderTrackingPage() {
  const { orderNumber } = useParams()
  const lastOrder = localStorage.getItem('coxita-last-order')
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [notifEnabled, setNotifEnabled] = useState(false)
  const [review, setReview] = useState(null)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)
  const prevStatusRef = useRef(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [sendingMsg, setSendingMsg] = useState(false)
  const chatEndRef = useRef(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const shouldScrollRef = useRef(false)

  const loadMessages = useCallback(async (orderId) => {
    if (!orderId) return
    try {
      const msgs = await getOrderMessages(orderId)
      setMessages(msgs)
      const unread = msgs.filter(m => m.sender_type === 'admin' && !m.read_at).length
      setUnreadCount(unread)
    } catch {}
  }, [])

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !order || sendingMsg) return
    setSendingMsg(true)
    try {
      await sendOrderMessage(order.id, 'customer', newMessage.trim())
      setNewMessage('')
      shouldScrollRef.current = true
      await loadMessages(order.id)
    } catch {
      toast.error('Erro ao enviar mensagem')
    } finally {
      setSendingMsg(false)
    }
  }

  // Check unread count periodically (lightweight, no re-render of full messages)
  useEffect(() => {
    if (!order || chatOpen) return
    const checkUnread = () => {
      getOrderMessages(order.id).then(msgs => {
        const count = msgs.filter(m => m.sender_type === 'admin' && !m.read_at).length
        setUnreadCount(count)
      }).catch(() => {})
    }
    checkUnread()
    const interval = setInterval(checkUnread, 15000)
    return () => clearInterval(interval)
  }, [order?.id, chatOpen])

  // Load messages and poll only when chat is open
  useEffect(() => {
    if (!chatOpen || !order) return
    shouldScrollRef.current = true
    loadMessages(order.id)
    markMessagesRead(order.id, 'admin').catch(() => {})
    const interval = setInterval(() => loadMessages(order.id), 10000)
    return () => clearInterval(interval)
  }, [chatOpen, order?.id, loadMessages])

  // Scroll inside chat only, not the page
  useEffect(() => {
    if (shouldScrollRef.current && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      shouldScrollRef.current = false
    }
  }, [messages])

  const fetchOrder = useCallback(async (num) => {
    if (!num) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await getOrderByNumber(parseInt(num))
      // Notify on status change
      if (prevStatusRef.current && prevStatusRef.current !== data.status) {
        const label = STATUS_LABELS[data.status] || data.status
        sendNotification(`Pedido #${data.order_number}`, `Status atualizado: ${label}`)
      }
      prevStatusRef.current = data.status
      setOrder(data)
      setNotFound(false)
      // Load review if delivered
      if (data.status === 'entregue') {
        getReviewByOrderId(data.id).then(r => { if (r) setReview(r) }).catch(() => {})
      }
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

  // Auto-register push if permission already granted
  useEffect(() => {
    if (!order) return
    if ('Notification' in window && Notification.permission === 'granted') {
      registerPushSubscription(order.order_number)
        .then(res => { if (res.granted) setNotifEnabled(true) })
        .catch(() => {})
    }
  }, [order?.order_number])

  // Auto-refresh every 30s
  useEffect(() => {
    if (!order) return
    const interval = setInterval(() => {
      fetchOrder(order.order_number)
    }, 30000)
    return () => clearInterval(interval)
  }, [order, fetchOrder])

  const handleSubmitReview = async () => {
    if (rating === 0) {
      toast.error('Selecione uma nota')
      return
    }
    setSubmittingReview(true)
    try {
      const r = await createReview({
        order_id: order.id,
        order_number: order.order_number,
        customer_name: order.customer_name,
        rating,
        comment: comment.trim() || null,
      })
      setReview(r)
      toast.success('Obrigado pela avaliacao!')
    } catch {
      toast.error('Erro ao enviar avaliacao')
    } finally {
      setSubmittingReview(false)
    }
  }

  const requestNotifications = async () => {
    if (!('Notification' in window)) return
    try {
      const result = await registerPushSubscription(order?.order_number)
      if (!result.supported) {
        toast.error('Seu navegador nao suporta notificacoes')
        return
      }
      if (!result.granted) {
        toast.error('Permissao de notificacao negada')
        return
      }
      setNotifEnabled(true)
      toast.success('Notificacoes ativadas! Voce sera avisado mesmo fora do site.')
    } catch (err) {
      console.error('Push registration error:', err)
      // Fallback to basic notifications
      const permission = await Notification.requestPermission()
      setNotifEnabled(permission === 'granted')
      if (permission === 'granted') {
        toast.success('Notificacoes ativadas!')
      }
    }
  }

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

              {order.scheduled_for && (
                <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-2">
                  <span className="bg-primary/10 text-primary text-xs font-bold px-3 py-1 rounded-full">Agendado</span>
                  <span className="text-sm font-semibold text-text">
                    {new Date(order.scheduled_for).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                    {' as '}
                    {new Date(order.scheduled_for).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
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

                {/* Notifications + Auto refresh */}
                <div className="mt-6 pt-4 border-t border-border/50 space-y-3">
                  {'Notification' in window && !notifEnabled && (
                    <button
                      onClick={requestNotifications}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/5 text-primary font-display font-bold text-sm hover:bg-primary/10 transition-colors cursor-pointer"
                    >
                      <HiBell size={16} />
                      Ativar notificacoes
                    </button>
                  )}
                  {notifEnabled && (
                    <p className="text-center text-accent text-xs font-semibold flex items-center justify-center gap-1">
                      <HiBell size={14} />
                      Notificacoes ativadas
                    </p>
                  )}
                  <p className="text-center text-text-light text-xs">
                    Atualiza automaticamente a cada 30 segundos
                  </p>
                </div>
              </div>
            )}

            {/* Chat */}
            {order.status !== 'cancelado' && order.status !== 'entregue' && (
              <div className="bg-surface card-organic border border-border/60 shadow-sm overflow-hidden">
                <button
                  onClick={() => setChatOpen(!chatOpen)}
                  className="w-full flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <HiChat size={20} className="text-primary" />
                    <span className="font-display font-bold text-text">Falar com a loja</span>
                    {!chatOpen && unreadCount > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center animate-pulse">
                        {unreadCount}
                      </span>
                    )}
                  </div>
                  <span className="text-text-light text-sm">{chatOpen ? '▲' : '▼'}</span>
                </button>

                {chatOpen && (
                  <div className="border-t border-border/50">
                    <div className="h-64 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
                      {messages.length === 0 ? (
                        <p className="text-center text-text-light text-sm py-8">Nenhuma mensagem ainda. Envie uma mensagem!</p>
                      ) : (
                        messages.map(msg => (
                          <div key={msg.id} className={`flex ${msg.sender_type === 'customer' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
                              msg.sender_type === 'customer'
                                ? 'bg-primary text-white rounded-br-sm'
                                : 'bg-white border border-border text-text rounded-bl-sm'
                            }`}>
                              {msg.sender_type === 'admin' && (
                                <p className="text-[10px] font-bold text-primary mb-0.5">Loja</p>
                              )}
                              <p>{msg.message}</p>
                              <div className={`flex items-center gap-1 justify-end mt-1 ${msg.sender_type === 'customer' ? 'text-white/60' : 'text-text-light'}`}>
                                <span className="text-[10px]">
                                  {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {msg.sender_type === 'customer' && (
                                  <span className={`text-[10px] ${msg.read_at ? 'text-blue-300' : 'text-white/40'}`}>
                                    {msg.read_at ? '✓✓' : '✓'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                      <div ref={chatEndRef} />
                    </div>
                    <div className="p-3 border-t border-border/50 flex gap-2">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                        placeholder="Digite sua mensagem..."
                        className="flex-1 px-3 py-2 border-2 border-border rounded-xl text-sm outline-none focus:border-primary"
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={!newMessage.trim() || sendingMsg}
                        className="p-2 bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        <HiPaperAirplane size={18} />
                      </button>
                    </div>
                  </div>
                )}
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

        {/* Share */}
        {order && (
          <div className="mt-5">
            <ShareButtons orderNumber={order.order_number} />
          </div>
        )}

        {/* Review section - only when delivered */}
        {order && order.status === 'entregue' && (
          <div className="bg-surface card-organic border border-border/60 p-5 shadow-sm mt-5">
            {review ? (
              <div className="text-center">
                <h3 className="font-display font-bold text-text mb-2">Sua avaliacao</h3>
                <div className="flex justify-center gap-1 mb-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <HiStar
                      key={star}
                      size={24}
                      className={star <= review.rating ? 'text-secondary' : 'text-border'}
                    />
                  ))}
                </div>
                {review.comment && (
                  <p className="text-text-light text-sm italic">"{review.comment}"</p>
                )}
                <p className="text-accent text-xs font-semibold mt-2">Obrigado pelo feedback!</p>
              </div>
            ) : (
              <div>
                <h3 className="font-display font-bold text-text mb-1 text-center">Como foi seu pedido?</h3>
                <p className="text-text-light text-xs text-center mb-4">Sua opiniao nos ajuda a melhorar</p>

                {/* Stars */}
                <div className="flex justify-center gap-2 mb-4">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      onClick={() => setRating(star)}
                      className="cursor-pointer transition-transform hover:scale-125"
                    >
                      <HiStar
                        size={32}
                        className={`transition-colors ${star <= rating ? 'text-secondary' : 'text-border hover:text-secondary/50'}`}
                      />
                    </button>
                  ))}
                </div>

                {rating > 0 && (
                  <p className="text-center text-sm font-display font-bold text-secondary mb-3">
                    {rating === 1 && 'Pode melhorar'}
                    {rating === 2 && 'Regular'}
                    {rating === 3 && 'Bom'}
                    {rating === 4 && 'Muito bom!'}
                    {rating === 5 && 'Excelente!'}
                  </p>
                )}

                {/* Comment */}
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  rows={3}
                  placeholder="Deixe um comentario (opcional)"
                  className="w-full px-4 py-3 border-2 border-border rounded-xl outline-none focus:border-primary resize-none transition-colors font-body text-sm mb-3"
                />

                <button
                  onClick={handleSubmitReview}
                  disabled={rating === 0 || submittingReview}
                  className="w-full py-3 rounded-xl font-bold font-display bg-primary text-white hover:bg-primary-dark transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {submittingReview ? 'Enviando...' : 'Enviar avaliacao'}
                </button>
              </div>
            )}
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
