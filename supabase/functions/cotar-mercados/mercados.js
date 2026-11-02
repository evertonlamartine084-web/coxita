/**
 * Busca de preço nos mercados de Natal que publicam a loja online (02/11/2026).
 *
 * JS puro de propósito: o Deno da função importa este arquivo e o Node também, para testar a
 * leitura dos nomes sem subir a função.
 *
 *  - Atacadão (VTEX): a busca é aberta; o preço é o da loja que atende o CEP, mandado no cookie
 *    vtex_segment. O CEP 59064-000 cai na Natal Sul (o da Zona Norte cai em lojas de outros estados).
 *  - Nordestão (VipCommerce): a loja online entra como visitante com a chave que o próprio site
 *    manda para todo navegador (POST auth/loja/login) e busca no centro de distribuição 2.
 *
 * Assaí e Carrefour ficam de fora: os sites têm proteção contra robô (Incapsula, captcha).
 */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'

// ---------------------------------------------------------------- tamanho da embalagem

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Quanto vem na embalagem, na unidade do insumo: "Óleo de Soja Soya 900ml" -> 0,9 (L);
 * "Margarina Claybom 14kg" -> 14 (kg); "Kit 3 Farinha 1kg" -> 3. Null quando o nome não diz.
 */
export function tamanhoDoNome(nome, unidade) {
  const n = semAcento(nome).replace(/(\d),(\d)/g, '$1.$2')
  const m = /(\d+(?:\.\d+)?)\s*(kg|kilo|quilo|g|gr|grs|gramas|l|lt|lts|litros?|ml)\b/.exec(n)
  if (!m) return null
  let valor = Number(m[1])
  const u = m[2]
  let em
  if (/^(kg|kilo|quilo)$/.test(u)) em = 'kg'
  else if (/^(g|gr|grs|gramas)$/.test(u)) { em = 'kg'; valor /= 1000 }
  else if (u === 'ml') { em = 'L'; valor /= 1000 }
  else em = 'L'
  // leite, óleo: 1 L vale 1 kg para a conta (a ficha pede o leite em L e o requeijão em kg)
  if (unidade && em !== unidade && !(['kg', 'L'].includes(unidade) && ['kg', 'L'].includes(em))) return null
  const kit = /\b(?:kit|leve|pack|fardo|cx|caixa|c\/)\s*(\d{1,2})\b/.exec(n) || /\b(\d{1,2})\s*(?:un|unid|unidades)\b/.exec(n)
  const vezes = kit ? Number(kit[1]) : 1
  return valor > 0 ? valor * (vezes > 0 && vezes <= 24 ? vezes : 1) : null
}

/**
 * O produto é do insumo? O nome começa com um de `comeca` ("bacon" pega "Bacon Seara", não "Caldo
 * Sazón Bacon"), tem todas as palavras de `incluir` e nenhuma de `excluir`.
 */
export function combina(nome, { comeca = [], incluir = [], excluir = [] } = {}) {
  const n = semAcento(nome).replace(/\s+/g, ' ').trim()
  return (!comeca?.length || comeca.some(p => n.startsWith(semAcento(p))))
    && (incluir ?? []).every(p => n.includes(semAcento(p)))
    && !(excluir ?? []).some(p => p && n.includes(semAcento(p)))
}

// ---------------------------------------------------------------- Atacadão

const ATACADAO_CEP = '59064000'
let segmentoAtacadao = null

async function segmento() {
  if (segmentoAtacadao) return segmentoAtacadao
  const r = await fetch(`https://www.atacadao.com.br/api/checkout/pub/regions?country=BRA&postalCode=${ATACADAO_CEP}`, { headers: { 'user-agent': UA } })
  const [regiao] = await r.json()
  if (!regiao?.id) throw new Error('Atacadão não devolveu a região do CEP')
  const seg = { regionId: regiao.id, channel: '1', countryCode: 'BRA', cultureInfo: 'pt-BR', currencyCode: 'BRL' }
  segmentoAtacadao = btoa(JSON.stringify(seg))
  return segmentoAtacadao
}

export async function buscarAtacadao(termo) {
  const seg = await segmento()
  const url = `https://www.atacadao.com.br/io/api/catalog_system/pub/products/search?ft=${encodeURIComponent(termo)}&_from=0&_to=29`
  const r = await fetch(url, { headers: { 'user-agent': UA, cookie: `vtex_segment=${seg}` } })
  if (!r.ok && r.status !== 206) throw new Error(`Atacadão ${r.status}`)
  const lista = await r.json()
  const saida = []
  for (const p of lista ?? []) {
    const item = p.items?.[0]
    const oferta = item?.sellers?.find(s => s.sellerDefault)?.commertialOffer ?? item?.sellers?.[0]?.commertialOffer
    if (!oferta || !(oferta.Price > 0) || !(oferta.AvailableQuantity > 0)) continue
    saida.push({
      mercado: 'Atacadão',
      produto_id: String(p.productId),
      produto: p.productName,
      marca: p.brand ?? null,
      preco: Number(oferta.Price),
      preco_original: Number(oferta.ListPrice) > Number(oferta.Price) ? Number(oferta.ListPrice) : null,
      link: `https://www.atacadao.com.br/${p.linkText}/p`,
    })
  }
  return saida
}

