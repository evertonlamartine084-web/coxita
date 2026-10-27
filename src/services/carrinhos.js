import { supabase } from './supabase'

/**
 * Carrinho abandonado (CRM do hub). O checkout guarda o carrinho de quem já digitou o telefone;
 * se o pedido não fechar, o painel da loja manda uma mensagem no WhatsApp depois de 1 h, com o
 * link /carrinho?recuperar=<id> que devolve os itens. Ver supabase/sql/crm.sql.
 */

const CHAVE = 'coxelli_carrinho_id'

export function idDoCarrinho() {
  try {
    let id = localStorage.getItem(CHAVE)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(CHAVE, id)
    }
    return id
  } catch {
    return null
  }
}

/** Pedido fechado: o próximo carrinho deste aparelho é outro. */
export function esquecerCarrinho() {
  try { localStorage.removeItem(CHAVE) } catch { /* sem armazenamento */ }
}

/** Cópia enxuta das linhas do carrinho: o que precisa para remontá-lo, sem a descrição. */
const enxugar = (items) => items.map(linha => {
  const copia = { ...linha }
  delete copia.description
  return copia
})

export async function salvarCarrinho({ nome, telefone, items, subtotal, pedidoId = null }) {
  const id = idDoCarrinho()
  if (!id || !items?.length) return
  if ((telefone || '').replace(/\D/g, '').length < 10) return
  const { error } = await supabase.rpc('salvar_carrinho', {
    p_id: id, p_nome: nome || '', p_telefone: telefone, p_itens: enxugar(items), p_subtotal: subtotal, p_pedido: pedidoId,
  })
  if (error) console.warn('Não foi possível guardar o carrinho:', error.message)
}

export async function itensParaRecuperar(id) {
  const { data, error } = await supabase.rpc('carrinho_para_recuperar', { p_id: id })
  if (error) throw error
  return Array.isArray(data) ? data : []
}
