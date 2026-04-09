import { supabase } from './supabase'

export async function notifyNewOrder(order, items) {
  try {
    await supabase.functions.invoke('notify-order', {
      body: {
        order: {
          order_number: order.order_number,
          customer_name: order.customer_name,
          customer_phone: order.customer_phone,
          delivery_type: order.delivery_type,
          address: order.address,
          address_number: order.address_number,
          neighborhood: order.neighborhood,
          payment_method: order.payment_method,
          change_for: order.change_for,
          notes: order.notes,
          scheduled_for: order.scheduled_for,
          subtotal: order.subtotal,
          delivery_fee: order.delivery_fee,
          total: order.total,
        },
        items: items.map(i => ({
          name: i.name,
          quantity: i.quantity,
          price: i.price,
        })),
      },
    })
  } catch (err) {
    console.error('Erro ao notificar:', err)
  }
}
