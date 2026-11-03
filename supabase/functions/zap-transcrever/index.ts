import { createClient } from "npm:@supabase/supabase-js@2"

/**
 * zap-transcrever — conversa com o robô de transcrição do PC da loja (loja-pc/transcricao/robo.py),
 * que roda o Whisper lá mesmo (sem custo por áudio).
 *
 *   pendentes {}                  → até 5 áudios do Zap ainda sem texto (mais novos primeiro, últimos
 *                                   30 dias), cada um com um link assinado de 10 min para baixar.
 *   resultado { id, texto|erro }  → grava a transcrição (ou o erro, para não tentar de novo sem fim).
 *   pulso { modelo, nota }        → sinal de vida, em settings.transcricao_robo_estado.
 *
 * Autenticação: header x-robo-segredo igual ao segredo TRANSCRICAO_SEGREDO. Sem isso, 401.
 */

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } })

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método" }, 405)
  const segredo = Deno.env.get("TRANSCRICAO_SEGREDO")
  if (!segredo || req.headers.get("x-robo-segredo") !== segredo) return json({ erro: "não autorizado" }, 401)

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  let corpo: Record<string, unknown>
  try { corpo = await req.json() } catch { return json({ erro: "corpo inválido" }, 400) }

  if (corpo.acao === "pendentes") {
    const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await db.from("zap_mensagens").select("id, midia_path, midia_tipo")
      .eq("tipo", "audio").not("midia_path", "is", null).is("transcricao", null).is("transcricao_erro", null)
      .gte("criada_em", desde).order("criada_em", { ascending: false }).limit(5)
    if (error) return json({ erro: error.message }, 500)
    const audios = []
    for (const a of data ?? []) {
      const { data: link } = await db.storage.from("zap-midia").createSignedUrl(a.midia_path, 600)
      if (link?.signedUrl) audios.push({ id: a.id, url: link.signedUrl, tipo: a.midia_tipo })
    }
    return json({ audios })
  }

  if (corpo.acao === "resultado") {
    const texto = typeof corpo.texto === "string" ? corpo.texto.trim() : ""
    const erro = typeof corpo.erro === "string" ? corpo.erro.slice(0, 300) : null
    const campos = texto
      ? { transcricao: texto, transcricao_em: new Date().toISOString(), transcricao_erro: null }
      : { transcricao_erro: erro || "sem fala" }
    const { error } = await db.from("zap_mensagens").update(campos).eq("id", corpo.id)
    return error ? json({ erro: error.message }, 500) : json({ ok: true })
  }

  if (corpo.acao === "pulso") {
    await db.from("settings").upsert({
      key: "transcricao_robo_estado",
      value: JSON.stringify({ visto_em: new Date().toISOString(), modelo: corpo.modelo ?? null, nota: corpo.nota ?? "" }),
    }, { onConflict: "key" })
    return json({ ok: true })
  }

  return json({ erro: "ação desconhecida" }, 400)
})
