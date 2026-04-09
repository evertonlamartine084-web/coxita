import { supabase } from './supabase'

export async function createOrder(orderData, items) {
  // Insert order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert(orderData)
    .select()
    .single()
  if (orderError) throw orderError

  // Insert order items
  const orderItems = items.map(item => ({
    order_id: order.id,
    product_id: item.id,
    product_name: item.name,
    quantity: item.quantity,
    unit_price: item.price,
    total_price: item.price * item.quantity,
  }))

  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(orderItems)
  if (itemsError) throw itemsError

  return order
}

// Admin
export async function getOrders(status = null) {
  let query = supabase
    .from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getOrderById(id) {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function updateOrderStatus(id, status) {
  const { data, error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getOrderByNumber(orderNumber) {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('order_number', orderNumber)
    .single()
  if (error) throw error
  return data
}

export async function getOrdersByPhone(phone) {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('customer_phone', phone)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getOrdersByNumbers(orderNumbers) {
  if (!orderNumbers || orderNumbers.length === 0) return []
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .in('order_number', orderNumbers)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

// Chat messages
export async function getOrderMessages(orderId) {
  const { data, error } = await supabase
    .from('order_messages')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function sendOrderMessage(orderId, senderType, message) {
  const { data, error } = await supabase
    .from('order_messages')
    .insert({ order_id: orderId, sender_type: senderType, message })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function markMessagesRead(orderId, senderType) {
  const { error } = await supabase
    .from('order_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('order_id', orderId)
    .eq('sender_type', senderType)
    .is('read_at', null)
  if (error) throw error
}

export async function getUnreadMessageCounts() {
  const { data, error } = await supabase
    .from('order_messages')
    .select('order_id')
    .eq('sender_type', 'customer')
    .is('read_at', null)
  if (error) throw error
  const counts = {}
  data.forEach(msg => {
    counts[msg.order_id] = (counts[msg.order_id] || 0) + 1
  })
  return counts
}

export async function getActiveOrderByNumbers(orderNumbers) {
  if (!orderNumbers || orderNumbers.length === 0) return null
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .in('order_number', orderNumbers)
    .in('status', ['pendente', 'em_preparo', 'saiu_entrega'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function getTodayOrders() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .gte('created_at', today.toISOString())
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}
