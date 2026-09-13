/**
 * Preço de quem paga à vista.
 *
 * Pix e dinheiro não passam pela maquininha, então a loja não paga taxa neles
 * -- e o que o cliente economiza é essa taxa.
 *
 * Há duas formas de dizer isso, e as duas convivem:
 *
 * 1. `products.cash_price` -- o preço à vista escrito no produto. É o que a
 *    planilha da cozinha calcula: cada tamanho tem o seu valor, tirado da
 *    margem, e não um corte do preço cheio. Por isso R$ 17,00 vira R$ 15,79
 *    (7,1%), R$ 32,00 vira R$ 29,59 (7,5%) e R$ 60,59 vira R$ 55,69 (8,1%):
 *    percentual nenhum acerta os três, e arredondar por cima do subtotal dava
 *    centavos que não existem em lugar nenhum.
 *
 * 2. `settings.desconto_avista_percent` -- o percentual, para quem não tem
 *    preço próprio. É o caso das bebidas, onde o desconto é mesmo a taxa.
 *
 * O preço cheio continua sendo o do cardápio: é ele que sustenta a margem no
 * crédito (ver src/utils/margem.js).
 */

/** Formas de pagamento que não passam pela maquininha. */
export const FORMAS_A_VISTA = ['pix', 'pix_online', 'dinheiro']

export function ehAVista(formaDePagamento) {
  return FORMAS_A_VISTA.includes(formaDePagamento)
}

/** Percentual configurado no painel. Zero desliga o desconto no site todo. */
export function percentualAVista(settings) {
  const valor = Number(settings?.desconto_avista_percent)
  if (!Number.isFinite(valor) || valor <= 0 || valor >= 100) return 0
  return valor
}

/** O preço próprio do item, se houver um válido. */
export function precoProprioAVista(item) {
  const cheio = Number(item?.price)
  const proprio = Number(item?.cash_price)
  if (!Number.isFinite(cheio) || !Number.isFinite(proprio)) return null
  if (proprio <= 0 || proprio > cheio) return null
  return proprio
}

/** Quanto uma unidade deste item custa à vista. */
export function precoAVistaDoItem(item, settings) {
  const cheio = Number(item?.price) || 0
  const proprio = precoProprioAVista(item)
  if (proprio !== null) return proprio
  const percentual = percentualAVista(settings)
  if (!percentual) return cheio
  // Centavos inteiros: um total com fração de centavo não fecha com o extrato.
  return cheio - Math.round(cheio * percentual) / 100
}

/**
 * Quanto abater do pedido, em reais.
 *
 * `teto` existe por causa do cupom: os dois descontos não podem, somados,
 * passar do próprio subtotal.
 */
export function calcularDescontoAvista(itens, formaDePagamento, settings, teto = Infinity) {
  if (!ehAVista(formaDePagamento)) return 0
  const bruto = (itens ?? []).reduce((soma, item) => {
    const cheio = Number(item?.price) || 0
    const quantidade = Number(item?.quantity) || 1
    return soma + (cheio - precoAVistaDoItem(item, settings)) * quantidade
  }, 0)
  const valor = Math.round(bruto * 100) / 100
  if (valor <= 0) return 0
  return Math.min(valor, Math.max(Number(teto) || 0, 0))
}

/**
 * Texto curto para selo e aviso: "3,5% de desconto".
 *
 * Some quando algum item tem preço próprio: ali não existe um percentual único
 * para anunciar, e arredondar um número para o selo seria prometer uma conta
 * que o carrinho não faz.
 */
export function rotuloDoDesconto(settings, itens) {
  if ((itens ?? []).some(item => precoProprioAVista(item) !== null)) return null
  const percentual = percentualAVista(settings)
  if (!percentual) return null
  const numero = percentual.toFixed(percentual % 1 === 0 ? 0 : 1).replace('.', ',')
  return `${numero}%`
}
