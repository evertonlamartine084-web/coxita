import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

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

// Web Push crypto utilities
async function generatePushPayload(
  subscription: { endpoint: string; keys_p256dh: string; keys_auth: string },
  payload: string
) {
  // Use web-push compatible fetch to send notification
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "TTL": "86400",
    },
    body: payload,
  })
  return response
}

serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    })
  }

  try {
    const { order_number, status } = await req.json()

    if (!order_number || !status) {
      return new Response(JSON.stringify({ error: "order_number and status required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Get push subscriptions for this order
    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("order_number", order_number)

    if (error) throw error

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "No subscriptions found" }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      })
    }

    const statusLabel = STATUS_LABELS[status] || status
    const title = `Pedido #${order_number}`
    const body = `Status atualizado: ${statusLabel}`
    const payload = JSON.stringify({ title, body, url: `/acompanhar/${order_number}` })

    let sent = 0
    const errors: string[] = []

    // Send using web-push npm package via Deno
    for (const sub of subscriptions) {
      try {
        // Import web-push for Deno
        const webpush = await import("https://esm.sh/web-push@3.6.7")

        webpush.setVapidDetails(
          "mailto:contato@coxita.com",
          VAPID_PUBLIC_KEY,
          VAPID_PRIVATE_KEY
        )

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
      } catch (e: any) {
        console.error(`Push failed for ${sub.endpoint}:`, e.message)
        errors.push(e.message)

        // Remove invalid subscriptions (410 Gone or 404)
        if (e.statusCode === 410 || e.statusCode === 404) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("id", sub.id)
        }
      }
    }

    return new Response(
      JSON.stringify({ sent, total: subscriptions.length, errors }),
      {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      }
    )
  } catch (e: any) {
    console.error("send-push error:", e)
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    })
  }
})
