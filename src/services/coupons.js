import { supabase } from './supabase'

export async function validateCoupon(code) {
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('code', code.toUpperCase().trim())
    .eq('active', true)
    .maybeSingle()

  if (error) throw error
  if (!data) return { valid: false, error: 'Cupom invalido' }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return { valid: false, error: 'Cupom expirado' }
  }

  if (data.max_uses && data.used_count >= data.max_uses) {
    return { valid: false, error: 'Cupom esgotado' }
  }

  return { valid: true, coupon: data }
}

export async function useCoupon(id) {
  const { error } = await supabase.rpc('increment_coupon_usage', { coupon_id: id })
  if (error) {
    // Fallback: update directly
    const { data } = await supabase.from('coupons').select('used_count').eq('id', id).single()
    await supabase.from('coupons').update({ used_count: (data?.used_count || 0) + 1 }).eq('id', id)
  }
}

// Admin
export async function getCoupons() {
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createCoupon(coupon) {
  const { data, error } = await supabase
    .from('coupons')
    .insert({ ...coupon, code: coupon.code.toUpperCase().trim() })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateCoupon(id, updates) {
  const { data, error } = await supabase
    .from('coupons')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteCoupon(id) {
  const { error } = await supabase
    .from('coupons')
    .delete()
    .eq('id', id)
  if (error) throw error
}
