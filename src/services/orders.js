import { supabase } from './supabase'

/**
 * Cria o pedido com itens e sabores numa chamada só.
 *
 * Vai por função no banco em vez de três inserts seguidos: assim é atômico. Antes, se a
 * gravação dos itens falhasse depois do pedido criado, sobrava um pedido vazio no painel da
 * cozinha. E, com a leitura pública fechada, insert com retorno não funcionaria daqui.
 */
export async function createOrder(orderData, items) {
  const payloadItens = items.map(item => ({
    product_id: item.id,
    product_name: item.name,
    quantity: item.quantity,
    unit_price: item.price,
    total_price: item.price * item.quantity,
    flavors: (item.flavors ?? []).map(sabor => ({
      flavor_id: sabor.id,
      flavor_name: sabor.name,
      quantity: sabor.quantity,
    })),
  }))

  const { data, error } = await supabase.rpc('criar_pedido', {
    p_pedido: orderData,
    p_itens: payloadItens,
  })
  if (error) throw error
  return data
}

/** Achata a resposta das funções para o formato que as telas já esperam. */
function montarPedido(data) {
  if (!data?.pedido) throw new Error('nao-encontrado')
  return {
    ...data.pedido,
    order_items: (data.itens ?? []).map(linha => ({
      ...linha.item,
      order_item_flavors: linha.flavors ?? [],
    })),
  }
}

/**
 * Abre um pedido pelo código do link — o caminho normal, sem o cliente digitar nada.
 *
 * O código tem 64 bits de aleatoriedade e vive na URL que a pessoa já tem. É isso que substitui
 * o número sequencial: `#137` continua sendo como a cozinha chama o pedido, mas não abre nada.
 */
export async function consultarPedidoPorToken(token) {
  const { data, error } = await supabase.rpc('consultar_pedido_token', { p_token: token || '' })
  if (error) throw error
  return montarPedido(data)
}

/**
 * Vários pedidos deste aparelho, pelos códigos guardados localmente.
 *
 * Alimenta "Meus pedidos", a confirmação e o aviso de pedido em aberto. Sem os códigos não
 * devolve nada — que é o ponto: ninguém lista pedido que não fez.
 */
export async function getPedidosPorTokens(tokens) {
  const lista = (tokens ?? []).filter(Boolean)
  if (!lista.length) return []
  const { data, error } = await supabase.rpc('pedidos_por_tokens', { p_tokens: lista })
  if (error) throw error
  return (data ?? []).map(d => ({
    ...d.pedido,
    order_items: (d.itens ?? []).map(linha => ({
      ...linha.item,
      order_item_flavors: linha.flavors ?? [],
    })),
  }))
}

/**
 * Recuperação: número + telefone, para quem perdeu o link (trocou de celular, limpou o
 * navegador). É o caminho de exceção — o normal é o link.
 */
export async function consultarPedido(numero, telefone) {
  const { data, error } = await supabase.rpc('consultar_pedido', {
    p_numero: Number(numero),
    p_telefone: telefone || '',
  })
  if (error) throw error
  return montarPedido(data)
}

