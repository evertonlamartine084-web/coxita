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

function compressImage(file, maxWidth = 600, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let width = img.width
      let height = img.height

      if (width > maxWidth) {
        height = (height * maxWidth) / width
        width = maxWidth
      }

      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => resolve(blob),
        'image/webp',
        quality
      )
    }
    img.src = URL.createObjectURL(file)
  })
}

export async function uploadProductImage(file) {
  const compressed = await compressImage(file)
  const name = `${Date.now()}.webp`
  const { error } = await supabase.storage
    .from('products')
    .upload(name, compressed, { contentType: 'image/webp' })
  if (error) throw error
  const { data } = supabase.storage
    .from('products')
    .getPublicUrl(name)
  return data.publicUrl
}
