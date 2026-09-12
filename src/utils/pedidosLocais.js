/**
 * Códigos de acesso dos pedidos feitos neste aparelho.
 *
 * O acompanhamento abre pelo código do link, não pelo número. Guardamos os códigos aqui para
 * que "Meus pedidos" e a volta ao pedido continuem funcionando com um toque, sem pedir nada.
 */

const CHAVE = 'coxita-order-tokens'

/** { [order_number]: public_token } */
export function lerTokens() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) || '{}')
  } catch {
    return {}
  }
}

export function guardarToken(orderNumber, token) {
  if (!orderNumber || !token) return
  try {
    const atual = lerTokens()
    atual[String(orderNumber)] = token
    localStorage.setItem(CHAVE, JSON.stringify(atual))
  } catch {
    // storage bloqueado: o cliente ainda acessa pelo link que recebeu
  }
}

export function tokenDoPedido(orderNumber) {
  return lerTokens()[String(orderNumber)] ?? null
}

/** O caminho do acompanhamento: com código quando temos, sem ele como último recurso. */
export function linkDoPedido(orderNumber) {
  const token = tokenDoPedido(orderNumber)
  return token ? `/acompanhar/${token}` : '/acompanhar'
}
