import { supabase } from './supabase'
import { cached, invalidar, peek } from './cache'

export const CHAVE_SETTINGS = 'settings'

// TTL maior: nome da loja, taxa de entrega e horarios quase nunca mudam
// durante uma sessao, e quatro telas diferentes pedem isso.
const TTL_SETTINGS = 5 * 60_000

/** Settings ja em cache, ou undefined. Nao dispara requisicao. */
export function peekSettings() {
  return peek(CHAVE_SETTINGS, TTL_SETTINGS)
}

export async function getSettings() {
  return cached(CHAVE_SETTINGS, async () => {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
    if (error) throw error
    return Object.fromEntries(data.map(s => [s.key, s.value]))
  }, TTL_SETTINGS)
}

export async function updateSetting(key, value) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key, value, updated_at: new Date().toISOString() })
  if (error) throw error
  invalidar('settings')
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
  invalidar('settings')
}
