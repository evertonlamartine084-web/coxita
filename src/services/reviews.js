import { supabase } from './supabase'

export async function createReview(reviewData) {
  const { data, error } = await supabase
    .from('reviews')
    .insert(reviewData)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getReviewByOrderId(orderId) {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('order_id', orderId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function getAllReviews() {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}
