import { useCallback, useEffect, useState, useRef } from 'react'
import { getOrders, updateOrderStatus, getOrderMessages, sendOrderMessage, markMessagesRead, getUnreadMessageCounts, estornarPedido, emitirNota } from '../../services/orders'
import { getSettings } from '../../services/settings'
import EditarItensPedido from '../../components/admin/EditarItensPedido'
import NovoPedidoModal from '../../components/admin/NovoPedidoModal'
import { supabase } from '../../services/supabase'
import { formatCurrency, formatDate, STATUS_LABELS, STATUS_COLORS, PAYMENT_LABELS } from '../../utils/format'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Loading from '../../components/ui/Loading'
import { playOrderAlert } from '../../utils/alertSound'
import { impressaoAutoLigada, definirImpressaoAuto, imprimirComanda, marcarImpressa } from '../../utils/comanda'
import toast from 'react-hot-toast'

const STATUSES = ['pendente', 'em_preparo', 'saiu_entrega', 'entregue', 'cancelado']

// Aba dos pedidos com data marcada. Não é um status: o pedido agendado tem o seu próprio
// (pendente, em preparo…), e ficar na fila de hoje só atrapalha quem está olhando o que sai agora.
const AGENDADOS = 'agendados'

/** Está marcado para outro momento e ainda não foi resolvido. */
const ehAgendadoEmAberto = (o) =>
  !!o.scheduled_for && !['entregue', 'cancelado'].includes(o.status)

