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

import { formatCurrency, formatDate, janelaDeEntrega, PAYMENT_LABELS } from './format'
import { supabase } from '../services/supabase'

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
  salvarCopiaDoZap(nova)
  return nova
}

/**
 * Copia no banco so do aparelho que de fato envia: um celular abrindo a tela do Zap com a
 * configuracao vazia nao pode apagar a do PC da loja. Roda ao mudar a configuracao e ao abrir
 * o painel.
 */
export function salvarCopiaDoZap(c = lerConfigZap()) {
  if (!(c.ligado && c.apikey && c.grupo)) return
  const { ligado: _l, desde: _d, ...copia } = c
  supabase.from('zap_config').update({ config: copia, updated_at: new Date().toISOString() }).eq('id', 1)
    .then(({ error }) => { if (error) console.warn('cópia da configuração do Zap:', error.message) })
}

/**
 * Configuracao salva no banco (tabela zap_config), para quando o Chrome do PC da loja foi limpo
 * e a chave da Evolution e o grupo sumiram. Volta sempre desligada: quem religa e uma pessoa,
 * e religar marca o "desde", entao pedido antigo nao vai de novo para o grupo.
 */
export async function copiaSalvaDoZap() {
  const { data } = await supabase.from('zap_config').select('config').eq('id', 1).maybeSingle()
  return data?.config?.apikey ? data.config : null
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

async function evolution(caminho, { method = 'GET', body, config = lerConfigZap(), limiteMs = 60000 } = {}) {
  const url = `${config.url.replace(/\/+$/, '')}${caminho}`
  let resp
  try {
    resp = await fetch(url, {
      method,
      headers: { apikey: config.apikey, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      // sem limite, uma chamada pendurada travava o laço do painel (pedido parava de ir ao grupo)
      signal: AbortSignal.timeout(limiteMs),
    })
  } catch {
    throw new Error('Não achei a Evolution neste computador. Ela está ligada? O Chrome pode ter bloqueado o acesso à rede local.')
  }
  const dados = await resp.json().catch(() => null)
  if (!resp.ok) {
    const msgs = [dados?.response?.message ?? dados?.message ?? dados?.error].flat().filter(Boolean)
    const texto = msgs.map(m => (typeof m === 'string' ? m : JSON.stringify(m))).join(', ')
    const erro = new Error(`Evolution respondeu ${resp.status}${texto ? `: ${texto}` : ''}`)
    erro.status = resp.status
    // Numero sem WhatsApp: a Evolution responde 400 com [{ exists: false, number }]
    erro.semWhatsApp = msgs.some(m => m && typeof m === 'object' && m.exists === false)
    throw erro
  }
  return dados
}

/*
 * Ritmo de gente, nao de robo: duas mensagens nunca saem coladas. Entre um envio e o
 * seguinte ha de 5 a 15 s, sorteados, e cada mensagem mostra "digitando..." por 1,5 a 3,5 s
 * antes de sair. Rajada de mensagens no mesmo segundo e um dos sinais que o WhatsApp usa
 * para banir numero ligado por conexao nao oficial. A primeira de uma leva sai sem espera.
 */
let ultimoEnvio = 0
const sorteio = (min, max) => min + Math.random() * (max - min)

async function enviarTexto(numero, texto, config) {
  const espera = ultimoEnvio + sorteio(5000, 15000) - Date.now()
  if (espera > 0) await new Promise(r => setTimeout(r, espera))
  try {
    await evolution(`/message/sendText/${config.instancia}`, {
      method: 'POST', config,
      // linkPreview false: sem o cartao grande do site em cima da mensagem, o link fica so como texto
      body: { number: numero, text: texto, linkPreview: false, delay: Math.round(sorteio(1500, 3500)) },
    })
  } finally {
    ultimoEnvio = Date.now()
  }
}

/*
 * Numero que o WhatsApp disse nao existir nao recebe mais tentativa nenhuma, em fluxo nenhum
 * (status do pedido, avaliacao, carrinho). Insistir em numero inexistente tambem pesa contra
 * a conta. Fica no aparelho que manda, como o resto da configuracao do Zap.
 */
const CHAVE_SEM_WHATSAPP = 'coxelli_zap_sem_whatsapp'

export function numerosSemWhatsApp() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_SEM_WHATSAPP) || '[]')
  } catch {
    return []
  }
}

function guardarSemWhatsApp(lista) {
  try {
    localStorage.setItem(CHAVE_SEM_WHATSAPP, JSON.stringify(lista.slice(-500)))
  } catch { /* sem armazenamento */ }
}

