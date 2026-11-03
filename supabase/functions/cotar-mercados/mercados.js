/**
 * Busca de preço nos mercados de Natal que publicam a loja online (02/11/2026).
 *
 * JS puro de propósito: o Deno da função importa este arquivo e o Node também, para testar a
 * leitura dos nomes sem subir a função.
 *
 *  - Atacadão (VTEX): a busca é aberta; o preço e o estoque são os da loja Natal Sul, pela simulação
 *    de carrinho com o vendedor dela (o preço da busca é o da loja online nacional).
 *  - Nordestão e Favorito (VipCommerce): a loja online entra como visitante com a chave que o
 *    próprio site manda para todo navegador (POST auth/loja/login) e busca na loja escolhida
 *    (VIP_LOJAS).
 *
 * Assaí e Carrefour ficam de fora: os sites têm proteção contra robô (Incapsula, captcha). Super
 * Fácil, Mar Vermelho e Rede Mais não vendem online (encarte só no Facebook e no WhatsApp).
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
// A loja física de Natal. A busca do site devolve o preço do vendedor "1" (a loja online, que
// entrega no Brasil todo e custa igual em qualquer CEP: óleo Soya R$ 7,99); o da loja Natal Sul
// só sai pela simulação de carrinho com este vendedor (R$ 8,79 em 02/11/2026), com o estoque dela.
const ATACADAO_LOJA = 'atacadaobr51'

export async function buscarAtacadao(termo) {
  const url = `https://www.atacadao.com.br/io/api/catalog_system/pub/products/search?ft=${encodeURIComponent(termo)}&_from=0&_to=49`
  const r = await fetch(url, { headers: { 'user-agent': UA } })
  if (!r.ok && r.status !== 206) throw new Error(`Atacadão ${r.status}`)
  const lista = (await r.json()) ?? []
  const porSku = new Map(lista.filter(p => p.items?.[0]?.itemId).map(p => [String(p.items[0].itemId), p]))
  if (!porSku.size) return []

  // simulação de carrinho: não cria carrinho nem pedido, só devolve preço e estoque da loja
  const sim = await fetch(`https://www.atacadao.com.br/api/checkout/pub/orderForms/simulation?sc=1`, {
    method: 'POST',
    headers: { 'user-agent': UA, 'content-type': 'application/json' },
    body: JSON.stringify({
      items: [...porSku.keys()].map(id => ({ id, quantity: 1, seller: ATACADAO_LOJA })),
      postalCode: ATACADAO_CEP,
      country: 'BRA',
    }),
  })
  if (!sim.ok) throw new Error(`Atacadão (loja Natal Sul) ${sim.status}`)
  const d = await sim.json()
  const saida = []
  for (const i of d.items ?? []) {
    if (i.availability !== 'available' || !(i.sellingPrice > 0)) continue
    const p = porSku.get(String(i.id))
    if (!p) continue
    const preco = i.sellingPrice / 100
    const cheio = Number(i.listPrice) / 100
    saida.push({
      mercado: 'Atacadão',
      produto_id: String(p.productId),
      produto: p.productName,
      marca: p.brand ?? null,
      preco,
      preco_original: cheio > preco ? cheio : null,
      link: `https://www.atacadao.com.br/${p.linkText}/p`,
    })
  }
  return saida
}

// ---------------------------------------------------------------- VipCommerce (Nordestão, Favorito)

// A chave é a mesma que a plataforma manda para todo visitante de qualquer loja dela.
const VIP_CHAVE = 'df072f85df9bf7dd71b6811c34bdbaa4f219d98775b56cff9dfa5f8ca1bf8469'
// cd = centro de distribuição = a loja que separa o pedido; a lista sai de
// org/<org>/filial/1/loja/centros_distribuicoes/retiradas
const NORDESTAO = { api: 'https://services.vipcommerce.com.br', org: 52, filial: 1, dominio: 'nordestaomaisvoce.com.br', site: 'https://www.lojaonline.nordestao.com.br' }
const VIP_LOJAS = {
  // todas as lojas do Nordestão que vendem online (o preço pode mudar de uma para outra)
  'Nordestão Santa Catarina': { ...NORDESTAO, cd: 1 },
  'Nordestão Lagoa Nova': { ...NORDESTAO, cd: 2 },
  'Nordestão Ponta Negra': { ...NORDESTAO, cd: 3 },
  'Nordestão Nova Parnamirim': { ...NORDESTAO, cd: 4 },
  'Nordestão Tirol': { ...NORDESTAO, cd: 6 },
  // só a loja de Ponta Negra (Av. Eng. Roberto Freire, 1460) vende online
  'Favorito': { api: 'https://services-beta.vipcommerce.com.br', org: 35, filial: 1, cd: 1, dominio: 'favoritosupermercados.com.br', site: 'https://www.favoritosupermercados.com.br' },
}
const tokensVip = new Map()

function cabecalhoVip(loja, token) {
  return { 'user-agent': UA, 'content-type': 'application/json', domainkey: loja.dominio, organizationid: String(loja.org), authorization: `Bearer${token ? ` ${token}` : ''}` }
}

// o login é da rede, não da loja: um token serve a todas as lojas do Nordestão
async function tokenVip(nome) {
  const loja = VIP_LOJAS[nome]
  if (tokensVip.has(loja.org)) return tokensVip.get(loja.org)
  const pedido = fetch(`${loja.api}/api-admin/v1/org/${loja.org}/auth/loja/login`, {
    method: 'POST',
    headers: cabecalhoVip(loja),
    body: JSON.stringify({ domain: loja.dominio, username: 'loja', key: VIP_CHAVE }),
  }).then(r => r.json()).then(d => {
    if (!d?.data) throw new Error(`${nome} não abriu a loja para visitante`)
    return d.data
  })
  tokensVip.set(loja.org, pedido)
  pedido.catch(() => tokensVip.delete(loja.org))
  return pedido
}

async function buscarVip(nome, termo) {
  const loja = VIP_LOJAS[nome]
  const t = await tokenVip(nome)
  const termoUrl = encodeURIComponent(termo).replace(/%20/g, '+')
  const url = `${loja.api}/api-admin/v1/org/${loja.org}/filial/${loja.filial}/centro_distribuicao/${loja.cd}/loja/buscas/produtos/termo/${termoUrl}?page=1`
  let r = await fetch(url, { headers: cabecalhoVip(loja, t) })
  // o servidor do Favorito devolve 500 de vez em quando; na segunda vai
  if (r.status >= 500) {
    await new Promise(ok => setTimeout(ok, 1500))
    r = await fetch(url, { headers: cabecalhoVip(loja, t) })
  }
  if (!r.ok) throw new Error(`${nome} ${r.status}`)
  const d = await r.json()
  const saida = []
  for (const p of d?.data?.produtos ?? []) {
    if (!p.disponivel) continue
    const cheio = Number(p.preco)
    const promo = p.em_oferta ? Number(p.oferta?.preco_oferta ?? p.oferta?.preco ?? 0) : 0
    const preco = promo > 0 && promo < cheio ? promo : cheio
    if (!(preco > 0)) continue
    // vendido a peso: "Bacon Sadia Defumado 300g" sai em peça de 0,165 kg a R$ 45,88/kg. O peso
    // vem em quantidade_unidade_diferente (e o preco_original, aí, é o do kg, não o de antes)
    const aPeso = p.possui_unidade_diferente && /^kg$/i.test(p.unidade_sigla ?? '') && Number(p.quantidade_unidade_diferente) > 0
    saida.push({
      mercado: nome,
      produto_id: String(p.produto_id),
      produto: p.descricao,
      marca: p.marca?.descricao ?? null,
      preco,
      ...(aPeso ? { peso_kg: Number(p.quantidade_unidade_diferente) } : {}),
      preco_original: preco < cheio ? cheio : null,
      link: `${loja.site}/produtos/detalhe/${p.produto_id}/${p.link}`,
    })
  }
  return saida
}

export const MERCADOS = [
  { nome: 'Atacadão', buscar: buscarAtacadao },
  ...Object.keys(VIP_LOJAS).map(nome => ({ nome, buscar: (termo) => buscarVip(nome, termo) })),
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
          const tamanho = p.peso_kg && ['kg', 'L'].includes(unidade) ? p.peso_kg
            : unidade === 'un' ? (tamanhoDoNome(p.produto, null) ? null : 1) : tamanhoDoNome(p.produto, unidade)
          if (!tamanho) continue
          if (busca.minimo && tamanho < Number(busca.minimo)) continue
          const preco_unidade = Math.round((p.preco / tamanho) * 10000) / 10000
          // nome com o peso errado no site ("Queijo Coalho Pc 400kg"): longe demais do que se paga
          if (pagoHoje > 0 && (preco_unidade < pagoHoje * 0.3 || preco_unidade > pagoHoje * 4)) continue
          const { peso_kg: _, ...resto } = p
          achados.set(`${p.mercado}|${p.produto_id}`, { ...resto, tamanho, preco_unidade })
        }
      } catch (e) {
        erros.push(`${mercado.nome} (${termo}): ${e.message}`)
      }
    }
  }
  return { achados: [...achados.values()].sort((a, b) => a.preco_unidade - b.preco_unidade), erros }
}