// ---------------------------------------------------------------- Nordestão

const VIP = 'https://services.vipcommerce.com.br/api-admin/v1'
const NORDESTAO = { org: 52, filial: 1, cd: 2, dominio: 'nordestaomaisvoce.com.br', chave: 'df072f85df9bf7dd71b6811c34bdbaa4f219d98775b56cff9dfa5f8ca1bf8469' }
let tokenNordestao = null

async function token() {
  if (tokenNordestao) return tokenNordestao
  const r = await fetch(`${VIP}/org/${NORDESTAO.org}/auth/loja/login`, {
    method: 'POST',
    headers: { 'user-agent': UA, 'content-type': 'application/json', domainkey: NORDESTAO.dominio, organizationid: String(NORDESTAO.org), authorization: 'Bearer' },
    body: JSON.stringify({ domain: NORDESTAO.dominio, username: 'loja', key: NORDESTAO.chave }),
  })
  const d = await r.json()
  if (!d?.data) throw new Error('Nordestão não abriu a loja para visitante')
  tokenNordestao = d.data
  return tokenNordestao
}

export async function buscarNordestao(termo) {
  const t = await token()
  const termoUrl = encodeURIComponent(termo).replace(/%20/g, '+')
  const r = await fetch(`${VIP}/org/${NORDESTAO.org}/filial/${NORDESTAO.filial}/centro_distribuicao/${NORDESTAO.cd}/loja/buscas/produtos/termo/${termoUrl}?page=1`, {
    headers: { 'user-agent': UA, 'content-type': 'application/json', domainkey: NORDESTAO.dominio, organizationid: String(NORDESTAO.org), authorization: `Bearer ${t}` },
  })
  if (!r.ok) throw new Error(`Nordestão ${r.status}`)
  const d = await r.json()
  const saida = []
  for (const p of d?.data?.produtos ?? []) {
    if (!p.disponivel) continue
    const cheio = Number(p.preco)
    const promo = p.em_oferta ? Number(p.oferta?.preco_oferta ?? p.oferta?.preco ?? 0) : 0
    const preco = promo > 0 && promo < cheio ? promo : cheio
    if (!(preco > 0)) continue
    saida.push({
      mercado: 'Nordestão',
      produto_id: String(p.produto_id),
      produto: p.descricao,
      marca: p.marca?.descricao ?? null,
      preco,
      preco_original: preco < cheio ? cheio : null,
      link: `https://www.lojaonline.nordestao.com.br/produtos/detalhe/${p.produto_id}/${p.link}`,
    })
  }
  return saida
}

export const MERCADOS = [
  { nome: 'Atacadão', buscar: buscarAtacadao },
  { nome: 'Nordestão', buscar: buscarNordestao },
]

/**
 * Tudo o que serve ao insumo nos mercados, com o preço por kg/L/un. A busca de cada mercado roda
 * com cada termo; o que não combina com as palavras ou não diz o tamanho fica de fora.
 */
export async function cotarInsumo(busca, unidade, ignorados = new Set(), pagoHoje = null) {
  const termos = String(busca.termos ?? '').split(';').map(t => t.trim()).filter(Boolean)
  const achados = new Map()
  const erros = []
  for (const mercado of MERCADOS) {
    for (const termo of termos) {
      try {
        for (const p of await mercado.buscar(termo)) {
          if (ignorados.has(`${p.mercado}|${p.produto_id}`)) continue
          if (!combina(p.produto, busca)) continue
          const tamanho = unidade === 'un' ? (tamanhoDoNome(p.produto, null) ? null : 1) : tamanhoDoNome(p.produto, unidade)
          if (!tamanho) continue
          if (busca.minimo && tamanho < Number(busca.minimo)) continue
          const preco_unidade = Math.round((p.preco / tamanho) * 10000) / 10000
          // nome com o peso errado no site ("Queijo Coalho Pc 400kg"): longe demais do que se paga
          if (pagoHoje > 0 && (preco_unidade < pagoHoje * 0.3 || preco_unidade > pagoHoje * 4)) continue
          achados.set(`${p.mercado}|${p.produto_id}`, { ...p, tamanho, preco_unidade })
        }
      } catch (e) {
        erros.push(`${mercado.nome} (${termo}): ${e.message}`)
      }
    }
  }
  return { achados: [...achados.values()].sort((a, b) => a.preco_unidade - b.preco_unidade), erros }
}
