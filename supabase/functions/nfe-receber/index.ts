import { createClient } from "npm:@supabase/supabase-js@2"
import { ErroNfe, gravarNfe } from "../_shared/nfe.ts"

/**
 * nfe-receber — recebe do robô do PC da loja (loja-pc/sefaz/robo.py) o XML completo de uma NF-e
 * emitida para o CNPJ da Coxelli e grava a compra no painel, para conferência.
 *
 *   nfe   { xml, nsu }  → lê emitente, data, total, pagamento e itens; grava em `compras` com
 *                         origem 'nfe' e conferida = false. A pessoa confere os blocos (comida /
 *                         limpeza) na tela Compras e só então a compra vai para as planilhas
 *                         (ação confirmar_pendente da cupom-ler).
 *   pulso { ultNSU, pendentes, nota } → sinal de vida do robô, mostrado na tela Compras.
 *
 * Autenticação: o robô não tem usuário; manda o header x-robo-segredo igual ao segredo
 * NFE_ROBO_SEGREDO. Sem isso, 401.
 */

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } })

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método" }, 405)
  const segredo = Deno.env.get("NFE_ROBO_SEGREDO")
  if (!segredo || req.headers.get("x-robo-segredo") !== segredo) return json({ erro: "não autorizado" }, 401)

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  let corpo: any
  try { corpo = await req.json() } catch { return json({ erro: "corpo inválido" }, 400) }

  try {
    if (corpo.acao === "pulso") {
      await db.from("settings").upsert({
        key: "nfe_robo_estado",
        value: JSON.stringify({ visto_em: new Date().toISOString(), ultNSU: corpo.ultNSU ?? null, pendentes: corpo.pendentes ?? 0, nota: corpo.nota ?? "" }),
      }, { onConflict: "key" })
      return json({ ok: true })
    }

    // chaves lidas no painel pelo código de barras, esperando o robô
    if (corpo.acao === "pedidas") {
      // a Receita pode levar um tempo para liberar o XML depois da ciência: nova tentativa a cada 5 min, por ~2 h
      const cincoMin = new Date(Date.now() - 5 * 60_000).toISOString()
      const { data } = await db.from("nfe_pedidas").select("chave, tentativas")
        .in("status", ["pendente", "buscando"]).lt("tentativas", 25)
        .or(`tentativas.eq.0,atualizada_em.lt.${cincoMin}`).order("criada_em").limit(10)
      return json({ chaves: data ?? [] })
    }
    if (corpo.acao === "pedida_resultado") {
      const chave = String(corpo.chave ?? "").replace(/\D/g, "")
      const { data: atual } = await db.from("nfe_pedidas").select("tentativas").eq("chave", chave).maybeSingle()
      await db.from("nfe_pedidas").update({
        status: corpo.status, mensagem: corpo.mensagem ?? null,
        tentativas: (atual?.tentativas ?? 0) + (corpo.status === "buscando" ? 0 : 1), atualizada_em: new Date().toISOString(),
      }).eq("chave", chave)
      return json({ ok: true })
    }

    if (corpo.acao === "nfe") {
      const xml = String(corpo.xml ?? "")
      if (!/<infNFe/.test(xml)) return json({ erro: "isso não é o XML de uma NF-e" }, 400)
      try {
        const r = await gravarNfe(db, xml, corpo.nsu ? `NSU ${corpo.nsu}` : null)
        return json({ ok: true, ...r })
      } catch (e) {
        if (e instanceof ErroNfe) return json({ erro: e.message }, 400)
        throw e
      }
    }

    return json({ erro: "ação desconhecida" }, 400)
  } catch (e) {
    console.error("[nfe-receber]", (e as Error).message)
    return json({ erro: (e as Error).message }, 500)
  }
})
