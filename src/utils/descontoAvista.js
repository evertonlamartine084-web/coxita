/**
 * Desconto de quem paga à vista.
 *
 * Pix e dinheiro não passam pela maquininha, então a loja não paga taxa neles
 * -- e o desconto devolve ao cliente exatamente essa taxa. O preço do cardápio
 * já é calculado para sustentar a margem no crédito (ver src/utils/margem.js),
 * então este desconto não sai da margem: sai do que deixou de ser cobrado.
 *
 * Por isso o percentual padrão acompanha a taxa do crédito. Se um dia ele for
 * ajustado para mais do que a taxa, a diferença passa a sair do bolso da
 * cozinha -- o painel de Margens é onde isso aparece.
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

/**
 * Quanto abater, em reais.
 *
 * A base é o subtotal já sem o cupom: empilhar os dois sobre o valor cheio
 * daria desconto sobre desconto e, num cupom generoso, poderia passar do
 * próprio subtotal.
 */
export function calcularDescontoAvista(baseDeCalculo, formaDePagamento, settings) {
  const percentual = percentualAVista(settings)
  if (!percentual || !ehAVista(formaDePagamento)) return 0
  const base = Number(baseDeCalculo)
  if (!Number.isFinite(base) || base <= 0) return 0
  // Centavos inteiros: um total com fração de centavo não fecha com o que a
  // maquininha e o extrato do pix mostram.
  return Math.round(base * percentual) / 100
}

/** Texto curto para selo e aviso: "3,5% de desconto". */
export function rotuloDoDesconto(settings) {
  const percentual = percentualAVista(settings)
  if (!percentual) return null
  const numero = percentual.toFixed(percentual % 1 === 0 ? 0 : 1).replace('.', ',')
  return `${numero}%`
}
