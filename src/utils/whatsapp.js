import { formatCurrency } from './format'

const PAYMENT_LABELS = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  credito: 'Cartão de Crédito',
  debito: 'Cartão de Débito',
}

export function buildOrderMessage(order, items) {
  const lines = [
    `🍗 *NOVO PEDIDO - COXITA* 🍗`,
    `━━━━━━━━━━━━━━━━━━`,
    `📋 *Pedido #${order.order_number}*`,
    ``,
    `👤 *Cliente:* ${order.customer_name}`,
    `📞 *Telefone:* ${order.customer_phone}`,
    ``,
  ]

  if (order.delivery_type === 'entrega') {
    lines.push(`🚴 *Tipo:* Entrega`)
    lines.push(`📍 *Endereço:* ${order.address}, ${order.address_number}`)
    if (order.address_complement) lines.push(`   Complemento: ${order.address_complement}`)
    lines.push(`   Bairro: ${order.neighborhood}`)
    if (order.address_reference) lines.push(`   Ref: ${order.address_reference}`)
  } else {
    lines.push(`🏪 *Tipo:* Retirada no local`)
  }

  lines.push(``)
  lines.push(`🛒 *ITENS:*`)
  lines.push(`━━━━━━━━━━━━━━━━━━`)

  items.forEach(item => {
    lines.push(`  ${item.quantity}x ${item.product_name || item.name} — ${formatCurrency(item.unit_price || item.price)}`)
  })

  lines.push(`━━━━━━━━━━━━━━━━━━`)
  lines.push(`   Subtotal: ${formatCurrency(order.subtotal)}`)
  lines.push(`   Entrega: ${order.delivery_fee > 0 ? formatCurrency(order.delivery_fee) : 'Grátis'}`)
  lines.push(`💰 *TOTAL: ${formatCurrency(order.total)}*`)
  lines.push(``)
  lines.push(`💳 *Pagamento:* ${PAYMENT_LABELS[order.payment_method]}`)

  if (order.payment_method === 'dinheiro' && order.change_for) {
    lines.push(`💵 Troco para: ${formatCurrency(order.change_for)}`)
  }

  if (order.notes) {
    lines.push(``)
    lines.push(`📝 *Obs:* ${order.notes}`)
  }

  lines.push(``)
  lines.push(`⏰ ${new Date().toLocaleString('pt-BR')}`)

  return lines.join('\n')
}

export function sendWhatsAppMessage(phone, message) {
  const cleanPhone = phone.replace(/\D/g, '')
  const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`
  const encoded = encodeURIComponent(message)
  window.open(`https://wa.me/${fullPhone}?text=${encoded}`, '_blank')
}
