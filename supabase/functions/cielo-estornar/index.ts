import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

/**
 * cielo-estornar — devolve dinheiro ao cliente, total ou parcialmente.
 *
 * `PUT /1/sales/{PaymentId}/void` estorna tudo; com `?amount=` em centavos, só a diferença.
 *
 * A regra que manda aqui é: pedido que SAIU PARA ENTREGA ou foi ENTREGUE não é estornado. A
 * comida já está com o cliente, e no Pix o dinheiro volta na hora, sem chance de rever. Isso é
 * checado aqui E por um trigger no banco — a função pode ter bug, o trigger não deixa passar.
 *
 * Exige login: estorno é operação de dono de loja, nunca do site público.
 */

const MERCHANT_ID = Deno.env.get("CIELO_MERCHANT_ID")!
const MERCHANT_KEY = Deno.env.get("CIELO_MERCHANT_KEY")!
const AMBIENTE = Deno.env.get("CIELO_AMBIENTE") ?? "sandbox"

const API = AMBIENTE === "producao"
  ? "https://api.cieloecommerce.cielo.com.br"
  : "https://apisandbox.cieloecommerce.cielo.com.br"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } })

/** Status em que a comida já está com o cliente: dinheiro não volta. */
const ENTREGUE_OU_A_CAMINHO = ["saiu_entrega", "entregue"]

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  const authHeader = req.headers.get("Authorization") ?? ""
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  try {
    // só quem está logado no painel estorna
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await anon.auth.getUser()
    if (!user) return json({ erro: "não autorizado" }, 401)

    const { order_id, valor_centavos } = await req.json()
    if (!order_id) return json({ erro: "order_id é obrigatório" }, 400)

    const { data: pedido } = await supabase
      .from("orders")
      .select("id, order_number, status, payment_status, cielo_payment_id, total")
      .eq("id", order_id)
      .maybeSingle()

    if (!pedido) return json({ erro: "pedido não encontrado" }, 404)
    if (!pedido.cielo_payment_id) return json({ erro: "este pedido não foi pago pela Cielo" }, 422)
    if (pedido.payment_status !== "pago") return json({ erro: "pedido não está pago" }, 422)

    if (ENTREGUE_OU_A_CAMINHO.includes(pedido.status)) {
      return json({
        erro: `Pedido #${pedido.order_number} já saiu para entrega. O estorno está bloqueado para não devolver dinheiro de pedido entregue.`,
      }, 409)
    }

    // parcial só faz sentido abaixo do total pago
    const totalCentavos = Math.round(Number(pedido.total) * 100)
    const parcial = Number.isFinite(valor_centavos) && valor_centavos > 0 && valor_centavos < totalCentavos
    const url = parcial
      ? `${API}/1/sales/${pedido.cielo_payment_id}/void?amount=${Math.round(valor_centavos)}`
      : `${API}/1/sales/${pedido.cielo_payment_id}/void`

    const r = await fetch(url, {
      method: "PUT",
      headers: { MerchantId: MERCHANT_ID, MerchantKey: MERCHANT_KEY, "Content-Type": "application/json" },
    })
    const dados = await r.json().catch(() => ({}))
    const status: number = dados?.Status
    // 10 = cancelada no mesmo dia · 11 = devolvida depois da captura
    const deuCerto = r.ok && (status === 10 || status === 11)

    await supabase.from("payment_events").insert({
      order_id: pedido.id,
      cielo_payment_id: pedido.cielo_payment_id,
      tipo: parcial ? "estorno_parcial" : "estorno",
      cielo_status: status ?? null,
      status_texto: deuCerto ? "estornado" : "falha_estorno",
      return_code: dados?.ReturnCode ?? null,
      return_message: dados?.ReturnMessage ?? null,
      amount_centavos: parcial ? Math.round(valor_centavos) : totalCentavos,
      payload: dados,
    })

    // no parcial o pedido continua pago: só uma parte voltou
    if (deuCerto && !parcial) {
      await supabase.from("orders").update({ payment_status: "estornado" }).eq("id", pedido.id)
    }

    if (!deuCerto) {
      return json({ ok: false, erro: dados?.ReturnMessage || "a Cielo recusou o estorno", status }, 422)
    }

    return json({
      ok: true,
      parcial,
      valor_estornado: parcial ? Math.round(valor_centavos) : totalCentavos,
      mensagem: dados?.ReturnMessage,
    })
  } catch (e) {
    console.error("cielo-estornar falhou:", e instanceof Error ? e.message : e)
    return json({ erro: "falha ao processar estorno" }, 500)
  }
})