export default function OrdersPage() {
  const [orders, setOrders] = useState([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [editandoItens, setEditandoItens] = useState(false)
  const [estornando, setEstornando] = useState(false)
  const [emitindoNota, setEmitindoNota] = useState(false)
  const [criandoPedido, setCriandoPedido] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('coxita_admin_sound') !== 'off'
  })
  const [impressaoAuto, setImpressaoAuto] = useState(impressaoAutoLigada)
  const [newOrderIds, setNewOrderIds] = useState([])
  const prevOrderIdsRef = useRef(null)
  const [chatMessages, setChatMessages] = useState([])
  const [adminMessage, setAdminMessage] = useState('')
  const [sendingAdminMsg, setSendingAdminMsg] = useState(false)
  const adminChatEndRef = useRef(null)
  const [unreadCounts, setUnreadCounts] = useState({})
  const adminShouldScrollRef = useRef(false)

  // "agendados" filtra aqui, não no banco: o banco só conhece status
  const statusDoFiltro = filter === AGENDADOS ? null : (filter || null)
  const agendadosEmAberto = orders.filter(ehAgendadoEmAberto).length
  // Agendado fica só na aba dele até ser entregue ou cancelado; aí volta para as abas de sempre
  const pedidosVisiveis = filter === AGENDADOS
    ? orders.filter(ehAgendadoEmAberto)
    : orders.filter(o => !ehAgendadoEmAberto(o))

  const loadOrders = useCallback((showLoading = false) => {
    if (showLoading) setLoading(true)
    getOrders(filter === AGENDADOS ? null : (filter || null))
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
    getUnreadMessageCounts().then(setUnreadCounts).catch(error => console.warn('Não foi possível carregar as mensagens não lidas:', error))
  }, [filter])

  useEffect(() => { loadOrders(true) }, [loadOrders])

  // Auto-reload every 15 seconds (silent, no loading spinner)
  useEffect(() => {
    const interval = setInterval(() => loadOrders(false), 15000)
    return () => clearInterval(interval)
  }, [loadOrders])

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
  }, [selectedOrder])

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
      }).then(res => {
        console.log('Chat push sent:', res.data, 'order:', selectedOrder.order_number)
        if (res.error) console.error('Chat push error:', res.error)
      }).catch(err => console.error('Chat push network error:', err))
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

  const toggleImpressao = () => {
    const ligar = !impressaoAuto
    definirImpressaoAuto(ligar)
    setImpressaoAuto(ligar)
    if (ligar) toast.success('Impressão automática ligada neste computador. Os próximos pedidos saem na impressora.')
    else toast('Impressão automática desligada neste computador')
  }

  const handleImprimir = async (pedido) => {
    // marca antes: se a automática rodar agora, não sai a mesma comanda duas vezes
    marcarImpressa(pedido.id)
    await imprimirComanda(pedido)
  }

  const handleEmitirNota = async (orderId) => {
    setEmitindoNota(true)
    try {
      const r = await emitirNota(orderId)
      toast.success(r.numero ? `Nota nº ${r.numero} emitida.` : 'Nota emitida.')
    } catch (err) {
      toast.error(`Nota não emitida: ${err.message}`, { duration: 8000 })
    } finally {
      setEmitindoNota(false)
      // o resultado (número, link ou erro) fica gravado no pedido; recarrega para mostrar
      const atualizados = await getOrders(statusDoFiltro).catch(() => null)
      if (atualizados) {
        setOrders(atualizados)
        setSelectedOrder(prev => (prev?.id === orderId ? atualizados.find(o => o.id === orderId) ?? prev : prev))
      }
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

    // Nota sai quando a mercadoria sai (ver bling-preparacao.sql) — só com a automática ligada
    // em Configurações; desligada, fica o botão no pedido
    if (newStatus === 'saiu_entrega') {
      getSettings()
        .then(s => { if (s.bling_nfe_automatica === 'sim') handleEmitirNota(orderId) })
        .catch(err => console.error('Configurações indisponíveis:', err))
    }

    loadOrders()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Pedidos</h1>
        <div className="flex items-center gap-2">
        <button
          onClick={() => setCriandoPedido(true)}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
        >
          + Novo pedido
        </button>
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
        <button
          onClick={toggleImpressao}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            impressaoAuto
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
          title="Vale só para este computador: ligue apenas no que está com a impressora"
        >
          🖨️
          <span className="hidden sm:inline">{impressaoAuto ? 'Impressão automática' : 'Impressão desligada'}</span>
        </button>
        </div>
      </div>

      <NovoPedidoModal
        aberto={criandoPedido}
        aoFechar={() => setCriandoPedido(false)}
        aoCriar={() => loadOrders()}
      />

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
        <button
          onClick={() => setFilter(AGENDADOS)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap ${
            filter === AGENDADOS ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-text'
          }`}
        >
          Agendados{agendadosEmAberto > 0 ? ` (${agendadosEmAberto})` : ''}
        </button>
      </div>

      {loading ? <Loading /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {pedidosVisiveis.length === 0 ? (
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
                  {pedidosVisiveis.map(order => (
                    <tr key={order.id} className={`hover:bg-gray-50 transition-colors ${newOrderIds.includes(order.id) ? 'bg-green-50 animate-pulse' : ''}`}>
                      <td className="px-4 py-3 font-medium">
                        #{order.order_number}
                        {/* o cliente só conhece este: é o que ele vai falar no WhatsApp */}
                        {order.codigo_cliente && (
                          <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-gray-600">
                            {order.codigo_cliente}
                          </span>
                        )}
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
        title={`Pedido #${selectedOrder?.order_number}${selectedOrder?.codigo_cliente ? ` · cliente: ${selectedOrder.codigo_cliente}` : ''}`}
      >
        {selectedOrder && (
          <div className="space-y-4">
            <div>
              <Badge className={STATUS_COLORS[selectedOrder.status]}>{STATUS_LABELS[selectedOrder.status]}</Badge>
              <span className="text-text-light text-sm ml-2">{formatDate(selectedOrder.created_at)}</span>
              <button
                type="button"
                onClick={() => handleImprimir(selectedOrder)}
                className="float-right cursor-pointer rounded-lg border border-border px-3 py-1 text-xs font-semibold transition-colors hover:bg-gray-50"
              >
                🖨️ Imprimir comanda
              </button>
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
              <div className="mb-2 flex items-center justify-between">
                <h4 className="font-medium">Itens</h4>
                {!editandoItens && ['pendente', 'em_preparo'].includes(selectedOrder.status) && (
                  <button
                    type="button"
                    onClick={() => setEditandoItens(true)}
                    className="cursor-pointer text-xs font-semibold text-primary hover:text-primary-dark"
                  >
                    Editar itens
                  </button>
                )}
              </div>

              {editandoItens ? (
                <EditarItensPedido
                  pedido={selectedOrder}
                  aoCancelar={() => setEditandoItens(false)}
                  aoSalvar={(atualizado) => {
                    setEditandoItens(false)
                    // recarrega para trazer os itens novos junto do pedido
                    loadOrders()
                    setSelectedOrder(prev => prev ? { ...prev, ...atualizado } : prev)
                  }}
                />
              ) : (
              <>
              {selectedOrder.order_items?.map(item => (
                <div key={item.id} className="text-sm py-1">
                  <div className="flex justify-between">
                    <span>{item.quantity}x {item.product_name}</span>
                    <span>{formatCurrency(item.total_price)}</span>
                  </div>
                  {item.order_item_flavors?.length > 0 && (
                    <ul className="mt-1 ml-4 space-y-0.5">
                      {item.order_item_flavors.map(sabor => (
                        <li key={sabor.id} className="text-text-light text-xs">
                          {/* quantity e por pacote; a cozinha precisa do total */}
                          <span className="font-semibold tabular-nums">
                            {sabor.quantity * item.quantity}x
                          </span>{' '}
                          {sabor.flavor_name}
                          {item.quantity > 1 && (
                            <span className="opacity-70"> ({sabor.quantity} por pacote)</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              <div className="border-t border-border mt-2 pt-2 space-y-1 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(selectedOrder.subtotal)}</span></div>
                {/* Sem esta linha, subtotal + entrega nao fecha com o total e a
                    cozinha fica sem saber se o desconto foi cupom ou pix. */}
                {Number(selectedOrder.discount) > 0 && (
                  <div className="flex justify-between text-accent">
                    <span>
                      Desconto
                      {selectedOrder.coupon_code && ` · cupom ${selectedOrder.coupon_code}`}
                      {Number(selectedOrder.discount_avista) > 0 && ' · à vista'}
                    </span>
                    <span>-{formatCurrency(selectedOrder.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between"><span>Entrega</span><span>{formatCurrency(selectedOrder.delivery_fee)}</span></div>
                <div className="flex justify-between font-bold text-base pt-1"><span>Total</span><span className="text-primary">{formatCurrency(selectedOrder.total)}</span></div>
              </div>
              </>
              )}
            </div>

            <div className="border-t border-border pt-3">
              <p className="text-sm"><strong>Pagamento:</strong> {PAYMENT_LABELS[selectedOrder.payment_method]}</p>
              {selectedOrder.payment_status && (
                <p className="text-sm text-text-light">
                  Situação: <strong>{selectedOrder.payment_status}</strong>
                </p>
              )}

              {/* Estorno só aparece com dinheiro de fato recebido pela Cielo e pedido ainda em
                  casa. Depois de despachado o botão some — e o banco recusa, mesmo que alguém
                  chame a função por fora. */}
              {selectedOrder.payment_status === 'pago' && selectedOrder.cielo_payment_id && (
                ['pendente', 'em_preparo'].includes(selectedOrder.status) ? (
                  <button
                    type="button"
                    disabled={estornando}
                    onClick={async () => {
                      if (!confirm(`Devolver ${formatCurrency(selectedOrder.total)} ao cliente? O pedido será marcado como estornado.`)) return
                      setEstornando(true)
                      try {
                        await estornarPedido(selectedOrder.id)
                        toast.success('Estorno feito. O dinheiro volta pelo mesmo meio de pagamento.')
                        loadOrders()
                        setSelectedOrder(prev => prev ? { ...prev, payment_status: 'estornado' } : prev)
                      } catch (err) {
                        toast.error(err.message || 'Não foi possível estornar.')
                      } finally {
                        setEstornando(false)
                      }
                    }}
                    className="mt-2 cursor-pointer rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-60"
                  >
                    {estornando ? 'Estornando…' : `Estornar ${formatCurrency(selectedOrder.total)}`}
                  </button>
                ) : (
                  <p className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-500">
                    Pedido já despachado — o estorno está bloqueado para não devolver dinheiro de
                    pedido entregue.
                  </p>
                )
              )}
              {/* Nota fiscal: pedido cancelado não recebe nota, e a emitida só se consulta */}
              {selectedOrder.status !== 'cancelado' && (
                <div className="mt-3 rounded-lg border border-border p-2.5 text-sm">
                  <p>
                    <strong>Nota fiscal:</strong>{' '}
                    {selectedOrder.bling_nfe_status === 'emitida'
                      ? `nº ${selectedOrder.bling_nfe_numero ?? '—'}`
                      : selectedOrder.bling_nfe_status === 'pendente'
                        ? 'emitindo…'
                        : selectedOrder.bling_nfe_status === 'erro'
                          ? 'falhou'
                          : selectedOrder.bling_nfe_status === 'cancelada'
                            ? 'cancelada'
                            : 'não emitida'}
                  </p>
                  {selectedOrder.bling_nfe_status === 'erro' && selectedOrder.bling_nfe_erro && (
                    <p className="mt-1 text-xs text-red-700">{selectedOrder.bling_nfe_erro}</p>
                  )}
                  {selectedOrder.bling_nfe_status === 'emitida' && selectedOrder.bling_nfe_danfe && (
                    <a
                      href={selectedOrder.bling_nfe_danfe}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-xs font-semibold text-primary underline"
                    >
                      Abrir DANFE
                    </a>
                  )}
                  {['erro', 'pendente', null, undefined].includes(selectedOrder.bling_nfe_status) && (
                    <button
                      type="button"
                      disabled={emitindoNota}
                      onClick={() => handleEmitirNota(selectedOrder.id)}
                      className="mt-2 block cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-gray-50 disabled:opacity-60"
                    >
                      {emitindoNota
                        ? 'Emitindo…'
                        : selectedOrder.bling_nfe_status ? 'Tentar de novo' : 'Emitir nota'}
                    </button>
                  )}
                </div>
              )}
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