async function marcarSemWhatsApp(numero) {
  const lista = numerosSemWhatsApp()
  if (lista.includes(numero)) return
  guardarSemWhatsApp([...lista, numero])
  // copia no banco: sobrevive a limpeza do Chrome
  const { data } = await supabase.from('zap_config').select('sem_whatsapp').eq('id', 1).maybeSingle()
  const noBanco = data?.sem_whatsapp ?? []
  if (!noBanco.includes(numero)) {
    await supabase.from('zap_config').update({ sem_whatsapp: [...noBanco, numero].slice(-500) }).eq('id', 1)
  }
}

/** Junta a lista do banco com a do aparelho. Roda quando o painel abre. */
export async function sincronizarSemWhatsApp() {
  const { data, error } = await supabase.from('zap_config').select('sem_whatsapp').eq('id', 1).maybeSingle()
  if (error || !data) return
  const local = numerosSemWhatsApp()
  const juntos = [...new Set([...local, ...(data.sem_whatsapp ?? [])])]
  if (juntos.length !== local.length) guardarSemWhatsApp(juntos)
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
  await enviarTexto(config.grupo, texto, config)
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
  if (p.scheduled_for) {
    const j = entrega ? janelaDeEntrega(p.scheduled_for) : null
    linhas.push(`⏰ *AGENDADO: ${formatDate(p.scheduled_for)}*${j ? ` (cliente espera entre ${j.de} e ${j.ate})` : ''}`)
  }
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
        ? entrega
          ? `Entrega marcada para ${new Date(p.scheduled_for).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, chegando entre ${janelaDeEntrega(p.scheduled_for).de} e ${janelaDeEntrega(p.scheduled_for).ate}.`
          : `Retirada marcada para ${formatDate(p.scheduled_for)}.`
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
      // o link do Google vai sempre aqui; o pós-venda do CRM pula quem já recebeu esta mensagem
      return [
        `Obrigado por pedir na Coxelli${nome ? `, ${nome}` : ''}! 🧡 Esperamos que tenha gostado.`,
        avaliacaoUrl ? `Se puder, deixe sua avaliação no Google — leva 10 segundos e ajuda muito: ${avaliacaoUrl}` : '',
      ].filter(Boolean).join('\n')
    default:
      return null
  }
}

export async function mandarParaCliente(numero, texto, config = lerConfigZap()) {
  if (numerosSemWhatsApp().includes(numero)) {
    // Mesmo formato do erro da Evolution: quem chama ja marca o envio como 'erro' e segue.
    const erro = new Error('Número sem WhatsApp (já deu erro antes); não tento de novo')
    erro.status = 400
    erro.semWhatsApp = true
    throw erro
  }
  try {
    await enviarTexto(numero, texto, config)
  } catch (e) {
    if (e.semWhatsApp) await marcarSemWhatsApp(numero).catch(() => {})
    throw e
  }
}

/**
 * Número de telefone de um JID do WhatsApp. Conversa nova pode vir com o identificador escondido
 * (…@lid); aí o número está no campo "Alt"/"Pn" que a Evolution manda junto. Grupo, status e
 * canal não são contato.
 */
function numeroDoJid(...jids) {
  for (const jid of jids) {
    if (typeof jid !== 'string') continue
    if (/@s\.whatsapp\.net$/.test(jid) || /@c\.us$/.test(jid)) {
      const n = jid.split('@')[0].split(':')[0].replace(/\D/g, '')
      if (n.length >= 10) return n
    }
  }
  return null
}

const diaLocal = (ms) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Número do vCard: o waid quando vem, senão os dígitos do primeiro TEL. */
function numeroDoVcard(vcard) {
  const waid = /waid=(\d{10,15})/.exec(vcard || '')
  if (waid) return waid[1]
  const tel = /^TEL[^:\n]*:([^\n]+)$/m.exec(vcard || '')
  let n = (tel?.[1] || '').replace(/\D/g, '')
  if (n.length === 10 || n.length === 11) n = `55${n}`
  return n.length >= 12 ? n : null
}

/**
 * Resumo das conversas do Zap da loja: por número, o nome (salvo ou do perfil) e quantas
 * mensagens houve em cada dia. É o que o hub usa para achar o telefone de pedido lançado só com o
 * nome. Nenhum texto de mensagem entra no resumo; dos cartões de contato (a equipe manda o contato
 * de quem pediu), só o nome e o número do cartão, quem mandou e quando.
 */
