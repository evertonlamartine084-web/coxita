import { supabase } from './supabase'
import { cached } from './cache'

export const CHAVE_PRECO_SABOR = 'flavor_prices'

/**
 * Preço de cada sabor em cada tamanho de pacote, no formato que
 * `precoDaComposicao` espera: `${flavor_id}:${pack_size}` -> { price, cash_price }.
 *
 * Só os sabores que fogem do preço do pacote aparecem aqui -- hoje os pastéis.
 * O resto do cardápio custa o preço do pacote e não precisa de linha.
 */
export async function getPrecoPorSabor() {
  return cached(CHAVE_PRECO_SABOR, async () => {
    const { data, error } = await supabase
      .from('flavor_prices')
      .select('flavor_id, pack_size, price, cash_price')
    if (error) throw error
    return Object.fromEntries(
      (data ?? []).map(l => [
        `${l.flavor_id}:${l.pack_size}`,
        { price: Number(l.price), cash_price: Number(l.cash_price) },
      ]),
    )
  }, 5 * 60_000)
}
