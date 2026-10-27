import { createClient } from "npm:@supabase/supabase-js@2"

/**
 * custo-fixo — rateia as despesas fixas da loja por unidade vendida (tela de Margens).
 *
 * Lê o bloco "Despesas fixas" (colunas M–N) das abas "<Mês> - <ano>" da planilha "Insumos e
 * despesas fixas" (settings.planilha_itens_id) e entrega ao banco, que divide pelas unidades
 * vendidas e grava em pricing_params.fixed_cost_per_unit (função aplicar_custo_fixo, em
 * supabase/sql/custo-fixo-rateado.sql).
 *
 * Média dos DOIS meses fechados anteriores: o gás vem a cada dois meses (R$ 960 em setembro, nada
 * em outubro) e um mês só faria o custo pular de um mês para o outro.
 *
 * Quem chama: o pg_cron todo dia 1 (cabeçalho x-emissao-interna com o segredo do vault, o mesmo
 * das notas da noite) ou o painel logado.
 *
 * O login do robô do Google repete o da cupom-ler de propósito: aquela função está em produção
 * lendo cupom e não vale um deploy dela só para mover o código.
 */

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-emissao-interna",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } })

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]

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
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
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

/** Valor da célula como número: a API devolve o valor sem formatação (UNFORMATTED_VALUE). */
const numero = (v: unknown) =>
  (typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."))) || 0

/** Despesas fixas de uma aba: [{ nome, valor }] e o total. Aba que não existe devolve null. */
async function despesasDoMes(token: string, planilhaId: string, aba: string) {
  const faixa = encodeURIComponent(`'${aba}'!M4:N60`)
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${planilhaId}/values/${faixa}?valueRenderOption=UNFORMATTED_VALUE`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) },
  )
  const d = await r.json().catch(() => ({}))
  if (r.status === 400 && /Unable to parse range/i.test(d?.error?.message ?? "")) return null
  if (!r.ok) throw new Error(`Planilha: ${d?.error?.message ?? r.status}`)
  const itens = (d.values ?? [])
    .map((l: unknown[]) => ({ nome: String(l[0] ?? "").trim(), valor: numero(l[1]) }))
    // "Tarifa bancária 0,0538" e "Impostos 0,04" são percentuais, não reais: já entram na conta
    // da margem pelas taxas e pelo imposto de pricing_params. Abaixo de R$ 1 fica de fora.
    .filter((i: { nome: string; valor: number }) => i.nome && i.valor >= 1)
  return { aba, itens, total: itens.reduce((s: number, i: { valor: number }) => s + i.valor, 0) }
}

/** Os dois meses fechados antes de `hoje`, no fuso de Natal: em 01/11 são setembro e outubro. */
function mesesFechados(hoje = new Date()) {
  const f = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Fortaleza", month: "numeric", year: "numeric" })
  const p = Object.fromEntries(f.formatToParts(hoje).map((x) => [x.type, x.value]))
  let mes = Number(p.month)
  let ano = Number(p.year)
  const lista = []
  for (let k = 0; k < 2; k++) {
    mes -= 1
    if (mes === 0) { mes = 12; ano -= 1 }
    lista.unshift({ mes, ano, aba: `${MESES[mes - 1]} - ${ano}` })
  }
  return lista
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ erro: "método" }, 405)

  const url = Deno.env.get("SUPABASE_URL")!
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

  const segredo = Deno.env.get("EMISSAO_INTERNA_SEGREDO")
  const chamadaDoBanco = !!segredo && req.headers.get("x-emissao-interna") === segredo
  if (!chamadaDoBanco) {
    const comoUsuario = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } })
    const { data: { user } } = await comoUsuario.auth.getUser()
    if (!user) return json({ erro: "Faça login no painel de novo." }, 401)
  }

  const db = createClient(url, service)
  try {
    const { data: conf } = await db.from("settings").select("value").eq("key", "planilha_itens_id").maybeSingle()
    if (!conf?.value) throw new Error("Falta settings.planilha_itens_id.")

    // { simular: true, hoje: "2026-11-01" } só lê e devolve a conta, sem gravar: para conferir.
    const corpo = await req.json().catch(() => ({}))
    const token = await tokenDoGoogle()
    const meses = mesesFechados(corpo.simular && corpo.hoje ? new Date(`${corpo.hoje}T12:00:00-03:00`) : new Date())
    const lidos = []
    for (const m of meses) {
      const d = await despesasDoMes(token, conf.value, m.aba)
      if (d) lidos.push(d)
    }
    if (!lidos.length) throw new Error(`Não achei as abas ${meses.map((m) => m.aba).join(" e ")} na planilha.`)

    const media = lidos.reduce((s, d) => s + d.total, 0) / lidos.length
    if (corpo.simular) return json({ ok: true, simulado: true, despesas_mes: media, meses: lidos })
    const { data, error } = await db.rpc("aplicar_custo_fixo", {
      p_despesas_mes: Number(media.toFixed(2)),
      p_detalhe: { meses: lidos },
    })
    if (error) throw error
    return json({ ok: true, despesas_mes: media, resultado: data })
  } catch (e) {
    console.error(e)
    return json({ erro: (e as Error).message }, 500)
  }
})
