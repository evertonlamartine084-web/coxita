import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "npm:web-push@3.6.7"

/**
 * Push de pedido novo para os aparelhos da loja (app do painel, inclusive no iPhone).
 *
 * Quem chama é o banco, no INSERT de pedido feito pelo site (gatilho em
 * supabase/painel-push.sql). Ele se identifica com o mesmo segredo que já divide com a emissão
 * de nota (EMISSAO_INTERNA_SEGREDO): é o canal "banco → função" do projeto.
 *
 * Os aparelhos ficam em `painel_push`, gravados pelo botão "Ativar notificações" do painel.
 */

webpush.setVapidDetails(
  "mailto:coxelli.com.br@gmail.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
)

const ENTREGA: Record<string, string> = { entrega: "Entrega", retirada: "Retirada" }
const PAGAMENTO: Record<string, string> = {
  dinheiro: "Dinheiro", pix: "Pix", pix_online: "Pix pelo site", cartao: "Cartão pelo site",
  credito: "Cartão na entrega", debito: "Débito",
}

const reais = (v: number) => `R$ ${Number(v).toFixed(2).replace(".", ",")}`
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } })

Deno.serve(async (req) => {
  const segredo = Deno.env.get("EMISSAO_INTERNA_SEGREDO")
  if (!segredo || req.headers.get("x-emissao-interna") !== segredo) {
    return json({ erro: "não autorizado" }, 401)
  }

  // tipo: "novo" (pedido entrou) ou "lembrete" (agendado a 1 h do horário, ver lembrar_agendados)
  const { order_id, tipo = "novo" } = await req.json()
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

  const { data: o } = await supabase
    .from("orders")
    .select("order_number, customer_name, delivery_type, payment_method, total, scheduled_for, neighborhood")
    .eq("id", order_id)
    .maybeSingle()
  if (!o) return json({ erro: "pedido não encontrado" }, 404)

  const quando = o.scheduled_for
    ? new Date(o.scheduled_for).toLocaleString("pt-BR", {
      timeZone: "America/Fortaleza", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    })
    : null
  const hora = o.scheduled_for
    ? new Date(o.scheduled_for).toLocaleTimeString("pt-BR", { timeZone: "America/Fortaleza", hour: "2-digit", minute: "2-digit" })
    : ""
  const payload = tipo === "lembrete"
    ? JSON.stringify({
      title: `⏰ Agendado #${o.order_number} às ${hora}`,
      body: `${o.customer_name} · ${ENTREGA[o.delivery_type] ?? o.delivery_type} · hora de preparar!`,
      url: "/admin/pedidos",
      icon: "/painel-192.png",
      tag: `lembrete-${o.order_number}`,
      requireInteraction: true,
    })
    : JSON.stringify({
    title: `🔔 Pedido #${o.order_number} — ${reais(o.total)}`,
    body: [
      o.customer_name,
      `${ENTREGA[o.delivery_type] ?? o.delivery_type}${o.neighborhood ? ` (${o.neighborhood})` : ""}`,
      PAGAMENTO[o.payment_method] ?? o.payment_method,
      quando ? `para ${quando}` : null,
    ].filter(Boolean).join(" · "),
    url: "/admin/pedidos",
    icon: "/painel-192.png",
    tag: `pedido-${o.order_number}`,
    requireInteraction: true,
  })

  const { data: aparelhos } = await supabase.from("painel_push").select("*")
  let enviados = 0
  const falhas: Array<{ status?: number; motivo: string }> = []
  for (const a of aparelhos ?? []) {
    try {
      await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, payload, {
        urgency: "high",
        TTL: 60 * 60,
      })
      enviados++
    } catch (e: any) {
      falhas.push({ status: e.statusCode, motivo: String(e.message).slice(0, 200) })
      // aparelho que desinstalou ou trocou de chave: não volta a funcionar
      if ([403, 404, 410].includes(e.statusCode)) await supabase.from("painel_push").delete().eq("id", a.id)
    }
  }
  console.log(`${tipo} ${o.order_number}: ${enviados}/${aparelhos?.length ?? 0} aparelhos`, falhas)
  return json({ enviados, total: aparelhos?.length ?? 0, falhas })
})
