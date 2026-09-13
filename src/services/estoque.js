import { supabase } from './supabase'

/**
 * Estoque de salgado pronto, por sabor.
 *
 * O saldo é acumulado de movimentos: toda entrada e toda baixa passam por
 * `registrar_movimento_estoque` no banco, que grava o motivo junto. Escrever o
 * saldo direto deixaria o histórico mentindo -- e estoque sempre diverge uma
 * hora, então o histórico é o que permite descobrir onde.
 *
 * A baixa do pedido é automática: um gatilho no banco desconta quando o pedido
 * é gravado, e devolve quando é cancelado.
 */

export async function getEstoque() {
  const { data, error } = await supabase
    .from('flavor_stock')
    .select('quantidade, minimo, updated_at, flavors!inner(id, name, group_slug, active, image_url)')
    .eq('flavors.active', true)
  if (error) throw error
  return (data ?? [])
    .map(l => ({
      flavor_id: l.flavors.id,
      nome: l.flavors.name,
      grupo: l.flavors.group_slug,
      foto: l.flavors.image_url,
      quantidade: l.quantidade,
      minimo: l.minimo,
      updated_at: l.updated_at,
    }))
    .sort((a, b) => a.grupo.localeCompare(b.grupo) || a.nome.localeCompare(b.nome))
}

/** Entrada de produção, perda ou acerto de contagem. */
export async function registrarMovimento({ flavor_id, delta, motivo, observacao }) {
  const { data, error } = await supabase.rpc('registrar_movimento_estoque', {
    p_flavor_id: flavor_id,
    p_delta: delta,
    p_motivo: motivo,
    p_order_id: null,
    p_observacao: observacao || null,
  })
  if (error) throw error
  return data
}

/** Define o mínimo que dispara o aviso de "acabando". */
export async function definirMinimo(flavor_id, minimo) {
  const { error } = await supabase
    .from('flavor_stock')
    .upsert({ flavor_id, minimo, updated_at: new Date().toISOString() })
  if (error) throw error
}

export async function getMovimentos(flavor_id, limite = 20) {
  const { data, error } = await supabase
    .from('stock_moves')
    .select('id, delta, motivo, observacao, created_at, orders(order_number)')
    .eq('flavor_id', flavor_id)
    .order('created_at', { ascending: false })
    .limit(limite)
  if (error) throw error
  return data
}
