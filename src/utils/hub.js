/**
 * Contas do hub (/hub): períodos, comparação com o período anterior e os números de venda tirados
 * dos pedidos. Os números do Google vêm prontos da função hub-google.
 */

const DIA = 24 * 60 * 60 * 1000

export const PERIODOS_HUB = [
  { key: '7d', label: '7 dias', dias: 7 },
  { key: '28d', label: '28 dias', dias: 28 },
  { key: '90d', label: '90 dias', dias: 90 },
  { key: 'mes', label: 'Este mês' },
]

/** Taxa do iFood sobre a cesta: 23% de comissão + 3,2% de transação. */
export const TAXA_IFOOD = 0.262

const iso = (d) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
const meiaNoite = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

/**
 * Período até hoje e o anterior do mesmo tamanho. "Este mês" compara com os mesmos dias do mês
 * passado (1 a 10 com 1 a 10), senão o mês inteiro de antes sempre ganharia.
 */
export function calcularPeriodo(key) {
  const hoje = meiaNoite(new Date())
  let ini, antIni, antFim
  if (key === 'mes') {
    ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
    antIni = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
    const ultimoDoAnterior = new Date(hoje.getFullYear(), hoje.getMonth(), 0).getDate()
    antFim = new Date(hoje.getFullYear(), hoje.getMonth() - 1, Math.min(hoje.getDate(), ultimoDoAnterior))
  } else {
    const dias = PERIODOS_HUB.find(p => p.key === key).dias
    ini = new Date(+hoje - (dias - 1) * DIA)
    antFim = new Date(+ini - DIA)
    antIni = new Date(+ini - dias * DIA)
  }
  return {
    ini, fim: hoje, antIni, antFim,
    inicio: iso(ini), final: iso(hoje), antInicio: iso(antIni), antFinal: iso(antFim),
    dias: Math.round((hoje - ini) / DIA) + 1,
  }
}

/** Lista de dias do período, para os gráficos não pularem dia sem movimento. */
export function diasDoPeriodo(p) {
  const out = []
  for (let d = new Date(p.ini); d <= p.fim; d = new Date(+d + DIA)) out.push(iso(d))
  return out
}

/** "20261010" do Analytics, ou "2026-10-10" do Search Console → "2026-10-10". */
export const normalizarData = (s) => (s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : s)

