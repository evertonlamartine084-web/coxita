import { formatCurrency } from './format'

/**
 * Textos dos fluxos do CRM (hub → CRM). O mesmo código monta a prévia no hub e a mensagem que o
 * painel da loja manda, para o que se vê na tela ser o que o cliente recebe.
 *
 * Variáveis da mensagem: {nome} (primeiro nome), {itens}, {valor}, {link}, {cupom}.
 */

export const VARIAVEIS_CARRINHO = [
  { chave: '{nome}', explica: 'primeiro nome' },
  { chave: '{itens}', explica: 'o que estava no carrinho' },
  { chave: '{valor}', explica: 'valor do carrinho' },
  { chave: '{link}', explica: 'link que devolve o carrinho' },
  { chave: '{cupom}', explica: 'código do cupom (se tiver)' },
]

export const linkDoCarrinho = (id) => `https://coxelli.com.br/carrinho?recuperar=${id}`

function linhaDoItem(i) {
  const sabores = (i.flavors ?? []).map(f => `${f.quantity} ${f.name}`).join(', ')
  return `• ${i.quantity}x ${i.name}${sabores ? ` (${sabores})` : ''}`
}

export function mensagemDeCarrinho(carrinho, config) {
  const primeiro = (carrinho.nome || '').trim().split(/\s+/)[0] || 'tudo bem'
  const nome = primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase()
  return (config.mensagem || '')
    .replaceAll('{nome}', nome)
    .replaceAll('{itens}', (carrinho.itens ?? []).map(linhaDoItem).join('\n'))
    .replaceAll('{valor}', formatCurrency(carrinho.subtotal || 0))
    .replaceAll('{link}', linkDoCarrinho(carrinho.id))
    .replaceAll('{cupom}', config.cupom || '')
    .trim()
}

/** Está no horário de mandar? Fora dele a mensagem espera (até 24 h depois, senão é ignorada). */
export function noHorarioDoFluxo(config, agora = new Date()) {
  const h = agora.getHours()
  return h >= Number(config.hora_inicio ?? 9) && h < Number(config.hora_fim ?? 21)
}

export const STATUS_CARRINHO = {
  aberto: { rotulo: 'Esperando', cor: 'bg-amber-100 text-amber-800' },
  avisado: { rotulo: 'Mensagem enviada', cor: 'bg-sky-100 text-sky-800' },
  recuperado: { rotulo: 'Recuperado', cor: 'bg-green-100 text-green-800' },
  convertido: { rotulo: 'Comprou sozinho', cor: 'bg-stone-100 text-stone-700' },
  ignorado: { rotulo: 'Não enviado', cor: 'bg-stone-100 text-stone-500' },
  erro: { rotulo: 'Falhou', cor: 'bg-red-100 text-red-700' },
}

/**
 * Pós-venda: o link de cada etapa. A avaliação vai direto para o Google, para todo mundo (o Google
 * não permite pedir avaliação só para quem gostou); sem o link do Google, cai na página do pedido.
 * A recompra vai ao cardápio.
 */
export function mensagemDePosVenda(item, etapaConfig, linkGoogle = '') {
  const primeiro = (item.nome || '').trim().split(/\s+/)[0] || ''
  const nome = primeiro ? primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase() : 'tudo bem'
  const link = item.etapa !== 'avaliacao' ? 'https://coxelli.com.br/cardapio'
    : linkGoogle || `https://coxelli.com.br/acompanhar/${item.public_token}#avaliar`
  return (etapaConfig.mensagem || '')
    .replaceAll('{nome}', nome)
    .replaceAll('{link}', link)
    .replaceAll('{cupom}', etapaConfig.cupom || '')
    .trim()
}

/** Aviso no grupo da loja quando a nota é baixa: alguém liga para o cliente. */
export function alertaDeNotaBaixa(item) {
  return [
    `⚠️ *Nota ${item.rating} de 5* no pedido #${item.order_number} — ${item.nome}`,
    item.comentario ? `“${item.comentario}”` : 'Sem comentário.',
    `Telefone: ${item.telefone}`,
    'Vale ligar para entender o que aconteceu e resolver.',
  ].join('\n')
}

export const VARIAVEIS_POS_VENDA = [
  { chave: '{nome}', explica: 'primeiro nome' },
  { chave: '{link}', explica: 'avaliação no Google (etapa 1) ou cardápio (etapa 3)' },
  { chave: '{cupom}', explica: 'código do cupom (se tiver)' },
]
