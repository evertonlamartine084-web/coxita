import { supabase } from './supabase'
import { cached, invalidar } from './cache'

/**
 * Leitura e escrita da ficha técnica: insumos, recheios e parâmetros de preço.
 *
 * Tudo aqui é painel: nenhuma destas tabelas tem leitura pública, porque o
 * custo não é assunto do cliente. As três leituras são pequenas (dezenas de
 * linhas) e a conta é feita no navegador -- ver src/utils/margem.js.
 */

export const CHAVE_INSUMOS = 'custos:insumos'
export const CHAVE_FICHAS = 'custos:fichas'
export const CHAVE_PARAMS = 'custos:params'

/** Insumos e recheios, cada recheio com sua ficha. */
export async function getInsumos() {
  return cached(CHAVE_INSUMOS, async () => {
    const { data, error } = await supabase
      .from('supplies')
      .select('*, supply_recipe_items!supply_recipe_items_parent_id_fkey(id, child_id, quantity)')
      .order('kind')
      .order('sort_order')
      .order('name')
    if (error) throw error
    return data
  })
}

/** Produtos com a ficha técnica. */
export async function getFichas() {
  return cached(CHAVE_FICHAS, async () => {
    const { data, error } = await supabase
      .from('products')
      .select(`
        id, name, price, preco_ifood, pack_size, active, sort_order, so_painel,
        recipe_yield, waste_percent, target_margin, custo_embalagem, custo_fixo_unidade,
        flavor_group, fixed_flavor_id,
        categories(name, slug),
        product_recipe_items(id, supply_id, quantity)
      `)
      .order('sort_order')
    if (error) throw error
    return data
  })
}

export const CHAVE_SABORES = 'custos:sabores'

/** Sabores com a ficha de uma unidade (supply_id) e o preço próprio por tamanho, quando tem. */
export async function getSabores() {
  return cached(CHAVE_SABORES, async () => {
    const { data, error } = await supabase
      .from('flavors')
      .select('id, name, group_slug, active, sort_order, supply_id, flavor_prices(pack_size, price)')
      .order('sort_order')
    if (error) throw error
    return data
  })
}

/**
 * Unidades vendidas nos últimos `dias`, por produto e sabor, pedidos cancelados fora. Dá o peso de
 * cada sabor na margem média e quanto de cada insumo saiu no mês.
 * [{ product_id, flavor_id, unidades }]
 */
export async function getVendasDeSabores(dias = 30) {
  return cached(`custos:vendas:${dias}`, async () => {
    const desde = new Date(Date.now() - dias * 864e5).toISOString()
    const { data, error } = await supabase
      .from('order_item_flavors')
      .select('flavor_id, quantity, order_items!inner(product_id, orders!inner(created_at, status))')
      .gte('order_items.orders.created_at', desde)
      .neq('order_items.orders.status', 'cancelado')
    if (error) throw error
    const porChave = new Map()
    for (const linha of data ?? []) {
      const chave = `${linha.order_items.product_id}|${linha.flavor_id}`
      const atual = porChave.get(chave) ?? { product_id: linha.order_items.product_id, flavor_id: linha.flavor_id, unidades: 0 }
      atual.unidades += Number(linha.quantity || 0)
      porChave.set(chave, atual)
    }
    return [...porChave.values()]
  })
}

/** Unidades por sabor, somando os produtos. Map<flavor_id, unidades> */
export function mixDosSabores(vendas = []) {
  const mix = new Map()
  for (const v of vendas) mix.set(v.flavor_id, (mix.get(v.flavor_id) ?? 0) + v.unidades)
  return mix
}

/** Todo preço já pago por insumo (insumo_precos), em R$ por kg, L ou un. Poucas centenas de linhas. */
export async function getHistoricoDePrecos() {
  return cached('custos:historico', async () => {
    const { data, error } = await supabase
      .from('insumo_precos')
      .select('id, supply_id, em, preco, loja, origem, descricao, compra_item_id')
      .order('em', { ascending: false })
    if (error) throw error
    return data ?? []
  })
}

export async function getParams() {
  return cached(CHAVE_PARAMS, async () => {
    const { data, error } = await supabase
      .from('pricing_params')
      .select('*')
      .eq('id', true)
      .single()
    if (error) throw error
    return data
  })
}

export async function salvarParams(patch) {
  const { data, error } = await supabase
    .from('pricing_params')
    .update(patch)
    .eq('id', true)
    .select()
    .single()
  if (error) throw error
  invalidar('custos')
  return data
}

