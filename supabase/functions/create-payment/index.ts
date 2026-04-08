import "@supabase/functions-js/edge-runtime.d.ts"

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { order_id, order_number, items, customer_name, customer_email, delivery_fee } = await req.json()

    const mpItems = items.map((item: { product_name: string; quantity: number; unit_price: number }) => ({
      title: item.product_name,
      quantity: item.quantity,
      unit_price: Number(item.unit_price),
      currency_id: "BRL",
    }))

    // Adiciona taxa de entrega como item se > 0
    if (delivery_fee && Number(delivery_fee) > 0) {
      mpItems.push({
        title: "Taxa de entrega",
        quantity: 1,
        unit_price: Number(delivery_fee),
        currency_id: "BRL",
      })
    }

    const preference = {
      items: mpItems,
      payer: {
        name: customer_name,
        email: customer_email || undefined,
      },
      back_urls: {
        success: `https://coxita-theta.vercel.app/pedido-confirmado/${order_number}`,
        failure: `https://coxita-theta.vercel.app/pagamento-falhou/${order_number}`,
        pending: `https://coxita-theta.vercel.app/pedido-confirmado/${order_number}`,
      },
      auto_return: "approved",
      external_reference: order_id,
      statement_descriptor: "COXITA",
    }

    const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(preference),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(JSON.stringify(data))
    }

    return new Response(
      JSON.stringify({ init_point: data.init_point, id: data.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
