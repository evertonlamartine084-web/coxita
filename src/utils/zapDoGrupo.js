/**
 * Pedido novo no grupo do WhatsApp da loja.
 *
 * Quem fala com o WhatsApp é a Evolution API, instalada no PC da loja (pasta loja-pc/evolution):
 * ela fica ligada ao número da Coxelli como um WhatsApp Web e escuta só em localhost. Quem manda
 * é o painel aberto nesse mesmo PC, na mesma volta de 15 s da comanda e com a mesma regra
 * (prontoParaComanda): pedido do site pago, ou da loja, e nunca cancelado. Por isso a
 * configuração vale por aparelho, como a chave da impressora: no celular não há Evolution.
 *
 * O Chrome pergunta uma vez se coxelli.com.br pode acessar a rede local (localhost). Sem
 * "Permitir", toda chamada falha com "Failed to fetch".
 */

import { formatCurrency, formatDate, PAYMENT_LABELS } from './format'

const CHAVE_CONFIG = 'coxelli_zap_config'
const CHAVE_ENVIADOS = 'coxelli_zap_enviados'
const LIMITE_ENVIADOS = 300

const PADRAO = {
  url: 'http://localhost:8080',
  apikey: '',
  instancia: 'coxelli',
  grupo: '', // id do grupo (…@g.us)
  grupoNome: '',
  ligado: false,
  desde: null, // pedidos anteriores a isto não vão: ligar não despeja o dia inteiro no grupo
  avisarClientes: true, // mensagens de status para o cliente (recebido, preparo, saiu, entregue)
}

export function lerConfigZap() {
  try {
    return { ...PADRAO, ...JSON.parse(localStorage.getItem(CHAVE_CONFIG) || '{}') }
  } catch {
    return { ...PADRAO }
  }
}

export function gravarConfigZap(mudancas) {
  const atual = lerConfigZap()
  const nova = { ...atual, ...mudancas }
  if (mudancas.ligado && !atual.ligado) nova.desde = new Date().toISOString()
  try {
    localStorage.setItem(CHAVE_CONFIG, JSON.stringify(nova))
  } catch {
    // storage bloqueado: o envio simplesmente não fica ligado neste aparelho
  }
  return nova
}

export const zapPronto = (c = lerConfigZap()) => c.ligado && !!c.apikey && !!c.grupo

function enviados() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_ENVIADOS) || '[]')
  } catch {
    return []
  }
}

export const zapJaEnviado = (id) => enviados().includes(id)

export function marcarZapEnviado(id) {
  const lista = enviados().filter(x => x !== id)
  lista.push(id)
  try {
    localStorage.setItem(CHAVE_ENVIADOS, JSON.stringify(lista.slice(-LIMITE_ENVIADOS)))
  } catch { /* sem armazenamento */ }
}

