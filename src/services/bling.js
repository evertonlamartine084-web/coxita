import { supabase } from './supabase'

/** Chama bling-oauth, que guarda o token no servidor — o Client Secret não passa pelo navegador. */
async function oauth(acao, extra = {}) {
  const { data, error } = await supabase.functions.invoke('bling-oauth', {
    body: { acao, ...extra },
  })
  if (error) {
    const texto = await error.context?.text?.().catch(() => '')
    let corpo = null
    try { corpo = texto ? JSON.parse(texto) : null } catch { /* resposta não-JSON: usa o texto */ }
    throw new Error(corpo?.erro || texto || error.message)
  }
  if (data?.erro) throw new Error(data.erro)
  return data
}

/** Troca o código de autorização por um acesso. O código vale poucos minutos. */
export const conectarBling = (code) => oauth('conectar', { code })

/** Renova o acesso antes de ele vencer. */
export const renovarBling = () => oauth('renovar')

/** Conectado? Até quando vale? */
export const statusBling = () => oauth('status')
