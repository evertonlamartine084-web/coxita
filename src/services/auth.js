import { supabase } from './supabase'

/**
 * Entra no painel.
 *
 * Distingue credencial errada de problema de conexão. A tela mostrava "E-mail ou senha
 * inválidos" para QUALQUER falha, então quando o banco esteve fora do ar a mensagem mandou
 * procurar a senha certa — que estava certa o tempo todo.
 */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (error) {
    const credencial = error.status === 400 || /invalid login/i.test(error.message || '')
    if (!credencial) {
      const e = new Error('Não foi possível falar com o servidor. Tente de novo em instantes.')
      e.causa = 'conexao'
      throw e
    }
    throw error
  }
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange(callback)
}
