import { supabase } from './supabase'
import { cached, invalidar, peek } from './cache'

export const CHAVE_CATEGORIAS = 'categories:ativas'

/** Categorias ativas ja em cache, ou undefined. Nao dispara requisicao. */
export function peekCategories() {
  return peek(CHAVE_CATEGORIAS)
}

export async function getCategories() {
  return cached(CHAVE_CATEGORIAS, async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('active', true)
      .order('sort_order')
    if (error) throw error
    return data
  })
}

export async function getAllCategories() {
  return cached('categories:todas', async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order')
    if (error) throw error
    return data
  })
}

export async function createCategory(category) {
  const { data, error } = await supabase
    .from('categories')
    .insert(category)
    .select()
    .single()
  if (error) throw error
  invalidar('categories')
  return data
}

export async function updateCategory(id, updates) {
  const { data, error } = await supabase
    .from('categories')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  invalidar('categories')
  // produtos carregam categories(name, slug) no join
  invalidar('products')
  return data
}

export async function deleteCategory(id) {
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id)
  if (error) throw error
  invalidar('categories')
  invalidar('products')
}