// ---------------------------------------------------------------------------
// Insumos e recheios
// ---------------------------------------------------------------------------

export async function createInsumo(insumo) {
  const { data, error } = await supabase
    .from('supplies')
    .insert(insumo)
    .select()
    .single()
  if (error) throw error
  invalidar('custos')
  return data
}

export async function updateInsumo(id, patch) {
  const { data, error } = await supabase
    .from('supplies')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  invalidar('custos')
  return data
}

/**
 * O banco recusa apagar insumo que está em alguma ficha (FK restrict), e é
 * esse o comportamento desejado -- apagar em cascata sumiria com custo sem
 * avisar. Quem chama traduz o erro para o dono da loja.
 */
export async function deleteInsumo(id) {
  const { error } = await supabase.from('supplies').delete().eq('id', id)
  if (error) throw error
  invalidar('custos')
}

export function insumoEstaEmUso(id, insumos, fichas) {
  const emRecheio = insumos.some(i =>
    (i.supply_recipe_items ?? []).some(linha => linha.child_id === id))
  const emProduto = fichas.some(p =>
    (p.product_recipe_items ?? []).some(linha => linha.supply_id === id))
  return emRecheio || emProduto
}

// ---------------------------------------------------------------------------
// Fichas
// ---------------------------------------------------------------------------

/**
 * Aplica a ficha editada na tela sobre o que está no banco.
 *
 * Faz diferença em vez de apagar tudo e reinserir: a tabela tem unique
 * (pai, item) e um delete-then-insert perderia o histórico de created_at e,
 * pior, deixaria a ficha vazia por um instante se o insert falhasse no meio.
 */
async function sincronizarLinhas({ tabela, colunaPai, paiId, colunaItem, linhas }) {
  const desejadas = linhas
    .filter(l => l[colunaItem] && Number(l.quantity) > 0)
    .map(l => ({ item: l[colunaItem], quantity: Number(l.quantity) }))

  const { data: atuais, error: erroLeitura } = await supabase
    .from(tabela)
    .select(`id, ${colunaItem}, quantity`)
    .eq(colunaPai, paiId)
  if (erroLeitura) throw erroLeitura

  const atualPorItem = new Map(atuais.map(a => [a[colunaItem], a]))
  const desejadaPorItem = new Map(desejadas.map(d => [d.item, d]))

  const remover = atuais.filter(a => !desejadaPorItem.has(a[colunaItem])).map(a => a.id)
  const inserir = desejadas
    .filter(d => !atualPorItem.has(d.item))
    .map(d => ({ [colunaPai]: paiId, [colunaItem]: d.item, quantity: d.quantity }))
  const atualizar = desejadas.filter(d => {
    const atual = atualPorItem.get(d.item)
    return atual && Number(atual.quantity) !== d.quantity
  })

  if (remover.length) {
    const { error } = await supabase.from(tabela).delete().in('id', remover)
    if (error) throw error
  }
  if (inserir.length) {
    const { error } = await supabase.from(tabela).insert(inserir)
    if (error) throw error
  }
  for (const linha of atualizar) {
    const { error } = await supabase
      .from(tabela)
      .update({ quantity: linha.quantity })
      .eq('id', atualPorItem.get(linha.item).id)
    if (error) throw error
  }

  invalidar('custos')
}

/** linhas: [{ child_id, quantity }] */
export async function salvarFichaDoRecheio(recheioId, linhas) {
  return sincronizarLinhas({
    tabela: 'supply_recipe_items',
    colunaPai: 'parent_id',
    paiId: recheioId,
    colunaItem: 'child_id',
    linhas,
  })
}

/** linhas: [{ supply_id, quantity }] */
export async function salvarFichaDoProduto(produtoId, linhas) {
  return sincronizarLinhas({
    tabela: 'product_recipe_items',
    colunaPai: 'product_id',
    paiId: produtoId,
    colunaItem: 'supply_id',
    linhas,
  })
}

/**
 * Campos do produto que a tela de margem edita: rendimento, perda, margem
 * desejada e -- quando você aceita o preço sugerido -- o preço de venda.
 */
export async function salvarProduto(produtoId, patch) {
  const { data, error } = await supabase
    .from('products')
    .update(patch)
    .eq('id', produtoId)
    .select()
    .single()
  if (error) throw error
  invalidar('custos')
  // O cardápio lê products de outra chave de cache; sem isto o preço novo só
  // apareceria na loja depois do TTL.
  invalidar('products')
  return data
}
