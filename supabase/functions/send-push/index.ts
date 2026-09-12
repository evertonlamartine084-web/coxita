import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "npm:web-push@3.6.7"

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pedido recebido",
  em_preparo: "Em preparo",
  saiu_entrega: "Saiu para entrega",
  entregue: "Entregue",
  cancelado: "Cancelado",
}

webpush.setVapidDetails(
  "mailto:contato@coxelli.com",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { order_number, status, type, message } = await req.json()

    if (!order_number) {
      return new Response(JSON.stringify({ error: "order_number required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // O cliente vê o código curto, não o número sequencial — que conta o volume da loja.
    const { data: pedido } = await supabase
      .from("orders")
      .select("codigo_cliente, public_token")
      .eq("order_number", order_number)
      .maybeSingle()
    const referencia = pedido?.codigo_cliente ?? order_number

    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("order_number", order_number)

    if (error) throw error

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "No subscriptions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    let payload: string
    if (type === "chat") {
      payload = JSON.stringify({
        title: `Coxelli - Pedido #${referencia}`,
        body: message || "Nova mensagem da loja",
        url: pedido?.public_token ? `/acompanhar/${pedido.public_token}` : "/acompanhar",
      })
    } else {
      const statusLabel = STATUS_LABELS[status] || status
      payload = JSON.stringify({
        title: `Pedido #${referencia}`,
        body: `Status: ${statusLabel}`,
        url: pedido?.public_token ? `/acompanhar/${pedido.public_token}` : "/acompanhar",
      })
    }

    let sent = 0
    // Os erros também voltam na resposta, não só no log: sem isso, "sent: 0" é indistinguível
    // de chave VAPID trocada, assinatura expirada ou payload grande demais.
    const falhas: Array<{ status?: number; motivo: string }> = []

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.keys_p256dh,
              auth: sub.keys_auth,
            },
          },
          payload
        )
        sent++
        console.log(`Push sent to ${sub.endpoint.slice(0, 50)}...`)
      } catch (e: any) {
        console.error(`Push failed: ${e.statusCode} ${e.message}`)
        falhas.push({ status: e.statusCode, motivo: String(e.message).slice(0, 200) })
        // Assinatura morta: limpa, senão fica sendo tentada pra sempre.
        // 410/404 = o navegador descartou. 403 = foi criada com outra chave VAPID e o servidor
        // de push recusa a assinatura — não volta a funcionar, o cliente precisa reassinar.
        if (e.statusCode === 410 || e.statusCode === 404 || e.statusCode === 403) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id)
        }
      }
    }

    return new Response(
      JSON.stringify({ sent, total: subscriptions.length, falhas }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (e: any) {
    console.error("send-push error:", e)
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
