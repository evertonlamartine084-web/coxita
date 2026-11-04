import { createClient } from "npm:@supabase/supabase-js@2"

/**
 * zap-ler-pedido — conversa com o robô leitor de pedido do PC da loja (loja-pc/leitor-pedido),
 * que lê as conversas do Zap com regras (src/utils/lerPedidoDoZap.js), sem IA paga.
 *
 *   pendentes {}                          → até 15 conversas com mensagem nova desde a última
 *                                           leitura (últimos 3 dias), cada uma com as mensagens
 *                                           que vieram depois do último pedido do cliente, e o
 *                                           cardápio (produtos e sabores ativos).
 *   gravar { conversa, leitura, ate }     → guarda o pedido achado em zap_conversas.pedido_lido.
 *   pulso { nota }                        → sinal de vida, em settings.leitor_pedido_robo_estado.
 *
 * Autenticação: header x-robo-segredo igual ao segredo LEITOR_SEGREDO. Sem isso, 401.
 */

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } })
const TRES_DIAS = 3 * 24 * 60 * 60 * 1000

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método" }, 405)
  const segredo = Deno.env.get("LEITOR_SEGREDO")
  if (!segredo || req.headers.get("x-robo-segredo") !== segredo) return json({ erro: "não autorizado" }, 401)

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  let corpo: Record<string, unknown>
  try { corpo = await req.json() } catch { return json({ erro: "corpo inválido" }, 400) }

  if (corpo.acao === "pendentes") {
    const desde = new Date(Date.now() - TRES_DIAS).toISOString()
    const { data: convs, error } = await db.from("zap_conversas").select("chave, telefone, ultima_em, pedido_lido_ate")
      .gte("ultima_em", desde).order("ultima_em", { ascending: false }).limit(200)
    if (error) return json({ erro: error.message }, 500)
    const novas = (convs ?? []).filter((c) => !c.pedido_lido_ate || new Date(c.ultima_em) > new Date(c.pedido_lido_ate)).slice(0, 15)

    // pedidos dos últimos 3 dias, para cortar o que já virou pedido
    const { data: recentes } = await db.from("orders").select("created_at, customer_phone")
      .gte("created_at", desde).order("created_at", { ascending: false }).limit(500)
    const ultimoPorFone = new Map<string, string>()
    for (const o of recentes ?? []) {
      const d = String(o.customer_phone ?? "").replace(/\D/g, "").slice(-8)
      if (d.length === 8 && !ultimoPorFone.has(d)) ultimoPorFone.set(d, o.created_at)
    }

    const conversas = []
    for (const c of novas) {
      // só o que veio depois do último pedido deste telefone: pedido já lançado não aparece de novo
      const dig = String(c.telefone ?? "").replace(/\D/g, "").slice(-8)
      const ultimo = dig.length === 8 ? ultimoPorFone.get(dig) : undefined
      const corte = ultimo && ultimo > desde ? ultimo : desde
      const { data: msgs } = await db.from("zap_mensagens").select("id, de_mim, tipo, texto, transcricao, criada_em")
        .eq("conversa", c.chave).gt("criada_em", corte).order("criada_em", { ascending: true }).limit(200)
      conversas.push({ chave: c.chave, ate: c.ultima_em, mensagens: msgs ?? [] })
    }

    const [{ data: produtos }, { data: sabores }] = await Promise.all([
      db.from("products").select("id, name, pack_size, flavor_group, fixed_flavor_id, active").eq("active", true),
      db.from("flavors").select("id, name, group_slug, active"),
    ])
    return json({ conversas, produtos: produtos ?? [], sabores: sabores ?? [] })
  }

  if (corpo.acao === "gravar") {
    const { error } = await db.from("zap_conversas")
      .update({ pedido_lido: corpo.leitura ?? null, pedido_lido_ate: corpo.ate ?? new Date().toISOString() })
      .eq("chave", corpo.conversa)
    return error ? json({ erro: error.message }, 500) : json({ ok: true })
  }

  if (corpo.acao === "pulso") {
    await db.from("settings").upsert({
      key: "leitor_pedido_robo_estado",
      value: JSON.stringify({ visto_em: new Date().toISOString(), nota: corpo.nota ?? "" }),
    }, { onConflict: "key" })
    return json({ ok: true })
  }

  return json({ erro: "ação desconhecida" }, 400)
})
