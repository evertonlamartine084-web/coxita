import { supabase } from './supabase'
import { cached, invalidar, peek } from './cache'

export const CHAVE_SABORES = 'flavors:ativos'

/** Sabores ja em cache, ou undefined. Nao dispara requisicao. */
export function peekFlavors() {
  return peek(CHAVE_SABORES)
}

export async function getFlavors() {
  return cached(CHAVE_SABORES, async () => {
    const { data, error } = await supabase
      .from('flavors')
      .select('*')
      .eq('active', true)
      .order('sort_order')
    if (error) throw error
    return data
  })
}

// Admin
export async function getAllFlavors() {
  return cached('flavors:todos', async () => {
    const { data, error } = await supabase
      .from('flavors')
      .select('*')
      .order('sort_order')
    if (error) throw error
    return data
  })
}

export async function createFlavor(flavor) {
  const { data, error } = await supabase
    .from('flavors')
    .insert(flavor)
    .select()
    .single()
  if (error) throw error
  invalidar('flavors')
  return data
}

export async function updateFlavor(id, updates) {
  const { data, error } = await supabase
    .from('flavors')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  invalidar('flavors')
  return data
}

export async function deleteFlavor(id) {
  const { error } = await supabase
    .from('flavors')
    .delete()
    .eq('id', id)
  if (error) throw error
  invalidar('flavors')
}