export const rotuloDia = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`

/** Variação em % (null quando não há base para comparar). */
export function variacao(atual, anterior) {
  if (anterior === null || anterior === undefined || !Number.isFinite(anterior)) return null
  if (anterior === 0) return atual > 0 ? Infinity : null
  return ((atual - anterior) / anterior) * 100
}

const ehVenda = (o) => o.status !== 'cancelado' && !o.reposicao_de
const dentro = (o, ini, fim) => {
  const d = new Date(o.created_at)
  return d >= ini && d < new Date(+fim + DIA)
}

/** Número de telefone só com dígitos: é o que identifica o cliente entre pedidos. */
export const chaveCliente = (o) => (o.customer_phone || '').replace(/\D/g, '').slice(-11) || `nome:${o.customer_name}`

/** Quanto fica na loja: no iFood sai a taxa sobre a cesta (sem a entrega). */
export function liquido(o) {
  const total = Number(o.total)
  if (o.canal !== 'ifood') return total
  return total - (Number(o.subtotal) || total) * TAXA_IFOOD
}

/** Números de venda do período e do anterior, a partir dos pedidos do banco. */
export function calcularVendas(pedidos, p) {
  const vendas = pedidos.filter(ehVenda)
  const atual = vendas.filter(o => dentro(o, p.ini, p.fim))
  const anterior = vendas.filter(o => dentro(o, p.antIni, p.antFim))

  // primeira compra de cada cliente, para separar novo de quem voltou
  const primeira = new Map()
  for (const o of vendas) {
    const k = chaveCliente(o)
    const d = new Date(o.created_at)
    if (!primeira.has(k) || d < primeira.get(k)) primeira.set(k, d)
  }

  const resumo = (lista, ini, fim) => {
    const clientes = new Set(lista.map(chaveCliente))
    const novos = [...clientes].filter(k => {
      const d = primeira.get(k)
      return d >= ini && d < new Date(+fim + DIA)
    })
    const faturamento = lista.reduce((s, o) => s + Number(o.total), 0)
    return {
      faturamento,
      liquido: lista.reduce((s, o) => s + liquido(o), 0),
      pedidos: lista.length,
      ticket: lista.length ? faturamento / lista.length : 0,
      clientes: clientes.size,
      novos: novos.length,
      voltaram: clientes.size - novos.length,
      doSite: lista.filter(o => (o.canal || 'site') === 'site').length,
    }
  }

  const porDia = new Map(diasDoPeriodo(p).map(d => [d, { faturamento: 0, pedidos: 0 }]))
  const porCanal = {}
  const porSemana = Array.from({ length: 7 }, () => ({ faturamento: 0, pedidos: 0 }))
  const porHora = Array.from({ length: 24 }, () => 0)
  const porSabor = {}
  const porProduto = {}
  const porBairro = {}
  const porEntrega = { entrega: 0, retirada: 0 }

  for (const o of atual) {
    const d = new Date(o.created_at)
    const dia = porDia.get(iso(d))
    if (dia) { dia.faturamento += Number(o.total); dia.pedidos += 1 }

    const canal = o.canal || 'site'
    porCanal[canal] ??= { faturamento: 0, liquido: 0, pedidos: 0 }
    porCanal[canal].faturamento += Number(o.total)
    porCanal[canal].liquido += liquido(o)
    porCanal[canal].pedidos += 1

    porSemana[d.getDay()].faturamento += Number(o.total)
    porSemana[d.getDay()].pedidos += 1
    porHora[d.getHours()] += 1
    porEntrega[o.delivery_type === 'entrega' ? 'entrega' : 'retirada'] += 1
    if (o.delivery_type === 'entrega' && o.neighborhood) {
      porBairro[o.neighborhood] = (porBairro[o.neighborhood] ?? 0) + 1
    }

    for (const item of o.order_items ?? []) {
      porProduto[item.product_name] ??= { quantidade: 0, valor: 0 }
      porProduto[item.product_name].quantidade += Number(item.quantity) || 0
      porProduto[item.product_name].valor += Number(item.total_price) || 0
      for (const f of item.order_item_flavors ?? []) {
        porSabor[f.flavor_name] = (porSabor[f.flavor_name] ?? 0) + f.quantity * (item.quantity || 1)
      }
    }
  }

  return {
    atual: resumo(atual, p.ini, p.fim),
    anterior: resumo(anterior, p.antIni, p.antFim),
    porDia: [...porDia].map(([data, v]) => ({ data, ...v })),
    porCanal, porSemana, porHora, porSabor, porProduto, porBairro, porEntrega,
    cancelados: pedidos.filter(o => o.status === 'cancelado' && dentro(o, p.ini, p.fim)).length,
    reposicoes: pedidos.filter(o => o.reposicao_de && o.status !== 'cancelado' && dentro(o, p.ini, p.fim)),
  }
}

/**
 * Clientes de todos os tempos: quantas vezes compraram, quanto gastaram, quando foi a última.
 * "Sumido" é quem comprou mais de uma vez e está há mais de 30 dias sem pedir: é o primeiro
 * para quem mandar mensagem.
 */
export function calcularClientes(pedidos) {
  const mapa = new Map()
  for (const o of pedidos.filter(ehVenda)) {
    const k = chaveCliente(o)
    const c = mapa.get(k) ?? { chave: k, nome: o.customer_name, telefone: o.customer_phone, pedidos: 0, total: 0, primeira: null, ultima: null, canais: new Set() }
    c.pedidos += 1
    c.total += Number(o.total)
    const d = new Date(o.created_at)
    if (!c.primeira || d < c.primeira) c.primeira = d
    if (!c.ultima || d > c.ultima) { c.ultima = d; c.nome = o.customer_name; c.telefone = o.customer_phone }
    c.canais.add(o.canal || 'site')
    mapa.set(k, c)
  }
  const agora = Date.now()
  const lista = [...mapa.values()].map(c => ({ ...c, diasSemComprar: Math.floor((agora - c.ultima) / DIA) }))
  return {
    lista,
    total: lista.length,
    recorrentes: lista.filter(c => c.pedidos > 1).length,
    sumidos: lista.filter(c => c.pedidos > 1 && c.diasSemComprar > 30).sort((a, b) => b.total - a.total),
    melhores: [...lista].sort((a, b) => b.total - a.total).slice(0, 15),
  }
}

/** Valor do Analytics: o gasto do Ads vem na moeda da propriedade, que pode não ser real. */
export function formatarMoeda(valor, moeda = 'BRL') {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda || 'BRL' }).format(Number(valor) || 0)
}

export const formatarNumero = (v) => new Intl.NumberFormat('pt-BR').format(Math.round(Number(v) || 0))

export function formatarDuracao(segundos) {
  const s = Math.round(Number(segundos) || 0)
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`
}

/** Nomes do Analytics em português. */
export const CANAIS_GA = {
  Direct: 'Direto (digitou ou link salvo)',
  'Organic Search': 'Google e buscadores (grátis)',
  'Organic Social': 'Redes sociais (Instagram…)',
  'Paid Search': 'Anúncio na busca',
  'Paid Social': 'Anúncio em rede social',
  'Cross-network': 'Anúncio Performance Max',
  Display: 'Anúncio em sites (Display)',
  'Paid Other': 'Outros anúncios',
  'Paid Video': 'Anúncio em vídeo',
  'Organic Video': 'Vídeo (YouTube)',
  'Organic Shopping': 'Google Shopping (grátis)',
  Referral: 'Outros sites',
  Email: 'E-mail',
  'Organic Maps': 'Google Maps',
  Unassigned: 'Não identificado',
}

export const APARELHOS = { mobile: 'Celular', desktop: 'Computador', tablet: 'Tablet', MOBILE: 'Celular', DESKTOP: 'Computador', TABLET: 'Tablet' }

export const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

/** Link do WhatsApp para o número do cliente (Brasil quando vier sem DDI). */
export function linkZap(telefone) {
  const d = (telefone || '').replace(/\D/g, '')
  if (!d) return null
  return `https://wa.me/${d.length <= 11 ? `55${d}` : d}`
}