async function evolution(caminho, { method = 'GET', body, config = lerConfigZap() } = {}) {
  const url = `${config.url.replace(/\/+$/, '')}${caminho}`
  let resp
  try {
    resp = await fetch(url, {
      method,
      headers: { apikey: config.apikey, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('Não achei a Evolution neste computador. Ela está ligada? O Chrome pode ter bloqueado o acesso à rede local.')
  }
  const dados = await resp.json().catch(() => null)
  if (!resp.ok) {
    const msg = dados?.response?.message ?? dados?.message ?? dados?.error
    const erro = new Error(`Evolution respondeu ${resp.status}${msg ? `: ${[msg].flat().join(', ')}` : ''}`)
    erro.status = resp.status
    throw erro
  }
  return dados
}

/** 'open' = conectado; 'close' / 'connecting' = falta ler o QR; null = instância ainda não criada. */
export async function estadoDoZap(config) {
  try {
    const r = await evolution(`/instance/connectionState/${config.instancia}`, { config })
    return r?.instance?.state ?? r?.state ?? null
  } catch (e) {
    if (e.status === 404) return null
    throw e
  }
}

/** Cria a instância se faltar e devolve o QR Code (imagem em base64) para ler no celular. */
export async function qrCodeDoZap(config) {
  const estado = await estadoDoZap(config)
  if (estado === null) {
    const r = await evolution('/instance/create', {
      method: 'POST', config,
      body: { instanceName: config.instancia, integration: 'WHATSAPP-BAILEYS', qrcode: true },
    })
    if (r?.qrcode?.base64) return r.qrcode.base64
  }
  return qrCodeAtualDoZap(config)
}

/** O QR que vale agora: a Evolution troca a cada ~20 s, e pedir de novo não derruba a conexão. */
export async function qrCodeAtualDoZap(config) {
  const r = await evolution(`/instance/connect/${config.instancia}`, { config })
  return r?.base64 ?? null
}

export async function desconectarZap(config) {
  await evolution(`/instance/logout/${config.instancia}`, { method: 'DELETE', config })
}

export async function gruposDoZap(config) {
  const r = await evolution(`/group/fetchAllGroups/${config.instancia}?getParticipants=false`, { config })
  return (Array.isArray(r) ? r : [])
    .map(g => ({ id: g.id, nome: g.subject || g.id }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export async function mandarNoGrupo(texto, config = lerConfigZap()) {
  await evolution(`/message/sendText/${config.instancia}`, {
    method: 'POST', config, body: { number: config.grupo, text: texto },
  })
}

const ROTULO_PAGAMENTO = {
  ...PAYMENT_LABELS,
  pix_online: 'Pix pelo site',
  cartao: 'Cartão pelo site',
}

/** O pedido como mensagem de WhatsApp (*negrito*), com o que a comanda tem. */
export function textoDoPedido(p) {
  const entrega = p.delivery_type === 'entrega'
  const pago = p.payment_status === 'pago'
  const linhas = [`*PEDIDO #${p.order_number}* — ${entrega ? 'ENTREGA' : 'RETIRADA'}`]
  if (p.reposicao_de) linhas.push(`🔁 *REPOSIÇÃO, SEM COBRANÇA* — motivo: ${p.reposicao_motivo}`)
  if (p.scheduled_for) linhas.push(`⏰ *AGENDADO: ${formatDate(p.scheduled_for)}*`)
  linhas.push('', `👤 ${p.customer_name}`, `📞 ${p.customer_phone}`)
  if (entrega) {
    linhas.push(`📍 ${p.address}, ${p.address_number}${p.address_complement ? ` - ${p.address_complement}` : ''} — ${p.neighborhood}`)
    if (p.address_reference) linhas.push(`Ref: ${p.address_reference}`)
  }
  linhas.push('')
  for (const item of p.order_items ?? []) {
    linhas.push(`*${item.quantity}x ${item.product_name}* — ${formatCurrency(item.total_price)}`)
    // quantity do sabor é por pacote; o total vem multiplicado, como na comanda
    for (const s of item.order_item_flavors ?? []) linhas.push(`   ${s.quantity * item.quantity}x ${s.flavor_name}`)
  }
  if (p.notes) linhas.push('', `📝 OBS: ${p.notes}`)
  linhas.push('')
  if (Number(p.discount) > 0) linhas.push(`Desconto${p.coupon_code ? ` (${p.coupon_code})` : ''}: -${formatCurrency(p.discount)}`)
  if (entrega) linhas.push(`Entrega: ${formatCurrency(p.delivery_fee)}`)
  linhas.push(`*TOTAL: ${formatCurrency(p.total)}*`)
  // encomenda com sinal: só o que falta é cobrado na entrega
  const sinal = pago ? 0 : Number(p.sinal_valor || 0)
  const aCobrar = Math.max(0, Number(p.total) - sinal)
  if (sinal > 0) linhas.push(`Sinal pago: -${formatCurrency(sinal)}`, `*A COBRAR: ${formatCurrency(aCobrar)}*`)
  linhas.push(`💳 ${ROTULO_PAGAMENTO[p.payment_method] ?? p.payment_method} — ${pago ? '✅ JÁ PAGO' : entrega ? 'cobrar na entrega' : 'cobrar na retirada'}`)
  if (!pago && p.payment_method === 'dinheiro' && Number(p.change_for) > 0) {
    linhas.push(`Troco para ${formatCurrency(p.change_for)} (levar ${formatCurrency(Number(p.change_for) - aCobrar)})`)
  }
  return linhas.join('\n')
}

/*
 * Mensagens para o CLIENTE (10/10/2026), do mesmo número, pela mesma Evolution. Só o que ajuda
 * quem comprou — recebido, em preparo, saiu/pronto, entregue —, nada de propaganda: mensagem
 * para pessoa pesa mais que mensagem para grupo na conta do WhatsApp. O cliente vê o código
 * curto do pedido (codigo_cliente), nunca o número sequencial.
 */

/** Telefone do pedido no formato do WhatsApp (55 + DDD + número); null se não der para usar. */
export function numeroDoCliente(telefone) {
  const texto = String(telefone ?? '').trim()
  const digitos = texto.replace(/\D/g, '')
  if (texto.startsWith('+')) return digitos.length >= 8 ? digitos : null
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`
  if (digitos.startsWith('55') && (digitos.length === 12 || digitos.length === 13)) return digitos
  return null
}

/**
 * Qual aviso o pedido está devendo ao cliente agora, ou null. Só o do status atual: pedido que
 * pulou de pendente para entregue recebe só o "entregue", não a história inteira.
 */
export function avisoDevido(p) {
  const feitos = p.zap_cliente ?? {}
  const devido = (evento) => (feitos[evento] ? null : evento)
  if (p.status === 'entregue') return devido('entregue')
  if (p.status === 'saiu_entrega') return devido('saiu')
  if (p.status === 'em_preparo') return devido('em_preparo')
  if (p.status === 'pendente' && p.canal === 'site') return devido('recebido')
  return null
}

const primeiroNome = (nome) => String(nome ?? '').trim().split(/\s+/)[0] || ''

export function mensagemParaCliente(p, evento, { avaliacaoUrl = '' } = {}) {
  const nome = primeiroNome(p.customer_name)
  const codigo = p.codigo_cliente ? `*${p.codigo_cliente}*` : ''
  const entrega = p.delivery_type === 'entrega'
  const pago = p.payment_status === 'pago'
  const aCobrar = Math.max(0, Number(p.total) - Number(p.sinal_valor || 0))
  switch (evento) {
    case 'recebido': {
      const quando = p.scheduled_for
        ? `${entrega ? 'Entrega' : 'Retirada'} marcada para ${formatDate(p.scheduled_for)}.`
        : `${entrega ? 'A entrega sai' : 'Pode vir buscar'} assim que ficar pronto — a gente avisa por aqui.`
      return [
        `Oi${nome ? `, ${nome}` : ''}! 😊 Recebemos seu pedido na Coxelli (código ${codigo}).`,
        quando,
        `Total: ${formatCurrency(p.total)}${pago ? ' — já pago ✅' : ''}`,
        '',
        `Acompanhe por aqui: https://coxelli.com.br/acompanhar/${p.public_token}`,
      ].join('\n')
    }
    case 'em_preparo':
      return `Seu pedido ${codigo} já está sendo preparado 👩‍🍳`
    case 'saiu':
      return entrega
        ? [
            `Seu pedido ${codigo} saiu para entrega e chega em breve 🛵`,
            !pago && aCobrar > 0 ? `Valor a pagar na entrega: ${formatCurrency(aCobrar)}` : '',
          ].filter(Boolean).join('\n')
        : `Seu pedido ${codigo} está pronto! Já pode vir buscar 🎉`
    case 'entregue':
      return [
        `Obrigado por pedir na Coxelli${nome ? `, ${nome}` : ''}! 💛 Esperamos que tenha gostado.`,
        avaliacaoUrl ? `Se puder, deixe sua avaliação no Google — leva 10 segundos e ajuda muito: ${avaliacaoUrl}` : '',
      ].filter(Boolean).join('\n')
    default:
      return null
  }
}

export async function mandarParaCliente(numero, texto, config = lerConfigZap()) {
  await evolution(`/message/sendText/${config.instancia}`, {
    method: 'POST', config, body: { number: numero, text: texto },
  })
}