export async function resumoDasConversas(config = lerConfigZap()) {
  const porNumero = new Map()
  const cartoes = []
  const pegar = (numero) => {
    if (!porNumero.has(numero)) porNumero.set(numero, { numero, nome: null, nome_perfil: null, dias: {}, primeira: null, ultima: null, msgs: 0, etiquetas: new Set() })
    return porNumero.get(numero)
  }

  const contatos = await evolution(`/chat/findContacts/${config.instancia}`, { method: 'POST', config, body: { where: {} } })
  for (const c of Array.isArray(contatos) ? contatos : []) {
    const numero = numeroDoJid(c.remoteJid, c.remoteJidAlt, c.jid, c.id)
    if (!numero) continue
    const r = pegar(numero)
    r.nome = c.name || c.verifiedName || r.nome
    r.nome_perfil = c.pushName || r.nome_perfil
  }

  // Etiquetas do WhatsApp Business ("Pedido finalizado"): nome de cada uma e as conversas marcadas
  const nomesDasEtiquetas = new Map()
  try {
    const etiquetas = await evolution(`/label/findLabels/${config.instancia}`, { config })
    for (const e of Array.isArray(etiquetas) ? etiquetas : []) nomesDasEtiquetas.set(String(e.labelId ?? e.id), e.name)
  } catch { /* sem etiquetas: segue sem elas */ }
  try {
    const conversas = await evolution(`/chat/findChats/${config.instancia}`, { method: 'POST', config, body: {} })
    for (const c of Array.isArray(conversas) ? conversas : []) {
      const numero = numeroDoJid(c.remoteJid, c.remoteJidAlt, c.lastMessage?.key?.remoteJidAlt, c.lastMessage?.key?.senderPn)
      const ids = Array.isArray(c.labels) ? c.labels : []
      if (!numero || !ids.length) continue
      for (const id of ids) pegar(numero).etiquetas.add(nomesDasEtiquetas.get(String(id)) ?? String(id))
    }
  } catch { /* sem conversas: segue com contatos e mensagens */ }

  for (let pagina = 1, total = 1; pagina <= total && pagina <= 200; pagina++) {
    const resp = await evolution(`/chat/findMessages/${config.instancia}`, {
      method: 'POST', config, body: { where: {}, page: pagina, offset: 500 },
    })
    const bloco = resp?.messages ?? resp
    total = Number(bloco?.pages) || 1
    for (const m of bloco?.records ?? []) {
      const k = m.key ?? {}
      const numero = numeroDoJid(k.remoteJid, k.remoteJidAlt, k.senderPn, m.remoteJidAlt, k.participantAlt)
      if (!numero) continue
      const ms = Number(m.messageTimestamp) * (String(m.messageTimestamp).length > 11 ? 1 : 1000)
      if (!Number.isFinite(ms) || ms <= 0) continue
      const r = pegar(numero)
      const dia = diaLocal(ms)
      r.dias[dia] = (r.dias[dia] ?? 0) + 1
      r.msgs += 1
      if (!r.primeira || ms < r.primeira) r.primeira = ms
      if (!r.ultima || ms > r.ultima) r.ultima = ms
      if (!k.fromMe && m.pushName) r.nome_perfil = m.pushName

      const msg = m.message ?? {}
      const lista = msg.contactMessage ? [msg.contactMessage] : (msg.contactsArrayMessage?.contacts ?? [])
      lista.forEach((c, i) => {
        const doCartao = numeroDoVcard(c.vcard)
        if (!doCartao) return
        cartoes.push({
          id: `${k.id || m.id}:${i}`,
          numero: doCartao,
          nome: c.displayName || /^FN:(.+)$/m.exec(c.vcard || '')?.[1]?.trim() || null,
          enviado_por: k.fromMe ? null : numero,
          enviado_por_nome: k.fromMe ? null : (m.pushName || null),
          enviado_em: new Date(ms).toISOString(),
          atualizado_em: new Date().toISOString(),
        })
      })
    }
  }

  const resumo = [...porNumero.values()].map(r => ({
    numero: r.numero,
    nome: r.nome,
    nome_perfil: r.nome_perfil,
    dias: r.dias,
    msgs: r.msgs,
    etiquetas: [...r.etiquetas],
    primeira_msg: r.primeira ? new Date(r.primeira).toISOString() : null,
    ultima_msg: r.ultima ? new Date(r.ultima).toISOString() : null,
    atualizado_em: new Date().toISOString(),
  }))
  return { contatos: resumo, cartoes }
}
