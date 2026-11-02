import { supabase } from './supabase'

/**
 * Onde comprar: o que o robô cotar-mercados achou nos mercados (supabase/sql/onde-comprar.sql).
 * Tudo painel; o preço vem por kg/L/un, na unidade do insumo.
 */

const DIA = 864e5
const hojeEmNatal = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)

export async function carregarOndeComprar(dias = 30) {
  const desde = new Date(Date.now() - 3 * 3600e3 - dias * DIA).toISOString().slice(0, 10)
  const [buscas, precos, rodada] = await Promise.all([
    supabase.from('mercado_buscas').select('*'),
    supabase.from('mercado_precos').select('*').gte('visto_em', desde).order('preco_unidade'),
    supabase.from('mercado_rodadas').select('*').order('id', { ascending: false }).limit(1).maybeSingle(),
  ])
  for (const r of [buscas, precos, rodada]) if (r.error) throw r.error
  return { buscas: buscas.data ?? [], precos: precos.data ?? [], rodada: rodada.data, hoje: hojeEmNatal() }
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

/** "Não é isso": o produto sai deste insumo e some das buscas seguintes. */
export async function ignorarProduto(preco) {
  const { error } = await supabase.from('mercado_ignorados').upsert({
    supply_id: preco.supply_id, mercado: preco.mercado, produto_id: preco.produto_id, produto: preco.produto,
  })
  if (error) throw error
  await supabase.from('mercado_precos').delete()
    .eq('supply_id', preco.supply_id).eq('mercado', preco.mercado).eq('produto_id', preco.produto_id)
}
