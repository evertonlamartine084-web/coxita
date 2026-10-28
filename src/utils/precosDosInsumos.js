import { custoPorInsumo } from './margem'

/**
 * Preço dos insumos ao longo do tempo: o "antes", a variação, o mais barato e o peso de cada um
 * no custo do mês. O histórico vem de insumo_precos (supabase/sql/insumo-precos-historico.sql),
 * sempre em R$ por unidade do insumo (kg, L, un) -- é isso que deixa a bisnaga de 1,8 kg e o pote
 * de 200 g na mesma régua.
 */

const DIA = 864e5

const dataLocal = (iso) => new Date(`${iso}T12:00:00`)

/** Preço de hoje do insumo, por unidade. */
export function precoAtual(insumo) {
  const qtd = Number(insumo.pack_quantity)
  return qtd > 0 ? Number(insumo.pack_price) / qtd : null
}

/**
 * Histórico agrupado por insumo, mais novo primeiro. Linhas da planilha do mesmo mês viram uma só,
 * com a média: a planilha não tem o dia nem a loja de cada compra.
 *
 * @returns Map<supply_id, [{ em, preco, loja, origem, descricao, vezes }]>
 */
export function historicoPorInsumo(historico = []) {
  const grupos = new Map()
  for (const h of historico) {
    const chave = h.origem === 'planilha' ? `${h.supply_id}|${h.em}|planilha` : h.id
    const atual = grupos.get(chave)
    if (atual) {
      atual.soma += Number(h.preco)
      atual.vezes += 1
      atual.preco = atual.soma / atual.vezes
    } else {
      grupos.set(chave, { ...h, preco: Number(h.preco), soma: Number(h.preco), vezes: 1 })
    }
  }
  const porInsumo = new Map()
  for (const g of grupos.values()) {
    if (!porInsumo.has(g.supply_id)) porInsumo.set(g.supply_id, [])
    porInsumo.get(g.supply_id).push(g)
  }
  for (const lista of porInsumo.values()) lista.sort((a, b) => (a.em < b.em ? 1 : a.em > b.em ? -1 : 0))
  return porInsumo
}

/**
 * Hoje contra a compra anterior e contra a mais barata dos últimos `dias`.
 *
 * "Antes" é o preço mais recente com data anterior à do preço de hoje: duas compras no mesmo dia
 * não são antes e depois uma da outra.
 */
export function compararPreco(insumo, lista = [], dias = 90) {
  const hoje = precoAtual(insumo)
  const emHoje = insumo.preco_em
  const antes = lista.find(h => !emHoje || h.em < emHoje) ?? null
  const desde = new Date(Date.now() - dias * DIA)
  const recentes = lista.filter(h => dataLocal(h.em) >= desde)
  const candidatos = [...recentes, ...(hoje ? [{ preco: hoje, em: emHoje, loja: lojaDaOrigem(insumo.preco_origem), atual: true }] : [])]
  const maisBarato = candidatos.reduce((min, h) => (min === null || h.preco < min.preco ? h : min), null)
  return {
    hoje,
    antes,
    variacao: hoje && antes ? (hoje / antes.preco - 1) * 100 : null,
    maisBarato,
    // pagando hoje mais que o mais barato recente, quanto a mais
    acimaDoMaisBarato: hoje && maisBarato && !maisBarato.atual ? (hoje / maisBarato.preco - 1) * 100 : null,
  }
}

/** "Compra em Mar Vermelho" -> "Mar Vermelho"; origem da planilha não tem loja. */
export function lojaDaOrigem(origem) {
  const m = /^Compra em (.+)$/.exec(origem ?? '')
  return m ? m[1] : null
}

/**
 * Os insumos com o preço que valia em `data`: o mais recente do histórico até ela. Insumo sem
 * histórico tão antigo fica com o preço de hoje -- não dá para inventar o passado.
 */
export function insumosNaData(insumos, porInsumo, data) {
  return insumos.map(i => {
    if (i.kind !== 'insumo') return i
    const antigo = (porInsumo.get(i.id) ?? []).find(h => h.em <= data)
    return antigo ? { ...i, pack_price: antigo.preco, pack_quantity: 1 } : i
  })
}

/** Custo de cada insumo e recheio hoje e `dias` atrás, para mostrar quanto a ficha mudou. */
export function custosHojeEAntes(insumos, porInsumo, dias = 30) {
  const data = new Date(Date.now() - dias * DIA).toISOString().slice(0, 10)
  return {
    hoje: custoPorInsumo(insumos),
    antes: custoPorInsumo(insumosNaData(insumos, porInsumo, data)),
  }
}

