import { formatCurrency } from '../utils/format'

const NTFY_TOPIC = 'coxita-pedidos'

const PAYMENT_LABELS = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  credito: 'Cartao Credito',
  debito: 'Cartao Debito',
}

export async function notifyNewOrder(order, items) {
  const itemsList = items
    .map(i => `  ${i.quantity}x ${i.product_name || i.name} - ${formatCurrency(i.unit_price || i.price)}`)
    .join('\n')

  const address = order.delivery_type === 'entrega'
    ? `${order.address}, ${order.address_number} - ${order.neighborhood}${order.address_complement ? ` (${order.address_complement})` : ''}${order.address_reference ? ` | Ref: ${order.address_reference}` : ''}`
    : 'Retirada no local'

  const body = [
    `Cliente: ${order.customer_name}`,
    `Telefone: ${order.customer_phone}`,
    ``,
    `Tipo: ${order.delivery_type === 'entrega' ? 'Entrega' : 'Retirada'}`,
    `Endereco: ${address}`,
    ``,
    `Itens:`,
    itemsList,
    ``,
    `Subtotal: ${formatCurrency(order.subtotal)}`,
    `Entrega: ${order.delivery_fee > 0 ? formatCurrency(order.delivery_fee) : 'Gratis'}`,
    `TOTAL: ${formatCurrency(order.total)}`,
    ``,
    `Pagamento: ${PAYMENT_LABELS[order.payment_method]}`,
    order.payment_method === 'dinheiro' && order.change_for ? `Troco para: ${formatCurrency(order.change_for)}` : '',
    order.notes ? `Obs: ${order.notes}` : '',
  ].filter(Boolean).join('\n')

  try {
    await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
      method: 'POST',
      headers: {
        'Title': `Novo Pedido #${order.order_number}`,
        'Priority': '5',
        'Tags': 'chicken,shopping_cart',
      },
      body,
    })
  } catch (err) {
    console.error('Erro ao enviar notificacao:', err)
  }
}
