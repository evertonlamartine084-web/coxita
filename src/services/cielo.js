import { supabase } from './supabase'

/**
 * Cobrança pela Cielo. Tudo passa por Edge Function: a MerchantKey é segredo e o bundle do
 * Vite é público. O valor também não é enviado daqui — a função lê o total do próprio pedido.
 */

/** Cobra no cartão. Os dados do cartão só transitam; nada é guardado no navegador. */
export async function pagarComCartao(orderId, cartao, parcelas = 1) {
  const { data, error } = await supabase.functions.invoke('cielo-pagar', {
    body: { order_id: orderId, metodo: 'cartao', parcelas, cartao },
  })
  if (error) throw error
  if (data?.erro) throw new Error(data.erro)
  return data
}

/** Gera o QR do Pix. Devolve imagem base64 e o texto de copia-e-cola. */
export async function gerarPix(orderId) {
  const { data, error } = await supabase.functions.invoke('cielo-pagar', {
    body: { order_id: orderId, metodo: 'pix' },
  })
  if (error) throw error
  if (data?.erro) throw new Error(data.erro)
  return data
}

/**
 * Pergunta o status atual à Cielo (e atualiza o pedido).
 *
 * A tela do Pix chama isto em intervalos. Não lemos `orders` direto porque, sem o webhook
 * cadastrado no portal da Cielo, a linha do banco nunca mudaria e o cliente ficaria olhando
 * um QR já pago.
 */
export async function consultarPagamento(orderId) {
  const { data, error } = await supabase.functions.invoke('cielo-consultar', {
    body: { order_id: orderId },
  })
  if (error) throw error
  return data?.payment_status ?? 'aguardando'
}
