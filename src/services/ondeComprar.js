import { supabase } from './supabase'

/**
 * Onde comprar: o que o robô cotar-mercados achou nos mercados (supabase/sql/onde-comprar.sql).
 * Tudo painel; o preço vem por kg/L/un, na unidade do insumo.
 */

const PAGINA = 1000

/**
 * O dia mais recente que o robô leu (hoje, ou ontem antes das 6h30), em páginas: o painel traz no
 * máximo 1.000 linhas por consulta e as cinco lojas do Nordestão já dão ~700 por dia. O menor dos
 * 30 dias vem somado pelo banco (mercado_minimos).
 */
export async function carregarOndeComprar() {
  const [buscas, ultimo, minimos, rodada] = await Promise.all([
    supabase.from('mercado_buscas').select('*'),
    supabase.from('mercado_precos').select('visto_em').order('visto_em', { ascending: false }).limit(1).maybeSingle(),
    supabase.rpc('mercado_minimos', { p_dias: 30 }),
    supabase.from('mercado_rodadas').select('*').order('id', { ascending: false }).limit(1).maybeSingle(),
  ])
  for (const r of [buscas, ultimo, minimos, rodada]) if (r.error) throw r.error

  const dia = ultimo.data?.visto_em ?? null
  const precos = []
  for (let de = 0; dia; de += PAGINA) {
    const { data, error } = await supabase.from('mercado_precos').select('*')
      .eq('visto_em', dia).order('preco_unidade').range(de, de + PAGINA - 1)
    if (error) throw error
    precos.push(...data)
    if (data.length < PAGINA) break
  }
  return { buscas: buscas.data ?? [], precos, dia, minimos: minimos.data ?? [], rodada: rodada.data }
}

/** Roda o robô agora; com supplyId, só aquele insumo (depois de mudar a busca). */
export async function buscarAgora(supplyId = null) {
  const { data, error } = await supabase.functions.invoke('cotar-mercados', { body: supplyId ? { supply_id: supplyId } : {} })
  if (error) throw error
  if (data?.erro) throw new Error(data.erro)
  return data
}

export async function salvarBusca(supplyId, campos) {
  const { error } = await supabase.from('mercado_buscas')
    .upsert({ supply_id: supplyId, ...campos, atualizado_em: new Date().toISOString() })
  if (error) throw error
}

/** "Não é isso": o produto sai deste insumo, em todas as lojas da rede, e some das buscas seguintes. */
export async function ignorarProduto(preco, lojas = [preco.mercado]) {
  const { error } = await supabase.from('mercado_ignorados').upsert(lojas.map(mercado => ({
    supply_id: preco.supply_id, mercado, produto_id: preco.produto_id, produto: preco.produto,
  })))
  if (error) throw error
  await supabase.from('mercado_precos').delete()
    .eq('supply_id', preco.supply_id).in('mercado', lojas).eq('produto_id', preco.produto_id)
}
