import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

/**
 * bling-danfe — devolve o cupom (DANFE NFC-e) de um pedido já autorizado, para o painel imprimir.
 *
 * O cupom é a página que o próprio Bling monta, com QR Code e chave de acesso: é o layout que a
 * Sefaz espera, e refazê-lo aqui seria manter uma cópia que envelhece. O painel não busca direto
 * porque o Bling não libera CORS; esta função busca e repassa o HTML.
 */

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } })

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  // Cupom tem nome, itens e valores do cliente: só o painel lê
  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  })
  const { data: { user } } = await anon.auth.getUser()
  if (!user) return json({ erro: "não autorizado" }, 401)

  let orderId: string | undefined
  try {
    ;({ order_id: orderId } = await req.json())
  } catch {
    return json({ erro: "corpo inválido" }, 400)
  }
  if (!orderId) return json({ erro: "order_id é obrigatório" }, 400)

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )
  const { data: pedido } = await supabase
    .from("orders")
    .select("bling_nfe_status, bling_nfe_danfe")
    .eq("id", orderId)
    .maybeSingle()
  if (!pedido) return json({ erro: "pedido não encontrado" }, 404)
  if (pedido.bling_nfe_status !== "emitida" || !pedido.bling_nfe_danfe) {
    return json({ erro: "este pedido ainda não tem nota autorizada" }, 409)
  }

  // O link vem do Bling e fica gravado no pedido; ainda assim, esta função só busca no Bling
  const url = new URL(pedido.bling_nfe_danfe)
  if (url.protocol !== "https:" || url.hostname !== "www.bling.com.br") {
    return json({ erro: "link do cupom fora do Bling" }, 422)
  }

  const r = await fetch(url)
  if (!r.ok) return json({ erro: `o Bling não entregou o cupom (HTTP ${r.status})` }, 502)
  const html = await r.text()

  return json({ html })
})
