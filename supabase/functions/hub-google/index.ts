import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

/**
 * hub-google — números do Google para o hub (/hub): Analytics (visitas, origem, funil, páginas,
 * gasto do Ads, que chega pelo vínculo Analytics ↔ Ads) e Search Console (o que pesquisaram).
 *
 * Lê com uma conta de serviço só de leitura (hub-leitura@coxelli-hub, chave no segredo
 * GOOGLE_HUB_SA): Leitor na propriedade GA4 e "Restrita" no Search Console. A resposta fica em
 * hub_cache por 3 h, por período; { atualizar: true } ignora o cache.
 */

const PROPRIEDADE_GA = "557173691"
const SITE_SC = "https://coxelli.com.br/"
const VALIDADE_MS = 3 * 60 * 60 * 1000

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } })

const b64url = (dados: ArrayBuffer | string) => {
  const bytes = typeof dados === "string" ? new TextEncoder().encode(dados) : new Uint8Array(dados)
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function tokenDoGoogle(): Promise<string> {
  const sa = JSON.parse(Deno.env.get("GOOGLE_HUB_SA")!)
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s/g, "")
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
  const chave = await crypto.subtle.importKey(
    "pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  )
  const agora = Math.floor(Date.now() / 1000)
  const corpo = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." + b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: agora,
    exp: agora + 3600,
  }))
  const assinatura = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", chave, new TextEncoder().encode(corpo))
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${corpo}.${b64url(assinatura)}`,
  })
  const d = await r.json()
  if (!d.access_token) throw new Error(`Google recusou o login do robô: ${JSON.stringify(d)}`)
  return d.access_token
}

type Relatorio = {
  dimensions?: string[]
  metrics: string[]
  anterior?: boolean
  limite?: number
  ordem?: string
  eventos?: string[]
}

/** Linhas do GA4 como objetos: { dimensão: valor, métrica: número, periodo?: 0|1 }. */
function linhas(resp: any, r: Relatorio) {
  const dims = r.dimensions ?? []
  return (resp.rows ?? []).map((row: any) => {
    const o: Record<string, string | number> = {}
    dims.forEach((d, i) => { o[d] = row.dimensionValues[i].value })
    // com dois períodos o GA4 acrescenta a dimensão dateRange no fim
    if (r.anterior) o.periodo = row.dimensionValues[dims.length]?.value === "date_range_1" ? 1 : 0
    r.metrics.forEach((m, i) => { o[m] = Number(row.metricValues[i].value) })
    return o
  })
}

async function analytics(token: string, periodo: { inicio: string; fim: string; antInicio: string; antFim: string }) {
  const relatorios: Record<string, Relatorio> = {
    porDia: { dimensions: ["date"], metrics: ["sessions", "activeUsers", "newUsers", "keyEvents"] },
    totais: { metrics: ["sessions", "activeUsers", "newUsers", "engagementRate", "averageSessionDuration", "screenPageViews"], anterior: true },
    canais: { dimensions: ["sessionDefaultChannelGroup"], metrics: ["sessions", "activeUsers", "keyEvents"], ordem: "sessions" },
    origens: { dimensions: ["sessionSource", "sessionMedium"], metrics: ["sessions", "keyEvents"], ordem: "sessions", limite: 15 },
    funil: {
      dimensions: ["eventName"], metrics: ["eventCount", "totalUsers"], anterior: true,
      eventos: ["session_start", "add_to_cart", "begin_checkout", "purchase", "generate_lead"],
    },
    paginas: { dimensions: ["pagePath"], metrics: ["screenPageViews", "activeUsers"], ordem: "screenPageViews", limite: 20 },
    entrada: { dimensions: ["landingPage"], metrics: ["sessions", "keyEvents"], ordem: "sessions", limite: 15 },
    aparelhos: { dimensions: ["deviceCategory"], metrics: ["sessions"], ordem: "sessions" },
    cidades: { dimensions: ["city"], metrics: ["activeUsers"], ordem: "activeUsers", limite: 10 },
    campanhas: {
      dimensions: ["sessionGoogleAdsCampaignName"],
      metrics: ["advertiserAdCost", "advertiserAdClicks", "advertiserAdImpressions", "sessions", "keyEvents"],
      ordem: "advertiserAdCost",
    },
    // o GA4 só aceita custo do Ads junto com a campanha: o front soma as campanhas de cada dia
    anunciosPorDia: {
      dimensions: ["date", "sessionGoogleAdsCampaignName"],
      metrics: ["advertiserAdCost", "advertiserAdClicks", "advertiserAdImpressions"],
    },
    horas: { dimensions: ["hour"], metrics: ["sessions"] },
  }

  const pedido = (r: Relatorio) => ({
    dateRanges: [
      { startDate: periodo.inicio, endDate: periodo.fim },
      ...(r.anterior ? [{ startDate: periodo.antInicio, endDate: periodo.antFim }] : []),
    ],
    dimensions: (r.dimensions ?? []).map((name) => ({ name })),
    metrics: r.metrics.map((name) => ({ name })),
    ...(r.limite ? { limit: r.limite } : {}),
    ...(r.ordem ? { orderBys: [{ metric: { metricName: r.ordem }, desc: true }] } : {}),
    ...(r.eventos ? { dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: r.eventos } } } } : {}),
  })

  const nomes = Object.keys(relatorios)
  const saida: Record<string, unknown> = {}
  let moeda = "BRL"
  // o batchRunReports aceita até 5 relatórios por chamada
  for (let i = 0; i < nomes.length; i += 5) {
    const grupo = nomes.slice(i, i + 5)
    const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PROPRIEDADE_GA}:batchRunReports`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ requests: grupo.map((n) => pedido(relatorios[n])) }),
    })
    const d = await r.json()
    if (!r.ok) throw new Error(`Analytics: ${d.error?.message ?? r.status}`)
    d.reports.forEach((rep: any, j: number) => {
      saida[grupo[j]] = linhas(rep, relatorios[grupo[j]])
      if (rep.metadata?.currencyCode) moeda = rep.metadata.currencyCode
    })
  }
  return { ...saida, moeda }
}

