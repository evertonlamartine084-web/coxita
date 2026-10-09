export function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatPhone(phone) {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  return phone
}

/**
 * Máscara do campo de telefone, aplicada enquanto a pessoa digita: (84) 99999-9999 para
 * celular e (84) 3333-4444 para fixo. Número de fora começa com "+" e fica como foi digitado.
 */
export function mascararTelefone(valor) {
  const texto = String(valor ?? '')
  if (texto.trim().startsWith('+')) return texto
  const d = texto.replace(/\D/g, '').slice(0, 11)
  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const STATUS_LABELS = {
  pendente: 'Pendente',
  em_preparo: 'Em Preparo',
  saiu_entrega: 'Saiu p/ Entrega',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
}

export const STATUS_COLORS = {
  pendente: 'bg-yellow-100 text-yellow-800',
  em_preparo: 'bg-blue-100 text-blue-800',
  saiu_entrega: 'bg-purple-100 text-purple-800',
  entregue: 'bg-green-100 text-green-800',
  cancelado: 'bg-red-100 text-red-800',
}

/** Situação do pagamento como a loja fala. "nao_iniciado" num pedido entregue é dinheiro a receber. */
export const PAYMENT_STATUS_LABELS = {
  pago: 'Pago',
  nao_iniciado: 'A receber',
  aguardando: 'Aguardando pagamento',
  estornado: 'Estornado',
}

/** Entregue e ainda sem o dinheiro confirmado: entra no "A receber" do Dashboard. */
export const aReceber = (o) =>
  o.status === 'entregue' && !['pago', 'estornado'].includes(o.payment_status)

export const PAYMENT_LABELS = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  credito: 'Cartão de Crédito',
  debito: 'Cartão de Débito',
}

/**
 * Centavos nao bastam para custo de insumo: 1 g de massa de pastel custa
 * R$ 0,0119, e arredondar isso para R$ 0,01 erra 16% no custo do pastel.
 */
export function formatCurrencyFine(value, digits = 4) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value) || 0)
}

/** Percentual com virgula. Travessao quando nao ha numero a mostrar. */
export function formatPercent(value, digits = 1) {
  const n = Number(value)
  if (value === null || value === undefined || !Number.isFinite(n)) return '—'
  return `${n.toFixed(digits).replace('.', ',')}%`
}

/** Quantidade da ficha: 0,000315 kg nao pode virar 0,00. */
export function formatQuantidade(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  const casas = n < 0.01 ? 6 : n < 1 ? 4 : 3
  return n.toFixed(casas).replace('.', ',').replace(/,?0+$/, '') || '0'
}
