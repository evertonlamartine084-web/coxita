import { supabase } from './supabase'

export async function createPaymentPreference(order, items) {
  const { data, error } = await supabase.functions.invoke('create-payment', {
    body: {
      order_id: order.id,
      order_number: order.order_number,
      customer_name: order.customer_name,
      customer_email: null,
      delivery_fee: order.delivery_fee,
      items: items.map(i => ({
        product_name: i.name,
        quantity: i.quantity,
        unit_price: i.price,
      })),
    },
  })

  if (error) throw error
  return data
}
