import { supabase } from './supabase'
import { peekSettings } from './settings'

/**
 * Tag do Google (GA4 e Google Ads) e Pixel da Meta, para medir de onde vêm os pedidos e os
 * contatos.
 *
 * Os códigos ficam em `settings` e são colados no painel (Configurações), sem deploy:
 *   google_tag_id                 G-XXXXXXX     GA4
 *   google_ads_id                 AW-XXXXXXX    Google Ads
 *   google_ads_conversao_pedido   rótulo da conversão "pedido feito"
 *   google_ads_conversao_whatsapp rótulo da conversão "chamou no WhatsApp"
 *   meta_pixel_id                 número do Pixel (conjunto de dados) da Meta
 *
 * Sem código nenhum, nada é carregado e todas as funções daqui viram no-op. O painel
 * (/admin) tem HTML próprio e não passa por aqui, então pedido lançado pela loja não conta.
 */

let ids = null          // { ga, ads, convPedido, convWhats, meta } depois de iniciar
let fila = []           // eventos disparados antes de os códigos chegarem
let filaMeta = []       // idem, para o Pixel da Meta

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
    meta: (s.meta_pixel_id || '').replace(/\D/g, ''),
  }
  carregarMeta()
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

/** Pixel da Meta: o mesmo trecho que a Meta manda colar no <head>, carregado só com o número. */
function carregarMeta() {
  if (!ids.meta) {
    filaMeta = []
    return
  }
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
  document,'script','https://connect.facebook.net/en_US/fbevents.js');
  window.fbq('init', ids.meta)
  filaMeta.forEach((args) => window.fbq(...args))
  filaMeta = []
}

/** Evento do Pixel. PageView também vai à mão, pelo mesmo motivo do GA4 (SPA). */
function meta(...args) {
  if (!ids) {
    filaMeta.push(args)
    return
  }
  if (ids.meta) window.fbq(...args)
}

const CHAVES = ['google_tag_id', 'google_ads_id', 'google_ads_conversao_pedido', 'google_ads_conversao_whatsapp', 'meta_pixel_id']

/**
 * Chamado uma vez, no boot. Os settings embutidos no HTML são os do último deploy: se os
 * códigos ainda não estão lá (foram colados no painel depois), busca só essas chaves no banco,
 * para o painel valer sem deploy.
 */
export function iniciarRastreio() {
  if (ids) return
  const s = peekSettings()
  // Só confia no que veio embutido se todos os códigos estão lá: com um faltando, ele pode ter
  // sido colado no painel depois do deploy (foi o caso do GA4, em 08/10/2026)
  if (s?.google_tag_id && s?.google_ads_id && s?.meta_pixel_id) carregar(s)
  else {
    supabase.from('settings').select('key, value').in('key', CHAVES)
      .then(({ data, error }) => {
        if (error) throw error
        carregar(Object.fromEntries((data ?? []).map(l => [l.key, l.value])))
      })
      .catch(() => { ids = { ga: '', ads: '', meta: '' }; fila = []; filaMeta = [] })
  }

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
  meta('track', 'PageView')
}

const itemDoCarrinho = (i) => ({
  item_id: String(i.id),
  item_name: i.name,
  price: Number(i.price),
  quantity: i.quantity ?? 1,
})

export function adicionouAoCarrinho(produto) {
  evento('add_to_cart', { currency: 'BRL', value: Number(produto.price), items: [itemDoCarrinho(produto)] })
  meta('track', 'AddToCart', {
    currency: 'BRL', value: Number(produto.price), content_type: 'product',
    content_ids: [String(produto.id)], content_name: produto.name,
  })
}

export function comecouCheckout(itens, total) {
  evento('begin_checkout', { currency: 'BRL', value: Number(total), items: itens.map(itemDoCarrinho) })
  meta('track', 'InitiateCheckout', {
    currency: 'BRL', value: Number(total), content_type: 'product',
    content_ids: itens.map(i => String(i.id)), num_items: itens.reduce((t, i) => t + (i.quantity ?? 1), 0),
  })
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
  // eventID evita contar duas vezes o mesmo pedido se a página recarregar
  meta('track', 'Purchase', {
    currency: 'BRL', value: params.value, content_type: 'product',
    contents: params.items.map(i => ({ id: i.item_id, quantity: i.quantity })),
  }, { eventID: `pedido-${params.transaction_id}` })
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
  meta('track', 'Contact', { content_name: origem })
  if (ids?.ads && ids.convWhats) evento('conversion', { send_to: `${ids.ads}/${ids.convWhats}` })
}
