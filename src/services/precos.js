import { supabase } from './supabase'
import { invalidar } from './cache'

/**
 * A grade de preços da cozinha.
 *
 * Três faixas de margem por três tamanhos, cada célula com o valor do cartão e
 * o do pix. O preço continua morando no produto -- é ele que o site lê --, e a
 * grade é o molde: aplicar reescreve o preço de todos os pacotes de uma faixa
 * de uma vez, em vez de editar um a um.
 */

export async function getFaixas() {
  const { data, error } = await supabase
    .from('price_tiers')
    .select('*')
    .order('sort_order')
  if (error) throw error
  return data
}

export async function getTabela() {
  const { data, error } = await supabase
    .from('price_table')
    .select('*')
    .order('tier')
    .order('pack_size')
  if (error) throw error
  return data
}

/** Grava uma célula da grade. Não mexe em produto: quem faz isso é `aplicarFaixa`. */
export async function salvarCelula({ tier, pack_size, price, cash_price }) {
  const { error } = await supabase
    .from('price_table')
    .upsert({ tier, pack_size, price, cash_price, updated_at: new Date().toISOString() })
  if (error) throw error
}

/** Os pacotes que seguem a grade, com a faixa de cada um. */
export async function getPacotesDaGrade() {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, price, cash_price, pack_size, price_tier, active, categories(name)')
    .in('pack_size', [50, 100, 200])
    .order('pack_size', { ascending: false })
  if (error) throw error
  return data
}

/**
 * Põe os pacotes na faixa escolhida e reescreve o preço deles com o valor da
 * grade.
 *
 * Um update por tamanho, e não um por produto: são três tamanhos e podem ser
 * dezenas de pacotes. `ids` limita a quais produtos aplicar.
 *
 * @returns {Promise<number>} quantos produtos mudaram de preço
 */
export async function aplicarFaixa(tier, linhasDaTabela, ids) {
  if (!ids?.length) return 0
  let alterados = 0

  for (const linha of linhasDaTabela.filter(l => l.tier === tier)) {
    const alvos = ids.filter(i => i.pack_size === linha.pack_size).map(i => i.id)
    if (!alvos.length) continue

    const { error, count } = await supabase
      .from('products')
      .update(
        { price: linha.price, cash_price: linha.cash_price, price_tier: tier },
        { count: 'exact' },
      )
      .in('id', alvos)
    if (error) throw error
    alterados += count ?? alvos.length
  }

  // O cardápio publicado lê products; sem isto a tela do dono mostraria o preço
  // novo e o site continuaria no antigo até o cache expirar.
  invalidar('products')
  return alterados
}
