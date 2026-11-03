import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

/**
 * hub-meta — gasto e resultados dos anúncios da Meta para o hub (/hub → Anúncios), por dia e por
 * campanha e por anúncio (com a situação de cada um, para o vigia de criativos), da conta Coxelli.
 *
 * Lê com o token de um usuário do sistema do portfólio Coxita, só com "ver desempenho" na conta
 * de anúncios (segredo META_ADS_TOKEN, permissão ads_read). Nada aqui mexe em campanha. A resposta
 * fica em hub_cache por 30 min, por período; { atualizar: true } ignora o cache.
 */

const CONTA = "act_1089401570359430"
const VERSAO = "v23.0"
const VALIDADE_MS = 30 * 60 * 1000
// conversa iniciada no Zap/Messenger/Direct a partir do anúncio, como o Gerenciador mostra em "Resultados"
const CONVERSA = "onsite_conversion.messaging_conversation_started_7d"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } })

const dataValida = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)

type Linha = {
  date_start: string
  campaign_name?: string
  ad_id?: string
  ad_name?: string
  spend?: string
  impressions?: string
  reach?: string
  actions?: { action_type: string; value: string }[]
}

async function insights(token: string, inicio: string, fim: string, extra: Record<string, string>) {
  const params = new URLSearchParams({
    fields: "campaign_name,ad_id,ad_name,spend,impressions,reach,actions",
    time_range: JSON.stringify({ since: inicio, until: fim }),
    limit: "500",
    access_token: token,
    ...extra,
  })
  const saida: Linha[] = []
  let url: string | null = `https://graph.facebook.com/${VERSAO}/${CONTA}/insights?${params}`
  while (url) {
    const r = await fetch(url)
    const d = await r.json()
    if (d.error) throw new Error(`Meta: ${d.error.message}`)
    saida.push(...(d.data ?? []))
    url = d.paging?.next ?? null
  }
  return saida.map((l) => ({
    data: l.date_start,
    campanha: l.campaign_name ?? null,
    anuncio_id: l.ad_id ?? null,
    anuncio: l.ad_name ?? null,
    gasto: Number(l.spend ?? 0),
    impressoes: Number(l.impressions ?? 0),
    alcance: Number(l.reach ?? 0),
    conversas: Number(l.actions?.find((a) => a.action_type === CONVERSA)?.value ?? 0),
  }))
}

// situação de cada anúncio (ativo, pausado, em análise), para o vigia julgar só os que estão no ar
async function situacoes(token: string) {
  const params = new URLSearchParams({ fields: "id,name,effective_status,created_time", limit: "200", access_token: token })
  const r = await fetch(`https://graph.facebook.com/${VERSAO}/${CONTA}/ads?${params}`)
  const d = await r.json()
  if (d.error) throw new Error(`Meta: ${d.error.message}`)
  return (d.data ?? []).map((a: Record<string, string>) => ({
    anuncio_id: a.id, anuncio: a.name, situacao: a.effective_status, criado_em: a.created_time,
  }))
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  // gasto de anúncio é da loja: só o painel lê
  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  })
  const { data: { user } } = await anon.auth.getUser()
  if (!user) return json({ erro: "não autorizado" }, 401)

  const token = Deno.env.get("META_ADS_TOKEN")
  if (!token) return json({ erro: "Falta ligar a Meta: o token de leitura (META_ADS_TOKEN) ainda não foi gravado." }, 503)

  let corpo: Record<string, unknown>
  try {
    corpo = await req.json()
  } catch {
    return json({ erro: "corpo inválido" }, 400)
  }
  const { inicio, fim, atualizar } = corpo as Record<string, string>
  if (![inicio, fim].every(dataValida)) return json({ erro: "inicio e fim no formato AAAA-MM-DD" }, 400)

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  const chave = `meta:${inicio}:${fim}`
  if (!atualizar) {
    const { data: guardado } = await supabase.from("hub_cache").select("dados, criado_em").eq("chave", chave).maybeSingle()
    if (guardado && Date.now() - new Date(guardado.criado_em).getTime() < VALIDADE_MS) {
      return json({ ...guardado.dados, atualizadoEm: guardado.criado_em })
    }
  }

  try {
    const [porDia, campanhas, porAnuncio, ads] = await Promise.all([
      insights(token, inicio, fim, { level: "account", time_increment: "1" }),
      insights(token, inicio, fim, { level: "campaign" }),
      insights(token, inicio, fim, { level: "ad" }),
      situacoes(token),
    ])
    // todo anúncio da conta, mesmo sem gasto no período (acabou de entrar no ar)
    const numeros = new Map(porAnuncio.map((a) => [a.anuncio_id, a]))
    const anuncios = ads.map((a: Record<string, string>) => ({
      ...a,
      gasto: numeros.get(a.anuncio_id)?.gasto ?? 0,
      impressoes: numeros.get(a.anuncio_id)?.impressoes ?? 0,
      conversas: numeros.get(a.anuncio_id)?.conversas ?? 0,
    }))
    const dados = { porDia, campanhas, anuncios }
    const criado_em = new Date().toISOString()
    await supabase.from("hub_cache").upsert({ chave, dados, criado_em })
    return json({ ...dados, atualizadoEm: criado_em })
  } catch (e) {
    return json({ erro: (e as Error).message }, 502)
  }
})
