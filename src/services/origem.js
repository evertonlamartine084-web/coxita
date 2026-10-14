import { supabase } from './supabase'

/**
 * De onde veio quem fez o pedido no site: anúncio do Google, busca do Google, Perfil da Empresa,
 * Instagram, link do WhatsApp ou direto.
 *
 * A pessoa clica no anúncio, olha o cardápio e às vezes só fecha o pedido no dia seguinte. Por
 * isso a origem fica guardada no aparelho por 30 dias: vale a última visita que veio de algum
 * lugar (entrar digitando o endereço não apaga um anúncio de ontem). No pedido feito, ela vai
 * para `orders.origem`.
 */

const CHAVE = 'coxelli_origem'
const VALIDADE = 30 * 24 * 60 * 60 * 1000

function hostDe(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

/** Nome curto da origem, o mesmo que o painel e o hub mostram. */
function classificar({ gclid, utm_source, utm_medium, utm_campaign, referrer }) {
  const fonte = (utm_source || '').toLowerCase()
  const meio = (utm_medium || '').toLowerCase()
  const ref = hostDe(referrer)
  if (gclid) return 'google_ads'
  if (meio === 'cpc' || meio === 'ppc' || meio === 'paid') return fonte.includes('google') ? 'google_ads' : `anuncio_${fonte || 'outro'}`
  if ((utm_campaign || '').toLowerCase() === 'perfil_empresa') return 'perfil_google'
  if (fonte.includes('instagram') || /(^|\.)instagram\.com$/.test(ref)) return 'instagram'
  if (fonte.includes('facebook') || /(^|\.)(facebook|fb)\.com$/.test(ref)) return 'facebook'
  if (fonte.includes('whatsapp') || /whatsapp\.com$|^wa\.me$/.test(ref)) return 'whatsapp'
  if (fonte.includes('ifood') || /ifood\.com\.br$/.test(ref)) return 'ifood'
  if (/^google\./.test(ref) || fonte === 'google') return 'google_busca'
  if (/^(bing\.com|duckduckgo\.com|search\.yahoo\.com)$/.test(ref)) return 'outra_busca'
  if (fonte) return fonte
  if (ref) return `site:${ref}`
  return null
}

/** Chamado no boot do site: guarda a origem se a visita veio de algum lugar. */
export function capturarOrigem() {
  try {
    const p = new URLSearchParams(window.location.search)
    const referrer = document.referrer && hostDe(document.referrer) !== window.location.hostname ? document.referrer : ''
    const dados = {
      gclid: p.get('gclid') || p.get('gbraid') || p.get('wbraid') || '',
      utm_source: p.get('utm_source') || '',
      utm_medium: p.get('utm_medium') || '',
      utm_campaign: p.get('utm_campaign') || '',
      referrer,
    }
    const canal = classificar(dados)
    if (!canal) return
    const limpo = Object.fromEntries(Object.entries(dados).filter(([, v]) => v).map(([k, v]) => [k, String(v).slice(0, 300)]))
    localStorage.setItem(CHAVE, JSON.stringify({
      canal, ...limpo, pagina: window.location.pathname.slice(0, 200), em: new Date().toISOString(),
    }))
  } catch {
    // sem localStorage (aba anônima travada): o pedido sai como "direto"
  }
}

function origemGuardada() {
  try {
    const o = JSON.parse(localStorage.getItem(CHAVE) || 'null')
    if (o && Date.now() - new Date(o.em) < VALIDADE) return o
  } catch { /* guardado inválido: trata como direto */ }
  return { canal: 'direto' }
}

/** Grava a origem no pedido recém-criado. Falhar aqui não pode atrapalhar o pedido. */
export async function gravarOrigemDoPedido(pedido) {
  if (!pedido?.id || !pedido?.public_token) return
  const { error } = await supabase.rpc('gravar_origem_pedido', {
    p_order_id: pedido.id,
    p_token: pedido.public_token,
    p_origem: origemGuardada(),
  })
  if (error) console.warn('Não foi possível gravar a origem do pedido:', error.message)
}

/** Texto para a loja ler: "Anúncio do Google", "Instagram"… */
export function rotuloDaOrigem(origem) {
  const canal = origem?.canal
  if (!canal) return null
  const nomes = {
    google_ads: 'Anúncio do Google',
    google_busca: 'Busca do Google',
    perfil_google: 'Perfil no Google',
    instagram: 'Instagram',
    facebook: 'Facebook',
    whatsapp: 'Link no WhatsApp',
    ifood: 'iFood',
    outra_busca: 'Outra busca',
    direto: 'Direto',
  }
  if (nomes[canal]) return nomes[canal]
  if (canal.startsWith('site:')) return canal.slice(5)
  if (canal.startsWith('anuncio_')) return `Anúncio (${canal.slice(8)})`
  return canal
}
