import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

/**
 * cielo-webhook — recebe o aviso da Cielo quando o status de uma transação muda.
 *
 * É o que faz o Pix dar baixa sozinho. O cliente paga no app do banco dele, a Cielo avisa aqui,
 * e o pedido vira "pago" sem ninguém conferir extrato.
 *
 * O POST da Cielo traz só { PaymentId, ChangeType } — NÃO traz o status nem o valor. Por isso
 * consultamos a Cielo de volta antes de gravar qualquer coisa: aceitar um "está pago" que veio
 * no corpo da requisição deixaria qualquer um marcar pedido como pago mandando um POST.
 */

const MERCHANT_ID = Deno.env.get("CIELO_MERCHANT_ID")!
const MERCHANT_KEY = Deno.env.get("CIELO_MERCHANT_KEY")!
const AMBIENTE = Deno.env.get("CIELO_AMBIENTE") ?? "sandbox"

const API_CONSULTA = AMBIENTE === "producao"
  ? "https://apiquery.cieloecommerce.cielo.com.br"
  : "https://apiquerysandbox.cieloecommerce.cielo.com.br"

/** Códigos de status da Cielo → o vocabulário do nosso banco. */
function traduzir(status: number): string {
  switch (status) {
    case 1: return "aguardando"   // autorizada, ainda não capturada
    case 2: return "pago"         // capturada
    case 12: return "aguardando"  // pix gerado, esperando o pagador
    case 0: return "aguardando"   // não finalizada
    case 20: return "aguardando"  // agendada
    case 3: return "recusado"     // negada
    case 13: return "recusado"    // abortada
    case 10: return "estornado"   // cancelada (void)
    case 11: return "estornado"   // devolvida (refund)
    // status desconhecido não vira "pago" nem "recusado": fica aguardando e alguém olha
    default: return "aguardando"
  }
}

Deno.serve(async (req) => {
  // Portais de webhook (o da Cielo inclusive) costumam checar a URL com um GET antes de aceitar
  // o cadastro, e quem abre o endereço no navegador também cai aqui. Responder 405 fazia o
  // cadastro ser recusado e passava a impressão de que o endereço estava errado.
  if (req.method === "GET" || req.method === "HEAD") {
    return new Response("cielo-webhook ativo", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }
  if (req.method !== "POST") return new Response("método não permitido", { status: 405 })

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  try {
    const aviso = await req.json()
    const paymentId = aviso?.PaymentId
    // 200 mesmo sem PaymentId: erro aqui faria a Cielo reenviar em loop, e um POST de teste
    // com corpo vazio (validação de cadastro) seria lido como endpoint quebrado.
    if (!paymentId) return new Response("ok", { status: 200 })

    // fonte da verdade é a Cielo, não o corpo do POST
    const r = await fetch(`${API_CONSULTA}/1/sales/${paymentId}`, {
      headers: {
        MerchantId: MERCHANT_ID,
        MerchantKey: MERCHANT_KEY,
        "Content-Type": "application/json",
      },
    })
    if (!r.ok) {
      console.error("consulta à Cielo falhou:", r.status)
      // 200 mesmo assim: a Cielo reenvia em caso de erro, e não queremos loop de retry
      return new Response("ok", { status: 200 })
    }

    const venda = await r.json()
    const pag = venda?.Payment ?? {}
    const status: number = pag.Status
    const situacao = traduzir(status)

    const paraGuardar = { ...venda }
    if (paraGuardar.Payment?.CreditCard) delete paraGuardar.Payment.CreditCard

    const { data: pedido } = await supabase
      .from("orders")
      .select("id, payment_status")
      .eq("cielo_payment_id", paymentId)
      .maybeSingle()

    await supabase.from("payment_events").insert({
      order_id: pedido?.id ?? null,
      cielo_payment_id: paymentId,
      tipo: "webhook",
      metodo: pag.Type ?? null,
      cielo_status: status ?? null,
      status_texto: situacao,
      return_code: pag.ReturnCode ?? null,
      return_message: pag.ReturnMessage ?? null,
      amount_centavos: pag.Amount ?? null,
      payload: paraGuardar,
    })

    // um pedido já pago não volta atrás por um aviso atrasado fora de ordem
    if (pedido && pedido.payment_status !== "pago") {
      await supabase
        .from("orders")
        .update({
          payment_status: situacao,
          paid_at: situacao === "pago" ? new Date().toISOString() : null,
        })
        .eq("id", pedido.id)
    }

    return new Response("ok", { status: 200 })
  } catch (e) {
    console.error("cielo-webhook falhou:", e instanceof Error ? e.message : e)
    return new Response("ok", { status: 200 })
  }
})
