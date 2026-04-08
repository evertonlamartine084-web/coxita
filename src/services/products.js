import { supabase } from './supabase'

export async function getProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*, categories(name, slug)')
    .eq('active', true)
    .order('sort_order')
  if (error) throw error
  return data
}

export async function getProductsByCategory(categorySlug) {
  const { data, error } = await supabase
    .from('products')
    .select('*, categories(name, slug)')
    .eq('active', true)
    .eq('categories.slug', categorySlug)
    .order('sort_order')
  if (error) throw error
  return data
}

export async function getFeaturedProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*, categories(name, slug)')
    .eq('active', true)
    .eq('featured', true)
    .order('sort_order')
  if (error) throw error
  return data
}

// Admin
export async function getAllProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*, categories(name, slug)')
    .order('sort_order')
  if (error) throw error
  return data
}

export async function createProduct(product) {
  const { data, error } = await supabase
    .from('products')
    .insert(product)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateProduct(id, updates) {
  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteProduct(id) {
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function uploadProductImage(file) {
  const ext = file.name.split('.').pop()
  const name = `${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from('products')
    .upload(name, file)
  if (error) throw error
  const { data } = supabase.storage
    .from('products')
    .getPublicUrl(name)
  return data.publicUrl
}
