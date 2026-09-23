/**
 * Comanda da cozinha, impressa na térmica (Epson, papel de 80 x 150 mm, USB no Windows).
 *
 * A impressão passa pelo próprio Chrome: a comanda vira uma página do tamanho da bobina, num
 * iframe escondido, e o painel chama print() nela. Aberto com --kiosk-printing, o Chrome manda
 * direto para a impressora padrão, sem janela; sem a flag, a janela de impressão aparece e
 * alguém confirma. Nenhum programa extra instalado na máquina da loja.
 */

import { formatCurrency, formatDate, PAYMENT_LABELS } from './format'

const CHAVE_LIGADA = 'coxelli_impressao_auto'
const CHAVE_DESDE = 'coxelli_impressao_desde'
const CHAVE_IMPRESSAS = 'coxelli_comandas_impressas'
// só para não crescer para sempre; um dia de loja não chega perto disso
const LIMITE_IMPRESSAS = 300

// Pago na hora pelo site: a comanda só sai com o dinheiro confirmado, senão a cozinha prepara
// pedido de quem desistiu no meio do Pix
const PAGOS_ONLINE = ['pix_online', 'cartao']

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
 * Ligar marca o momento: pedidos anteriores a ele não saem. Sem isso, ligar a chave despejaria
 * na impressora todos os pedidos do dia de uma vez.
 */
export function definirImpressaoAuto(ligada) {
  gravar(CHAVE_LIGADA, ligada ? 'on' : 'off')
  if (ligada) gravar(CHAVE_DESDE, new Date().toISOString())
}

export function impressaoAutoDesde() {
  return ler(CHAVE_DESDE)
}

function impressas() {
  try {
    return JSON.parse(ler(CHAVE_IMPRESSAS) || '[]')
  } catch {
    return []
  }
}

export function jaImpressa(id) {
  return impressas().includes(id)
}

export function marcarImpressa(id) {
  const lista = impressas().filter(x => x !== id)
  lista.push(id)
  gravar(CHAVE_IMPRESSAS, JSON.stringify(lista.slice(-LIMITE_IMPRESSAS)))
}

/** Se o pedido já está valendo para a cozinha começar. */
export function prontoParaComanda(pedido) {
  if (pedido.status === 'cancelado') return false
  if (PAGOS_ONLINE.includes(pedido.payment_method)) return pedido.payment_status === 'pago'
  return true
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
  /* 80 x 150 mm é o papel configurado na Epson da loja; pedido maior continua numa segunda folha */
  @page { size: 80mm 150mm; margin: 0 }
  * { box-sizing: border-box }
  body { width: 72mm; margin: 0 auto; padding: 3mm 0 8mm; font: 13px/1.35 Arial, Helvetica, sans-serif; color: #000 }
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

/**
 * Imprime a comanda. Resolve quando a página foi entregue ao Chrome — com --kiosk-printing isso
 * é o envio à impressora; sem a flag, é quando a janela de impressão fecha.
 */
export function imprimirComanda(pedido) {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
    document.body.appendChild(iframe)

    const doc = iframe.contentWindow.document
    doc.open()
    doc.write(htmlDaComanda(pedido))
    doc.close()

    // espera a página montar antes de imprimir, senão sai em branco
    setTimeout(() => {
      try {
        iframe.contentWindow.focus()
        iframe.contentWindow.print()
      } finally {
        // o print() segura a execução até a impressão sair; depois disso o iframe pode ir
        setTimeout(() => { iframe.remove(); resolve() }, 1000)
      }
    }, 250)
  })
}
