import "@supabase/functions-js/edge-runtime.d.ts"

const NTFY_TOPIC = "coxita-pedidos"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const PAYMENT_LABELS: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  credito: "Cartao Credito",
  debito: "Cartao Debito",
}

function formatBRL(value: number): string {
  return `R$ ${Number(value).toFixed(2).replace(".", ",")}`
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { order, items } = await req.json()

    const itemsList = items
      .map((i: { quantity: number; name: string; price: number }) =>
        `  ${i.quantity}x ${i.name} - ${formatBRL(i.price)}`
      )
      .join("\n")

    const address = order.delivery_type === "entrega"
      ? `${order.address}, ${order.address_number} - ${order.neighborhood}`
      : "Retirada no local"

    const lines = [
      `Cliente: ${order.customer_name}`,
      `Telefone: ${order.customer_phone}`,
      ``,
      `Tipo: ${order.delivery_type === "entrega" ? "Entrega" : "Retirada"}`,
      `Endereco: ${address}`,
      ``,
      `Itens:`,
      itemsList,
      ``,
      `Subtotal: ${formatBRL(order.subtotal)}`,
      `Entrega: ${order.delivery_fee > 0 ? formatBRL(order.delivery_fee) : "Gratis"}`,
      `TOTAL: ${formatBRL(order.total)}`,
      ``,
      `Pagamento: ${PAYMENT_LABELS[order.payment_method] || order.payment_method}`,
    ]

    if (order.payment_method === "dinheiro" && order.change_for) {
      lines.push(`Troco para: ${formatBRL(order.change_for)}`)
    }
    if (order.notes) {
      lines.push(`Obs: ${order.notes}`)
    }

    const body = lines.join("\n")

    const ntfyResponse = await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
      method: "POST",
      headers: {
        "Title": `Novo Pedido #${order.order_number}`,
        "Priority": "5",
        "Tags": "chicken,shopping_cart",
      },
      body,
    })

    const result = await ntfyResponse.text()

    return new Response(
      JSON.stringify({ success: true, status: ntfyResponse.status }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
