/**
 * Impressão na térmica da loja (Epson, bobina de 80 mm, USB no Windows).
 *
 * Tudo passa pelo próprio Chrome: o documento vira uma página num iframe escondido, e o painel
 * chama print() nela. Aberto com --kiosk-printing, o Chrome manda direto para a impressora
 * padrão, sem janela; sem a flag, a janela de impressão aparece e alguém confirma. Nenhum
 * programa extra instalado na máquina da loja.
 *
 * Automático sai só o cupom fiscal (DANFE NFC-e), quando a nota do pedido é autorizada. A
 * comanda da cozinha continua existindo, mas só pelo botão.
 */

import { formatCurrency, formatDate, PAYMENT_LABELS } from './format'
import { buscarCupomFiscal } from '../services/orders'

const CHAVE_LIGADA = 'coxelli_impressao_auto'
const CHAVE_DESDE = 'coxelli_impressao_desde'
const CHAVE_IMPRESSOS = 'coxelli_cupons_impressos'
// só para não crescer para sempre; um dia de loja não chega perto disso
const LIMITE_IMPRESSOS = 300

/*
 * A bobina tem 80 mm, mas a Epson imprime só 72 mm dela, a partir da borda esquerda. Conteúdo
 * centralizado nos 80 mm perde a ponta direita (foi o que cortou os valores no primeiro teste),
 * então tudo fica encostado à esquerda e com 70 mm de largura.
 *
 * O tamanho do papel NÃO vai aqui: fica o que estiver configurado no driver da Epson. Quando o
 * @page pede um tamanho e o driver tem outro, o Chrome encolhe a página inteira para caber — foi
 * o que fez o cupom sair pequeno.
 */
const CSS_BOBINA = `
  @page { margin: 0 }
  html, body { width: 70mm !important; margin: 0 !important; padding: 0 0 0 1mm !important }
`

/*
 * O cupom do Bling vem em 7 pt, pensado para tela: na térmica ninguém lê. Sobe para 10 pt, o logo
 * sai (ocupava meia largura e empurrava o endereço para uma coluna estreita) e o QR Code vai de
 * ~20 para 35 mm, para o celular do cliente ler de primeira — é SVG, cresce sem perder nitidez.
 * Assim o cupom passa um pouco dos 150 mm da bobina configurada; a Epson só corta no fim do
 * documento, então o resto sai emendado, e não numa segunda tira.
 */
const CSS_CUPOM = `
  #container { margin: 0 !important; padding: 0 !important }
  table { table-layout: auto !important; margin: 0 !important }
  td { padding: 0 !important }
  td[rowspan] { display: none !important }
  body, td, th, div, span, p { font-size: 10pt !important; line-height: 1.2 !important }
  h1, h2, h3 { font-size: 10pt !important; margin: 0 !important }
  .pontilhado, hr { margin: 1.5mm 0 !important }
  svg { width: 35mm !important; height: 35mm !important }
`

const ROTULO_PAGAMENTO = {
  ...PAYMENT_LABELS,
  pix_online: 'Pix pelo site',
  cartao: 'Cartão pelo site',
}

function ler(chave) {
  try {
    return localStorage.getItem(chave)
  } catch {
    return null
  }
}

function gravar(chave, valor) {
  try {
    localStorage.setItem(chave, valor)
  } catch {
    // storage bloqueado: a impressão automática simplesmente não fica ligada neste aparelho
  }
}

/** A impressão automática é por aparelho: só o computador da impressora deve ligá-la. */
export function impressaoAutoLigada() {
  return ler(CHAVE_LIGADA) === 'on'
}

/**
 * Ligar marca o momento: notas autorizadas antes dele não saem. Sem isso, ligar a chave
 * despejaria na impressora os cupons do dia inteiro de uma vez.
 */
export function definirImpressaoAuto(ligada) {
  gravar(CHAVE_LIGADA, ligada ? 'on' : 'off')
  if (ligada) gravar(CHAVE_DESDE, new Date().toISOString())
}

export function impressaoAutoDesde() {
  return ler(CHAVE_DESDE)
}

function impressos() {
  try {
    return JSON.parse(ler(CHAVE_IMPRESSOS) || '[]')
  } catch {
    return []
  }
}

export function cupomJaImpresso(id) {
  return impressos().includes(id)
}

export function marcarCupomImpresso(id) {
  const lista = impressos().filter(x => x !== id)
  lista.push(id)
  gravar(CHAVE_IMPRESSOS, JSON.stringify(lista.slice(-LIMITE_IMPRESSOS)))
}

/**
 * Imprime um documento HTML completo. Resolve quando ele foi entregue ao Chrome — com
 * --kiosk-printing isso é o envio à impressora; sem a flag, é quando a janela fecha.
 */
function imprimirHtml(html, cssExtra = '') {
  // o ajuste da bobina entra por último no <head>, para valer por cima do CSS do documento
  const css = `<style>${CSS_BOBINA}${cssExtra}</style>`
  const ajustado = html.includes('</head>') ? html.replace('</head>', `${css}</head>`) : `${css}${html}`

  return new Promise((resolve) => {
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
    document.body.appendChild(iframe)

    const doc = iframe.contentWindow.document
    doc.open()
    doc.write(ajustado)
    doc.close()

    // espera a página montar (o CSS do cupom vem do Bling) antes de imprimir, senão sai em branco
    setTimeout(() => {
      try {
        iframe.contentWindow.focus()
        iframe.contentWindow.print()
      } finally {
        // o print() segura a execução até a impressão sair; depois disso o iframe pode ir
        setTimeout(() => { iframe.remove(); resolve() }, 1000)
      }
    }, 800)
  })
}

