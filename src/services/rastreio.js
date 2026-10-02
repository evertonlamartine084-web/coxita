import { getSettings, peekSettings } from './settings'

/**
 * Tag do Google (GA4 e Google Ads) para medir de onde vêm os pedidos e os contatos.
 *
 * Os códigos ficam em `settings` e são colados no painel (Configurações), sem deploy:
 *   google_tag_id                 G-XXXXXXX     GA4
 *   google_ads_id                 AW-XXXXXXX    Google Ads
 *   google_ads_conversao_pedido   rótulo da conversão "pedido feito"
 *   google_ads_conversao_whatsapp rótulo da conversão "chamou no WhatsApp"
 *
 * Sem código nenhum, nada é carregado e todas as funções daqui viram no-op. O painel
 * (/admin) tem HTML próprio e não passa por aqui, então pedido lançado pela loja não conta.
 */

let ids = null          // { ga, ads, convPedido, convWhats } depois de iniciar
let fila = []           // eventos disparados antes de os códigos chegarem

function gtag() {
  window.dataLayer.push(arguments)
}

function carregar(s) {
  const ga = (s.google_tag_id || '').trim()
  const ads = (s.google_ads_id || '').trim()
  ids = {
    ga, ads,
    convPedido: (s.google_ads_conversao_pedido || '').trim(),
    convWhats: (s.google_ads_conversao_whatsapp || '').trim(),
  }
  if (!ga && !ads) {
    fila = []
    return
  }

  window.dataLayer = window.dataLayer || []
  window.gtag = gtag
  gtag('js', new Date())
  // page_view é mandado à mão a cada troca de rota: o site é SPA, e o automático só
  // contaria a primeira página
  if (ga) gtag('config', ga, { send_page_view: false })
  if (ads) gtag('config', ads)

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga || ads)}`
  document.head.appendChild(script)

  fila.forEach(([nome, params]) => evento(nome, params))
  fila = []
}

/** Chamado uma vez, no boot. Os settings já vêm embutidos no HTML na maior parte das vezes. */
export function iniciarRastreio() {
  if (ids) return
  const s = peekSettings()
  if (s) carregar(s)
  else getSettings().then(carregar).catch(() => { ids = { ga: '', ads: '' }; fila = [] })

  // Qualquer link de WhatsApp do site conta como contato, sem precisar marcar um por um
  document.addEventListener('click', (e) => {
    const link = e.target.closest?.('a[href*="wa.me"]')
    if (link) contatoWhatsApp(link.dataset.origem || 'link')
  }, true)
}

export function evento(nome, params = {}) {
  if (!ids) {
    fila.push([nome, params])
    return
  }
  if (!ids.ga && !ids.ads) return
  gtag('event', nome, params)
}

export function paginaVista(caminho) {
  evento('page_view', { page_path: caminho, page_location: window.location.href, page_title: document.title })
}

const itemDoCarrinho = (i) => ({
  item_id: String(i.id),
  item_name: i.name,
  price: Number(i.price),
  quantity: i.quantity ?? 1,
})

export function adicionouAoCarrinho(produto) {
  evento('add_to_cart', { currency: 'BRL', value: Number(produto.price), items: [itemDoCarrinho(produto)] })
}

export function comecouCheckout(itens, total) {
  evento('begin_checkout', { currency: 'BRL', value: Number(total), items: itens.map(itemDoCarrinho) })
}

export function fezPedido(pedido, itens) {
  const params = {
    transaction_id: String(pedido.order_number ?? pedido.id),
    currency: 'BRL',
    value: Number(pedido.total),
    shipping: Number(pedido.delivery_fee ?? 0),
    items: itens.map(itemDoCarrinho),
  }
  evento('purchase', params)
  if (ids?.ads && ids.convPedido) {
    evento('conversion', {
      send_to: `${ids.ads}/${ids.convPedido}`,
      value: params.value,
      currency: 'BRL',
      transaction_id: params.transaction_id,
    })
  }
}

/** Contato pelo WhatsApp: encomenda gourmet, orçamento de evento, entrega fora da Zona Norte. */
export function contatoWhatsApp(origem) {
  evento('generate_lead', { method: 'whatsapp', lead_source: origem })
  if (ids?.ads && ids.convWhats) evento('conversion', { send_to: `${ids.ads}/${ids.convWhats}` })
}
