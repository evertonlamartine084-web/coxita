import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

/**
 * cielo-pagar — cria a cobrança na Cielo (cartão ou Pix) para um pedido já gravado.
 *
 * Roda no servidor porque a MerchantKey é segredo: o frontend é Vite, e tudo que entra no
 * bundle é público. O cliente manda só o id do pedido e os dados do cartão; o VALOR nunca vem
 * do navegador — é lido do banco. Aceitar o valor do cliente deixaria qualquer um pagar R$ 0,01
 * num pedido de R$ 200 mexendo no devtools.
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })

/** Só os 4 últimos dígitos podem ser retidos; o resto não entra em banco nem em log. */
const last4 = (n: string) => (n || "").replace(/\D/g, "").slice(-4)

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  try {
    const { order_id, metodo, cartao, parcelas } = await req.json()
    if (!order_id) return json({ erro: "order_id é obrigatório" }, 400)
    if (metodo !== "pix" && metodo !== "cartao") return json({ erro: "metodo inválido" }, 400)

    // valor e dados vêm do BANCO, não do cliente
    const { data: pedido, error: erroPedido } = await supabase
      .from("orders")
      .select("id, order_number, total, customer_name, customer_phone, payment_status")
      .eq("id", order_id)
      .single()

    if (erroPedido || !pedido) return json({ erro: "pedido não encontrado" }, 404)
    if (pedido.payment_status === "pago") return json({ erro: "pedido já está pago" }, 409)

    // a Cielo trabalha em centavos, inteiro
    const centavos = Math.round(Number(pedido.total) * 100)
    if (!Number.isFinite(centavos) || centavos <= 0) return json({ erro: "valor inválido" }, 422)

    const corpo: Record<string, unknown> = {
      MerchantOrderId: String(pedido.order_number),
      Customer: { Name: pedido.customer_name || "Cliente" },
    }

    if (metodo === "pix") {
      corpo.Payment = { Type: "Pix", Amount: centavos }
    } else {
      if (!cartao?.numero || !cartao?.validade || !cartao?.cvv) {
        return json({ erro: "dados do cartão incompletos" }, 400)
      }
      corpo.Payment = {
        Type: "CreditCard",
        Amount: centavos,
        Installments: Math.max(1, Number(parcelas) || 1),
        Capture: true, // captura junto com a autorização: pedido de comida não espera revisão
        SoftDescriptor: "COXELLI",
        CreditCard: {
          CardNumber: String(cartao.numero).replace(/\D/g, ""),
          Holder: cartao.titular,
          ExpirationDate: cartao.validade, // MM/AAAA
          SecurityCode: cartao.cvv,
          Brand: cartao.bandeira || "Visa",
        },
      }
    }

    const resposta = await fetch(`${API}/1/sales/`, {
      method: "POST",
      headers: {
        MerchantId: MERCHANT_ID,
        MerchantKey: MERCHANT_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(corpo),
    })

    const dados = await resposta.json()
    const pag = dados?.Payment ?? {}
    const status: number = pag.Status

    // 1 autorizado · 2 pago/capturado · 12 pix aguardando
    const pago = status === 2
    const aguardando = status === 12 || status === 1

    // guarda a resposta SEM o bloco de cartão — nunca persistir PAN, CVV ou portador
    const paraGuardar = { ...dados }
    if (paraGuardar.Payment?.CreditCard) delete paraGuardar.Payment.CreditCard

    await supabase.from("payment_events").insert({
      order_id: pedido.id,
      cielo_payment_id: pag.PaymentId ?? null,
      tipo: "criacao",
      metodo: metodo === "pix" ? "Pix" : "CreditCard",
      cielo_status: status ?? null,
      status_texto: pago ? "pago" : aguardando ? "aguardando" : "recusado",
      return_code: pag.ReturnCode ?? null,
      return_message: pag.ReturnMessage ?? null,
      amount_centavos: centavos,
      card_last4: metodo === "cartao" ? last4(cartao.numero) : null,
      card_brand: metodo === "cartao" ? (cartao.bandeira ?? null) : null,
      payload: paraGuardar,
    })

    await supabase
      .from("orders")
      .update({
        cielo_payment_id: pag.PaymentId ?? null,
        payment_status: pago ? "pago" : aguardando ? "aguardando" : "recusado",
        paid_at: pago ? new Date().toISOString() : null,
      })
      .eq("id", pedido.id)

    if (metodo === "pix") {
      return json({
        ok: aguardando,
        payment_id: pag.PaymentId,
        qr_base64: pag.QrCodeBase64Image ?? null,
        qr_texto: pag.QrCodeString ?? null,
        mensagem: pag.ReturnMessage,
      })
    }

    return json({
      ok: pago,
      payment_id: pag.PaymentId,
      status,
      // a mensagem da Cielo é técnica ("Not Authorized"); a tela mostra algo humano
      mensagem: pago ? "Pagamento aprovado" : (pag.ReturnMessage || "Pagamento não autorizado"),
    })
  } catch (e) {
    console.error("cielo-pagar falhou:", e instanceof Error ? e.message : e)
    return json({ erro: "falha ao processar pagamento" }, 500)
  }
})
