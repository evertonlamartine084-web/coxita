import { supabase } from './supabase'

/**
 * Entrega por Uber Direct (03/11/2026). Quem fala com a Uber é a função `uber-entrega`.
 *
 * - cotarUber: preço real da Uber até o endereço (o site usa; não precisa de login). A conta só
 *   entrega a até 5 km em linha reta da loja; fora disso volta { dentro_area: false }.
 * - chamarUber / atualizarUber / cancelarUber: painel. CHAMAR GERA COBRANÇA no cartão da conta.
 */

async function coordenadaDoCep(cep) {
  try {
    const r = await fetch(`https://cep.awesomeapi.com.br/json/${cep}`)
    if (!r.ok) return {}
    const d = await r.json()
    return { lat: Number(d.lat) || null, lng: Number(d.lng) || null }
  } catch {
    return {}
  }
}

async function chamar(corpo) {
  const { data, error } = await supabase.functions.invoke('uber-entrega', { body: corpo })
  if (error) {
    const resposta = await error.context?.json?.().catch(() => null)
    throw new Error(resposta?.erro || 'falha')
  }
  return data
}

/** { id, taxa, dentro_area, prazo_min, coleta_min } ou { dentro_area: false, motivo: 'fora-do-raio' }. */
export async function cotarUber({ cep, numero, rua, bairro }) {
  const limpo = String(cep).replace(/\D/g, '')
  const { lat, lng } = await coordenadaDoCep(limpo)
  return chamar({ acao: 'cotar', cep: limpo, numero, rua, bairro, lat, lng })
}

export const chamarUber = (orderId) => chamar({ acao: 'chamar', order_id: orderId })
export const atualizarUber = (orderId) => chamar({ acao: 'atualizar', order_id: orderId })
export const cancelarUber = (orderId) => chamar({ acao: 'cancelar', order_id: orderId })

/** Situação da corrida em português (status da API do Uber Direct). */
export const STATUS_UBER = {
  pending: 'Procurando motorista',
  pickup: 'Motorista a caminho da loja',
  pickup_complete: 'Motorista pegou o pedido',
  dropoff: 'A caminho do cliente',
  delivered: 'Entregue',
  canceled: 'Cancelada',
  returned: 'Devolvida à loja',
}

export const corridaAtiva = (status) => !!status && !['canceled', 'returned', 'delivered'].includes(status)
