import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

/**
 * bling-oauth — troca o código de autorização por um token, e renova o token quando vence.
 *
 * Roda no servidor porque a troca exige o Client Secret. O access_token do Bling dura pouco
 * (horas) e vem com um refresh_token de vida longa: guardamos os dois e renovamos sozinhos,
 * senão a integração pararia de emitir nota no meio de um expediente e ninguém entenderia por
 * quê.
 *
 * Exige login: conectar o ERP da loja é operação de dono.
 */

const CLIENT_ID = Deno.env.get("BLING_CLIENT_ID")!
const CLIENT_SECRET = Deno.env.get("BLING_CLIENT_SECRET")!
// O Bling bloqueia requisições de API em www.bling.com.br e exige api.bling.com.br. A troca do
// código chegou a funcionar no www, mas a renovação passaria a falhar sem aviso — e o token
// vence em horas, então isso quebraria a emissão de nota no meio de um expediente.
const TOKEN_URL = "https://api.bling.com.br/Api/v3/oauth/token"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } })

/** O Bling pede as credenciais em Basic auth, não no corpo. */
function basicAuth(): string {
  return "Basic " + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)
}

async function guardarToken(supabase: any, dados: any) {
  const expiraEm = new Date(Date.now() + (Number(dados.expires_in ?? 21600) - 60) * 1000)
  // 60s de folga: token que vence no meio de uma chamada falha a emissão da nota
  const { error } = await supabase.from("integracao_bling").upsert({
    id: 1,
    access_token: dados.access_token,
    refresh_token: dados.refresh_token,
    expira_em: expiraEm.toISOString(),
    atualizado_em: new Date().toISOString(),
  })
  if (error) throw error
  return expiraEm
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  try {
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    })
    const { data: { user } } = await anon.auth.getUser()
    if (!user) return json({ erro: "não autorizado" }, 401)

    const { acao, code } = await req.json()

    if (acao === "conectar") {
      if (!code) return json({ erro: "code é obrigatório" }, 400)
      const r = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
          Authorization: basicAuth(),
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({ grant_type: "authorization_code", code }),
      })
      const dados = await r.json()
      if (!r.ok || !dados.access_token) {
        return json({ erro: dados?.error?.description ?? "o Bling recusou o código", detalhe: dados }, 422)
      }
      const expira = await guardarToken(supabase, dados)
      return json({ ok: true, expira_em: expira })
    }

    if (acao === "renovar") {
      const { data: atual } = await supabase.from("integracao_bling").select("refresh_token").eq("id", 1).maybeSingle()
      if (!atual?.refresh_token) return json({ erro: "nunca foi conectado ao Bling" }, 409)

      const r = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
          Authorization: basicAuth(),
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: atual.refresh_token }),
      })
      const dados = await r.json()
      if (!r.ok || !dados.access_token) {
        return json({ erro: "não foi possível renovar; refaça a conexão", detalhe: dados }, 422)
      }
      const expira = await guardarToken(supabase, dados)
      return json({ ok: true, expira_em: expira })
    }

    if (acao === "status") {
      const { data } = await supabase.from("integracao_bling").select("expira_em, atualizado_em").eq("id", 1).maybeSingle()
      return json({
        conectado: !!data,
        expira_em: data?.expira_em ?? null,
        vencido: data ? new Date(data.expira_em) < new Date() : null,
      })
    }

    return json({ erro: "ação inválida" }, 400)
  } catch (e) {
    console.error("bling-oauth falhou:", e instanceof Error ? e.message : e)
    return json({ erro: "falha na conexão com o Bling" }, 500)
  }
})