/** Cupom fiscal (DANFE NFC-e) do pedido, como o Bling monta: é a via do cliente. */
export async function imprimirCupomFiscal(orderId) {
  const html = await buscarCupomFiscal(orderId)
  await imprimirHtml(html, CSS_CUPOM)
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]))

function linhaValor(rotulo, valor, classe = '') {
  return `<div class="lv ${classe}"><span>${esc(rotulo)}</span><span>${esc(valor)}</span></div>`
}

function htmlDaComanda(p) {
  const entrega = p.delivery_type === 'entrega'
  // pago vale para o site e para o que a loja já marcou como recebido no painel
  const pago = p.payment_status === 'pago'

  const itens = (p.order_items ?? []).map(item => {
    // quantity do sabor é por pacote; a cozinha precisa do total, como no painel
    const sabores = (item.order_item_flavors ?? []).map(s =>
      `<div class="sabor">${s.quantity * item.quantity}x ${esc(s.flavor_name)}</div>`
    ).join('')
    return `<div class="item"><div class="lv"><b>${item.quantity}x ${esc(item.product_name)}</b><span>${esc(formatCurrency(item.total_price))}</span></div>${sabores}</div>`
  }).join('')

  const endereco = entrega ? `
    <div class="bloco">
      <div>${esc(p.address)}, ${esc(p.address_number)}${p.address_complement ? ` - ${esc(p.address_complement)}` : ''}</div>
      <div>${esc(p.neighborhood)}</div>
      ${p.address_reference ? `<div>Ref: ${esc(p.address_reference)}</div>` : ''}
    </div>` : ''

  const troco = p.payment_method === 'dinheiro' && Number(p.change_for) > 0
    ? linhaValor('Troco para', formatCurrency(p.change_for)) + linhaValor('Levar de troco', formatCurrency(Number(p.change_for) - Number(p.total)))
    : ''

  return `<!doctype html><html><head><meta charset="utf-8"><title>Pedido #${esc(p.order_number)}</title>
<style>
  * { box-sizing: border-box }
  body { padding-top: 3mm !important; padding-bottom: 8mm !important; font: 13px/1.35 Arial, Helvetica, sans-serif; color: #000 }
  .centro { text-align: center }
  .marca { font-size: 18px; font-weight: 800; letter-spacing: 1px }
  .numero { font-size: 26px; font-weight: 800; margin: 2px 0 }
  .faixa { border: 2px solid #000; padding: 3px; margin: 6px 0; text-align: center; font-weight: 800; font-size: 15px }
  .invertida { background: #000; color: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact }
  .bloco { margin: 4px 0 }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0 }
  .lv { display: flex; justify-content: space-between; gap: 6px }
  .item { margin: 4px 0 }
  .sabor { padding-left: 10px; font-size: 13px }
  .total { font-size: 16px; font-weight: 800 }
  .obs { border: 1px solid #000; padding: 4px; margin: 6px 0; font-weight: 700 }
  .rodape { font-size: 11px; text-align: center; margin-top: 8px }
</style></head><body>
  <div class="centro marca">COXELLI</div>
  <div class="centro numero">PEDIDO #${esc(p.order_number)}</div>
  <div class="centro">${esc(formatDate(p.created_at))}</div>
  ${p.scheduled_for ? `<div class="faixa invertida">AGENDADO: ${esc(formatDate(p.scheduled_for))}</div>` : ''}
  <div class="faixa">${entrega ? 'ENTREGA' : 'RETIRADA NA LOJA'}</div>
  <div class="bloco"><b>${esc(p.customer_name)}</b><div>${esc(p.customer_phone)}</div></div>
  ${endereco}
  <hr>
  ${itens}
  ${p.notes ? `<div class="obs">OBS: ${esc(p.notes)}</div>` : ''}
  <hr>
  ${linhaValor('Subtotal', formatCurrency(p.subtotal))}
  ${Number(p.discount) > 0 ? linhaValor(`Desconto${p.coupon_code ? ` (${p.coupon_code})` : ''}`, `-${formatCurrency(p.discount)}`) : ''}
  ${entrega ? linhaValor('Entrega', formatCurrency(p.delivery_fee)) : ''}
  ${linhaValor('TOTAL', formatCurrency(p.total), 'total')}
  <hr>
  <div><b>Pagamento:</b> ${esc(ROTULO_PAGAMENTO[p.payment_method] ?? p.payment_method)}</div>
  <div class="faixa">${pago ? 'JÁ PAGO' : entrega ? 'COBRAR NA ENTREGA' : 'COBRAR NA RETIRADA'}</div>
  ${pago ? '' : troco}
  <div class="rodape">Impresso em ${esc(formatDate(new Date().toISOString()))}</div>
</body></html>`
}

/** Comanda da cozinha: não é documento fiscal, sai só quando alguém pede. */
export function imprimirComanda(pedido) {
  return imprimirHtml(htmlDaComanda(pedido))
}
