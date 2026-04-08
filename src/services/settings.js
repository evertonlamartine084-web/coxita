import { supabase } from './supabase'

export async function getSettings() {
  const { data, error } = await supabase
    .from('settings')
    .select('*')
  if (error) throw error
  return Object.fromEntries(data.map(s => [s.key, s.value]))
}

export async function updateSetting(key, value) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key, value, updated_at: new Date().toISOString() })
  if (error) throw error
}

export async function updateSettings(settingsObj) {
  const entries = Object.entries(settingsObj).map(([key, value]) => ({
    key,
    value: String(value),
    updated_at: new Date().toISOString(),
  }))
  const { error } = await supabase
    .from('settings')
    .upsert(entries)
  if (error) throw error
}
