import { useEffect, useState, useRef } from 'react'
import { getOrders, updateOrderStatus, getOrderMessages, sendOrderMessage, markMessagesRead, getUnreadMessageCounts } from '../../services/orders'
import { supabase } from '../../services/supabase'
import { formatCurrency, formatDate, STATUS_LABELS, STATUS_COLORS, PAYMENT_LABELS } from '../../utils/format'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Loading from '../../components/ui/Loading'
import { playOrderAlert } from '../../utils/alertSound'
import toast from 'react-hot-toast'

const STATUSES = ['pendente', 'em_preparo', 'saiu_entrega', 'entregue', 'cancelado']

export default function OrdersPage() {
  const [orders, setOrders] = useState([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('coxita_admin_sound') !== 'off'
  })
  const [newOrderIds, setNewOrderIds] = useState([])
  const prevOrderIdsRef = useRef(null)
  const [chatMessages, setChatMessages] = useState([])
  const [adminMessage, setAdminMessage] = useState('')
  const [sendingAdminMsg, setSendingAdminMsg] = useState(false)
  const adminChatEndRef = useRef(null)
  const [unreadCounts, setUnreadCounts] = useState({})
  const adminShouldScrollRef = useRef(false)

  const loadOrders = (showLoading = false) => {
    if (showLoading) setLoading(true)
    getOrders(filter || null)
      .then(data => {
        if (prevOrderIdsRef.current !== null) {
          const prevIds = prevOrderIdsRef.current
          const freshIds = data.map(o => o.id).filter(id => !prevIds.has(id))
          if (freshIds.length > 0) {
            setNewOrderIds(freshIds)
            setTimeout(() => setNewOrderIds([]), 3000)
          }
        }
        prevOrderIdsRef.current = new Set(data.map(o => o.id))
        setOrders(data)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
    getUnreadMessageCounts().then(setUnreadCounts).catch(() => {})
  }

  useEffect(() => { loadOrders(true) }, [filter])

  // Auto-reload every 15 seconds (silent, no loading spinner)
  useEffect(() => {
    const interval = setInterval(() => loadOrders(false), 15000)
    return () => clearInterval(interval)
  }, [filter])

  // Load chat messages when order is selected
  useEffect(() => {
    if (!selectedOrder) { setChatMessages([]); return }
    adminShouldScrollRef.current = true
    const load = () => {
      getOrderMessages(selectedOrder.id).then(msgs => {
        setChatMessages(msgs)
        markMessagesRead(selectedOrder.id, 'customer').catch(() => {})
      }).catch(() => {})
    }
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [selectedOrder?.id])

  useEffect(() => {
    if (adminShouldScrollRef.current) {
      adminChatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      adminShouldScrollRef.current = false
    }
  }, [chatMessages])

  const handleSendAdminMessage = async () => {
    if (!adminMessage.trim() || !selectedOrder || sendingAdminMsg) return
    const msgText = adminMessage.trim()
    setSendingAdminMsg(true)
    try {
      await sendOrderMessage(selectedOrder.id, 'admin', msgText)
      setAdminMessage('')
      adminShouldScrollRef.current = true
      const msgs = await getOrderMessages(selectedOrder.id)
      setChatMessages(msgs)

      // Send push notification to customer
      supabase.functions.invoke('send-push', {
        body: { order_number: selectedOrder.order_number, type: 'chat', message: msgText },
      }).catch(err => console.error('Chat push error:', err))
    } catch {
      toast.error('Erro ao enviar mensagem')
    } finally {
      setSendingAdminMsg(false)
    }
  }

  const toggleSound = () => {
    const newValue = !soundEnabled
    setSoundEnabled(newValue)
    localStorage.setItem('coxita_admin_sound', newValue ? 'on' : 'off')
    if (newValue) {
      playOrderAlert()
      toast.success('Som de alerta ativado')
    } else {
      toast('Som de alerta desativado')
    }
  }

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await updateOrderStatus(orderId, newStatus)
    } catch {
      toast.error('Erro ao atualizar status.')
      return
    }

    toast.success('Status atualizado!')

    if (selectedOrder?.id === orderId) {
      setSelectedOrder(prev => ({ ...prev, status: newStatus }))
    }

    // Send push notification to customer (fire and forget)
    const order = orders.find(o => o.id === orderId)
    if (order) {
      supabase.functions.invoke('send-push', {
        body: { order_number: order.order_number, status: newStatus },
      }).then(res => {
        console.log('Push result:', res.data)
      }).catch(err => {
        console.error('Push error:', err)
      })
    }

    loadOrders()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Pedidos</h1>
        <button
          onClick={toggleSound}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            soundEnabled
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
          title={soundEnabled ? 'Desativar som de alerta' : 'Ativar som de alerta'}
        >
          {soundEnabled ? '🔔' : '🔕'}
          <span className="hidden sm:inline">{soundEnabled ? 'Som ativo' : 'Som desativado'}</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-4 mb-4">
        <button
          onClick={() => setFilter('')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap ${
            !filter ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-text'
          }`}
        >
          Todos
        </button>
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap ${
              filter === s ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-text'
            }`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? <Loading /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {orders.length === 0 ? (
            <p className="text-text-light text-center py-8">Nenhum pedido encontrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">#</th>
                    <th className="text-left px-4 py-3 font-medium">Cliente</th>
                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Tipo</th>
                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Pagamento</th>
                    <th className="text-left px-4 py-3 font-medium">Total</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Data</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.map(order => (
                    <tr key={order.id} className={`hover:bg-gray-50 transition-colors ${newOrderIds.includes(order.id) ? 'bg-green-50 animate-pulse' : ''}`}>
                      <td className="px-4 py-3 font-medium">
                        #{order.order_number}
                        {order.scheduled_for && (
                          <span className="ml-1.5 bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">AGENDADO</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{order.customer_name}</td>
                      <td className="px-4 py-3 hidden md:table-cell capitalize">{order.delivery_type}</td>
                      <td className="px-4 py-3 hidden md:table-cell">{PAYMENT_LABELS[order.payment_method]}</td>
                      <td className="px-4 py-3 font-medium">{formatCurrency(order.total)}</td>
                      <td className="px-4 py-3">
                        <select
                          value={order.status}
                          onChange={(e) => handleStatusChange(order.id, e.target.value)}
                          className={`text-xs font-semibold rounded-full px-2 py-1 border-0 cursor-pointer ${STATUS_COLORS[order.status]}`}
                        >
                          {STATUSES.map(s => (
                            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-text-light">{formatDate(order.created_at)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="text-primary hover:underline text-sm relative"
                        >
                          Ver
                          {unreadCounts[order.id] > 0 && (
                            <span className="absolute -top-2 -right-4 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center animate-pulse">
                              {unreadCounts[order.id]}
                            </span>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Order Detail Modal */}
      <Modal
        isOpen={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        title={`Pedido #${selectedOrder?.order_number}`}
      >
        {selectedOrder && (
          <div className="space-y-4">
            <div>
              <Badge className={STATUS_COLORS[selectedOrder.status]}>{STATUS_LABELS[selectedOrder.status]}</Badge>
              <span className="text-text-light text-sm ml-2">{formatDate(selectedOrder.created_at)}</span>
            </div>

            {selectedOrder.scheduled_for && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm font-bold text-blue-700">
                  Pedido agendado para {formatDate(selectedOrder.scheduled_for)}
                </p>
              </div>
            )}

            <div className="border-t border-border pt-3">
              <h4 className="font-medium mb-1">Cliente</h4>
              <p className="text-sm">{selectedOrder.customer_name}</p>
              <p className="text-sm text-text-light">{selectedOrder.customer_phone}</p>
            </div>

            {selectedOrder.delivery_type === 'entrega' && (
              <div className="border-t border-border pt-3">
                <h4 className="font-medium mb-1">Endereço</h4>
                <p className="text-sm">
                  {selectedOrder.address}, {selectedOrder.address_number}
                  {selectedOrder.address_complement && ` - ${selectedOrder.address_complement}`}
                </p>
                <p className="text-sm">{selectedOrder.neighborhood}</p>
                {selectedOrder.address_reference && (
                  <p className="text-sm text-text-light">Ref: {selectedOrder.address_reference}</p>
                )}
              </div>
            )}

            <div className="border-t border-border pt-3">
              <h4 className="font-medium mb-2">Itens</h4>
              {selectedOrder.order_items?.map(item => (
                <div key={item.id} className="flex justify-between text-sm py-1">
                  <span>{item.quantity}x {item.product_name}</span>
                  <span>{formatCurrency(item.total_price)}</span>
                </div>
              ))}
              <div className="border-t border-border mt-2 pt-2 space-y-1 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(selectedOrder.subtotal)}</span></div>
                <div className="flex justify-between"><span>Entrega</span><span>{formatCurrency(selectedOrder.delivery_fee)}</span></div>
                <div className="flex justify-between font-bold text-base pt-1"><span>Total</span><span className="text-primary">{formatCurrency(selectedOrder.total)}</span></div>
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <p className="text-sm"><strong>Pagamento:</strong> {PAYMENT_LABELS[selectedOrder.payment_method]}</p>
              {selectedOrder.payment_method === 'dinheiro' && selectedOrder.change_for && (
                <p className="text-sm text-text-light">Troco para: {formatCurrency(selectedOrder.change_for)}</p>
              )}
              {selectedOrder.notes && (
                <p className="text-sm mt-2"><strong>Obs:</strong> {selectedOrder.notes}</p>
              )}
            </div>

            {/* Chat */}
            <div className="border-t border-border pt-3">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                Chat
                {chatMessages.filter(m => m.sender_type === 'customer' && !m.read_at).length > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {chatMessages.filter(m => m.sender_type === 'customer' && !m.read_at).length} nova(s)
                  </span>
                )}
              </h4>
              <div className="h-52 overflow-y-auto bg-gray-50 rounded-xl p-3 space-y-2 mb-2 border border-gray-100">
                {chatMessages.length === 0 ? (
                  <p className="text-center text-text-light text-xs py-8">Nenhuma mensagem ainda</p>
                ) : (
                  chatMessages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.sender_type === 'admin' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] px-3 py-2 text-sm ${
                        msg.sender_type === 'admin'
                          ? 'bg-primary text-white rounded-2xl rounded-br-sm'
                          : 'bg-white border border-gray-200 text-text rounded-2xl rounded-bl-sm shadow-sm'
                      }`}>
                        {msg.sender_type === 'customer' && (
                          <p className="text-[10px] font-bold text-primary mb-0.5">{selectedOrder.customer_name}</p>
                        )}
                        <p className="leading-relaxed">{msg.message}</p>
                        <div className={`flex items-center gap-1 justify-end mt-1 ${msg.sender_type === 'admin' ? 'text-white/60' : 'text-text-light'}`}>
                          <span className="text-[10px]">
                            {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {msg.sender_type === 'admin' && (
                            <span className={`text-[11px] ${msg.read_at ? 'text-blue-300' : 'text-white/40'}`}>
                              {msg.read_at ? '✓✓' : '✓'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={adminChatEndRef} />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={adminMessage}
                  onChange={e => setAdminMessage(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendAdminMessage()}
                  placeholder="Responder..."
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-primary transition-colors"
                />
                <button
                  onClick={handleSendAdminMessage}
                  disabled={!adminMessage.trim() || sendingAdminMsg}
                  className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Enviar
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
