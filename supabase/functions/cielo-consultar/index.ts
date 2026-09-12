import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

/**
 * cielo-consultar — pergunta à Cielo o status atual de um pedido e atualiza o banco.
 *
 * A tela do Pix chama isto de tempos em tempos enquanto o cliente paga. Existe além do webhook
 * porque os dois falham de formas diferentes: o webhook depende de estar cadastrado no portal
 * da Cielo e de a notificação chegar; a consulta funciona mesmo sem nada disso. Com os dois, o
 * pedido dá baixa pelo que acontecer primeiro.
 */

const MERCHANT_ID = Deno.env.get("CIELO_MERCHANT_ID")!
const MERCHANT_KEY = Deno.env.get("CIELO_MERCHANT_KEY")!
const AMBIENTE = Deno.env.get("CIELO_AMBIENTE") ?? "sandbox"

const API_CONSULTA = AMBIENTE === "producao"
  ? "https://apiquery.cieloecommerce.cielo.com.br"
  : "https://apiquerysandbox.cieloecommerce.cielo.com.br"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } })

function traduzir(status: number): string {
  switch (status) {
    case 1: case 0: case 12: case 20: return "aguardando"
    case 2: return "pago"
    case 3: case 13: return "recusado"
    case 10: case 11: return "estornado"
    default: return "aguardando"
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  try {
    const { order_id } = await req.json()
    if (!order_id) return json({ erro: "order_id é obrigatório" }, 400)

    const { data: pedido } = await supabase
      .from("orders")
      .select("id, cielo_payment_id, payment_status")
      .eq("id", order_id)
      .maybeSingle()

    if (!pedido) return json({ erro: "pedido não encontrado" }, 404)
    // já resolvido: não gasta chamada na Cielo à toa
    if (pedido.payment_status === "pago") return json({ payment_status: "pago" })
    if (!pedido.cielo_payment_id) return json({ payment_status: pedido.payment_status })

    const r = await fetch(`${API_CONSULTA}/1/sales/${pedido.cielo_payment_id}`, {
      headers: { MerchantId: MERCHANT_ID, MerchantKey: MERCHANT_KEY, "Content-Type": "application/json" },
    })
    if (!r.ok) return json({ payment_status: pedido.payment_status })

    const venda = await r.json()
    const pag = venda?.Payment ?? {}
    const situacao = traduzir(pag.Status)

    if (situacao !== pedido.payment_status) {
      const limpo = { ...venda }
      if (limpo.Payment?.CreditCard) delete limpo.Payment.CreditCard

      await supabase.from("payment_events").insert({
        order_id: pedido.id,
        cielo_payment_id: pedido.cielo_payment_id,
        tipo: "consulta",
        metodo: pag.Type ?? null,
        cielo_status: pag.Status ?? null,
        status_texto: situacao,
        return_code: pag.ReturnCode ?? null,
        return_message: pag.ReturnMessage ?? null,
        amount_centavos: pag.Amount ?? null,
        payload: limpo,
      })

      await supabase.from("orders").update({
        payment_status: situacao,
        paid_at: situacao === "pago" ? new Date().toISOString() : null,
      }).eq("id", pedido.id)
    }

    return json({ payment_status: situacao })
  } catch (e) {
    console.error("cielo-consultar falhou:", e instanceof Error ? e.message : e)
    return json({ erro: "falha ao consultar pagamento" }, 500)
  }
})