// Admin
export async function getOrders(status = null) {
  let query = supabase
    .from('orders')
    .select('*, order_items(*, order_item_flavors(*))')
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getOrderById(id) {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*, order_item_flavors(*))')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function updateOrderStatus(id, status) {
  const { data, error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getOrderByNumber(orderNumber) {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*, order_item_flavors(*))')
    .eq('order_number', orderNumber)
    .single()
  if (error) throw error
  return data
}

export async function getOrdersByPhone(phone) {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*, order_item_flavors(*))')
    .eq('customer_phone', phone)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getOrdersByNumbers(orderNumbers) {
  if (!orderNumbers || orderNumbers.length === 0) return []
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*, order_item_flavors(*))')
    .in('order_number', orderNumbers)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

/**
 * Chat do pedido, lado do CLIENTE — identificado pelo código do link.
 *
 * As três funções abaixo (`*PorToken`) são as que o site público usa. As versões que falam com
 * a tabela direto continuam existindo logo abaixo para o painel, que roda autenticado.
 */
export async function getOrderMessagesPorToken(token) {
  const { data, error } = await supabase.rpc('mensagens_pedido', { p_token: token || '' })
  if (error) throw error
  return data ?? []
}

/** O remetente é fixado como 'customer' dentro do banco: daqui não dá pra forjar fala da loja. */
export async function sendOrderMessagePorToken(token, message) {
  const { data, error } = await supabase.rpc('enviar_mensagem_pedido', {
    p_token: token || '',
    p_mensagem: message,
  })
  if (error) throw error
  return data
}

export async function markMessagesReadPorToken(token) {
  const { error } = await supabase.rpc('marcar_lidas_pedido', { p_token: token || '' })
  if (error) throw error
}

// Chat messages (painel — exige login)
export async function getOrderMessages(orderId) {
  const { data, error } = await supabase
    .from('order_messages')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function sendOrderMessage(orderId, senderType, message) {
  const { data, error } = await supabase
    .from('order_messages')
    .insert({ order_id: orderId, sender_type: senderType, message })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function markMessagesRead(orderId, senderType) {
  const { error } = await supabase
    .from('order_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('order_id', orderId)
    .eq('sender_type', senderType)
    .is('read_at', null)
  if (error) throw error
}

export async function getUnreadMessageCounts() {
  const { data, error } = await supabase
    .from('order_messages')
    .select('order_id')
    .eq('sender_type', 'customer')
    .is('read_at', null)
  if (error) throw error
  const counts = {}
  data.forEach(msg => {
    counts[msg.order_id] = (counts[msg.order_id] || 0) + 1
  })
  return counts
}

export async function getActiveOrderByNumbers(orderNumbers) {
  if (!orderNumbers || orderNumbers.length === 0) return null
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .in('order_number', orderNumbers)
    .in('status', ['pendente', 'em_preparo', 'saiu_entrega'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function getTodayOrders() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*, order_item_flavors(*))')
    .gte('created_at', today.toISOString())
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

/**
 * Lista de clientes para o backoffice, agregada a partir dos pedidos.
 *
 * Vai por RPC porque a função no banco é `security definer` e liberada só para quem está
 * logado — a lista de contatos dos clientes não é dado público.
 */
export async function getClientes() {
  const { data, error } = await supabase.rpc('clientes_resumo')
  if (error) throw error
  return data ?? []
}

/**
 * Troca os itens de um pedido e recalcula o total. Só a loja, e só até "em preparo".
 *
 * A validação de status mora no banco, não aqui: a tela some com o botão, mas quem garante é
 * a função, que recusa pedido já despachado venha a chamada de onde vier.
 */
export async function editarItensPedido(orderId, itens) {
  const { data, error } = await supabase.rpc('editar_itens_pedido', {
    p_order_id: orderId,
    p_itens: itens.map(i => ({
      product_id: i.product_id,
      product_name: i.product_name,
      quantity: i.quantity,
      unit_price: i.unit_price,
      flavors: (i.flavors ?? []).map(f => ({
        flavor_id: f.flavor_id ?? f.id,
        flavor_name: f.flavor_name ?? f.name,
        quantity: f.quantity,
      })),
    })),
  })
  if (error) throw error
  return data?.pedido
}

/** Emite (ou retoma a emissão d)a NFC-e do pedido pelo Bling — ver bling-emitir-nota. */
export async function emitirNota(orderId) {
  const { data, error } = await supabase.functions.invoke('bling-emitir-nota', {
    body: { order_id: orderId },
  })
  // erro de negócio volta com status 4xx: a mensagem útil está no corpo, não no FunctionsHttpError
  if (error) {
    const corpo = await error.context?.json?.().catch(() => null)
    throw new Error(corpo?.erro || error.message)
  }
  if (data?.erro) throw new Error(data.erro)
  return data
}

/** Devolve dinheiro ao cliente. Bloqueado para pedido que já saiu — ver cielo-estornar. */
export async function estornarPedido(orderId, valorCentavos = null) {
  const { data, error } = await supabase.functions.invoke('cielo-estornar', {
    body: { order_id: orderId, valor_centavos: valorCentavos },
  })
  if (error) throw error
  if (data?.erro) throw new Error(data.erro)
  return data
}