async function searchConsole(token: string, periodo: { inicio: string; fim: string; antInicio: string; antFim: string }) {
  const consulta = async (corpo: Record<string, unknown>) => {
    const r = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_SC)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ startDate: periodo.inicio, endDate: periodo.fim, ...corpo }),
      },
    )
    const d = await r.json()
    if (!r.ok) throw new Error(`Search Console: ${d.error?.message ?? r.status}`)
    return (d.rows ?? []).map((row: any) => ({
      chave: row.keys?.join(" · ") ?? "",
      cliques: row.clicks,
      aparicoes: row.impressions,
      ctr: row.ctr,
      posicao: row.position,
    }))
  }
  const [porDia, totais, totaisAnt, consultas, paginas, aparelhos] = await Promise.all([
    consulta({ dimensions: ["date"] }),
    consulta({}),
    consulta({ startDate: periodo.antInicio, endDate: periodo.antFim }),
    consulta({ dimensions: ["query"], rowLimit: 30 }),
    consulta({ dimensions: ["page"], rowLimit: 20 }),
    consulta({ dimensions: ["device"] }),
  ])
  return { porDia, total: totais[0] ?? null, totalAnterior: totaisAnt[0] ?? null, consultas, paginas, aparelhos }
}

const dataValida = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  // dados de visita e de anúncio são da loja: só o painel lê
  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  })
  const { data: { user } } = await anon.auth.getUser()
  if (!user) return json({ erro: "não autorizado" }, 401)

  let corpo: Record<string, unknown>
  try {
    corpo = await req.json()
  } catch {
    return json({ erro: "corpo inválido" }, 400)
  }
  const { inicio, fim, antInicio, antFim, atualizar } = corpo as Record<string, string>
  if (![inicio, fim, antInicio, antFim].every(dataValida)) {
    return json({ erro: "inicio, fim, antInicio e antFim no formato AAAA-MM-DD" }, 400)
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  const chave = `google:${inicio}:${fim}:${antInicio}:${antFim}`

  if (!atualizar) {
    const { data: guardado } = await supabase.from("hub_cache").select("dados, criado_em").eq("chave", chave).maybeSingle()
    if (guardado && Date.now() - new Date(guardado.criado_em).getTime() < VALIDADE_MS) {
      return json({ ...guardado.dados, atualizadoEm: guardado.criado_em })
    }
  }

  try {
    const token = await tokenDoGoogle()
    const periodo = { inicio, fim, antInicio, antFim }
    // uma fonte com problema não derruba a outra
    const [ga, sc] = await Promise.allSettled([analytics(token, periodo), searchConsole(token, periodo)])
    const dados = {
      analytics: ga.status === "fulfilled" ? ga.value : null,
      busca: sc.status === "fulfilled" ? sc.value : null,
      erros: [ga, sc].filter((x) => x.status === "rejected").map((x) => String((x as PromiseRejectedResult).reason?.message ?? x)),
    }
    const criado_em = new Date().toISOString()
    if (!dados.erros.length) {
      await supabase.from("hub_cache").upsert({ chave, dados, criado_em })
      // período velho não volta a ser pedido igual: limpa o que passou de 2 dias
      await supabase.from("hub_cache").delete().lt("criado_em", new Date(Date.now() - 2 * 86400000).toISOString())
    }
    return json({ ...dados, atualizadoEm: criado_em })
  } catch (e) {
    return json({ erro: (e as Error).message }, 502)
  }
})