/**
 * Quanto de cada insumo comprado vai em UMA unidade de um item (insumo, recheio ou ficha de
 * sabor), descendo pelas fichas: um recheio que rende 5,62 kg com 3,6 kg de frango põe 0,64 kg de
 * frango em cada kg dele.
 *
 * @returns Map<id do insumo comprado, quantidade>
 */
export function explodirFicha(id, porId, fator = 1, acumulado = new Map(), visitando = new Set()) {
  const item = porId.get(id)
  if (!item || visitando.has(id)) return acumulado
  if (item.kind !== 'recheio') {
    acumulado.set(id, (acumulado.get(id) ?? 0) + fator)
    return acumulado
  }
  const rende = Number(item.yield_quantity)
  if (!(rende > 0)) return acumulado
  visitando.add(id)
  for (const linha of item.supply_recipe_items ?? []) {
    explodirFicha(linha.child_id, porId, (fator * Number(linha.quantity)) / rende, acumulado, visitando)
  }
  visitando.delete(id)
  return acumulado
}

/**
 * Quanto de cada insumo comprado saiu com as vendas: unidades vendidas de cada sabor em cada
 * produto × a ficha do sabor + a ficha do próprio produto (o óleo do frito).
 *
 * @param vendas  [{ product_id, flavor_id, unidades }]
 * @returns Map<id do insumo comprado, quantidade consumida>
 */
export function consumoPelasVendas(vendas = [], produtos = [], sabores = [], insumos = []) {
  const porId = new Map(insumos.map(i => [i.id, i]))
  const produtoPorId = new Map(produtos.map(p => [p.id, p]))
  const saborPorId = new Map(sabores.map(s => [s.id, s]))
  const consumo = new Map()
  for (const v of vendas) {
    const unidades = Number(v.unidades) || 0
    if (!unidades) continue
    const sabor = saborPorId.get(v.flavor_id)
    const produto = produtoPorId.get(v.product_id)
    const linhas = [
      ...(sabor?.supply_id ? [{ supply_id: sabor.supply_id, quantity: 1 }] : []),
      ...(produto?.product_recipe_items ?? []).map(l => ({
        supply_id: l.supply_id,
        quantity: Number(l.quantity) / Math.max(Number(produto.recipe_yield) || 1, 1),
      })),
    ]
    for (const l of linhas) {
      for (const [insumoId, qtd] of explodirFicha(l.supply_id, porId, Number(l.quantity))) {
        consumo.set(insumoId, (consumo.get(insumoId) ?? 0) + qtd * unidades)
      }
    }
  }
  return consumo
}

/** Em quais fichas de sabor um recheio ou insumo entra (direto ou por dentro de outro recheio). */
export function usadoEm(id, insumos, sabores) {
  const porId = new Map(insumos.map(i => [i.id, i]))
  return sabores
    .filter(s => s.supply_id && explodirFichaComRecheios(s.supply_id, porId).has(id))
    .map(s => s.name)
}

function explodirFichaComRecheios(id, porId, achados = new Set(), visitando = new Set()) {
  const item = porId.get(id)
  if (!item || visitando.has(id)) return achados
  visitando.add(id)
  for (const linha of item.supply_recipe_items ?? []) {
    achados.add(linha.child_id)
    explodirFichaComRecheios(linha.child_id, porId, achados, visitando)
  }
  return achados
}

/**
 * Preço de um item de compra na régua do insumo (R$ por kg, L ou un), como o gatilho do banco
 * calcula: vendido a peso já vem por kg; senão divide pelo que vem na peça × o número grudado na
 * unidade ("CX20" = 20 peças). Null se o item não tem vínculo com o insumo.
 */
export function precoDoItemNoInsumo(item, vinculo) {
  const valor = Number(item.valor_unitario)
  if (!(valor > 0)) return null
  if (/^kg/i.test(item.unidade || '')) return valor
  const pecas = Number(/^[a-z]+(\d+)$/i.exec(item.unidade || '')?.[1] || 1)
  const porPeca = Number(vinculo?.quantidade_por_embalagem)
  return porPeca > 0 ? valor / (porPeca * pecas) : null
}

/**
 * O item desta compra contra o que se pagou antes pelo mesmo insumo (a compra mais recente até a
 * data desta, sem contar ela mesma). { preco, antes, variacao } ou null sem com o que comparar.
 */
export function compararItemDeCompra(item, vinculo, lista = [], data) {
  const preco = precoDoItemNoInsumo(item, vinculo)
  if (preco === null) return null
  const dia = (data ?? new Date().toISOString()).slice(0, 10)
  const antes = lista.find(h => h.em <= dia && h.compra_item_id !== item.id) ?? null
  return { preco, antes, variacao: antes ? (preco / antes.preco - 1) * 100 : null }
}
