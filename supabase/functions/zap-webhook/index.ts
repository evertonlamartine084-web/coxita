import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

/**
 * Recebe da Evolution (PC da loja) cada mensagem que entra ou sai do WhatsApp da Coxelli e grava
 * em zap_conversas / zap_mensagens, para a aba Atendimento do painel (supabase/zap-atendimento.sql).
 *
 * A Evolution se identifica pelo ?s= da URL, que tem de bater com zap_config.webhook_segredo. Quem
 * configura a URL na Evolution é o próprio painel do PC da loja (utils/zapDoGrupo.js).
 * Grupos, status e canais ficam de fora: atendimento é conversa com cliente.
 */

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } })

type Msg = Record<string, any>

/** Telefone de um jid de pessoa (…@s.whatsapp.net). O @lid esconde o número; aí vem no Alt/Pn. */
function numeroDoJid(...jids: unknown[]): string | null {
  for (const jid of jids) {
    if (typeof jid !== "string") continue
    if (/@s\.whatsapp\.net$/.test(jid) || /@c\.us$/.test(jid)) {
      const n = jid.split("@")[0].split(":")[0].replace(/\D/g, "")
      if (n.length >= 10) return n
    }
  }
  return null
}

/** Tira os embrulhos (temporária, ver uma vez, editada) e devolve o conteúdo de verdade. */
function desembrulhar(m: Msg | undefined): Msg {
  let atual = m ?? {}
  for (let i = 0; i < 4; i++) {
    const dentro = atual.ephemeralMessage?.message ?? atual.viewOnceMessage?.message ??
      atual.viewOnceMessageV2?.message ?? atual.documentWithCaptionMessage?.message ??
      atual.editedMessage?.message
    if (!dentro) break
    atual = dentro
  }
  return atual
}

/** [tipo, texto] da mensagem; null para o que não é mensagem de conversa (reação, apagou, etc.). */
function conteudo(m: Msg): [string, string | null] | null {
  if (m.reactionMessage || m.protocolMessage || m.senderKeyDistributionMessage && Object.keys(m).length === 1) return null
  if (typeof m.conversation === "string") return ["texto", m.conversation]
  if (m.extendedTextMessage) return ["texto", m.extendedTextMessage.text ?? ""]
  if (m.imageMessage) return ["imagem", m.imageMessage.caption || null]
  if (m.videoMessage) return ["video", m.videoMessage.caption || null]
  if (m.audioMessage) return ["audio", null]
  if (m.documentMessage) return ["documento", m.documentMessage.caption || m.documentMessage.fileName || null]
  if (m.stickerMessage) return ["figurinha", null]
  if (m.contactMessage) return ["contato", m.contactMessage.displayName || null]
  if (m.contactsArrayMessage) return ["contato", (m.contactsArrayMessage.contacts ?? []).map((c: Msg) => c.displayName).join(", ") || null]
  if (m.locationMessage || m.liveLocationMessage) return ["localizacao", m.locationMessage?.name || m.locationMessage?.address || null]
  if (m.buttonsResponseMessage) return ["texto", m.buttonsResponseMessage.selectedDisplayText ?? null]
  if (m.listResponseMessage) return ["texto", m.listResponseMessage.title ?? null]
  return ["outro", null]
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: true })
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

  const { data: cfg } = await supabase.from("zap_config").select("webhook_segredo").eq("id", 1).maybeSingle()
  const segredo = new URL(req.url).searchParams.get("s")
  if (!cfg?.webhook_segredo || segredo !== cfg.webhook_segredo) return json({ erro: "não autorizado" }, 401)

  const corpo = await req.json().catch(() => null)
  const evento = String(corpo?.event ?? "").toLowerCase().replace(/_/g, ".")
  // Diagnóstico (sem texto de mensagem): o formato que chegou e por que cada mensagem foi pulada.
  const motivos: string[] = []
  const registrar = (gravadas: number) => supabase.from("impressao_log").insert({
    aparelho: "webhook", versao: "zap-webhook", evento: "zap_webhook", detalhe: {
      evento: corpo?.event ?? null, chaves: Object.keys(corpo ?? {}),
      data: Array.isArray(corpo?.data) ? `lista(${corpo.data.length})` : Object.keys(corpo?.data ?? {}),
      jid: String(corpo?.data?.key?.remoteJid ?? "").replace(/^\d+/, "N"),
      msg: Object.keys(corpo?.data?.message ?? {}), gravadas, motivos,
    },
  })
  if (!["messages.upsert", "send.message"].includes(evento)) {
    await registrar(0)
    return json({ ignorado: evento })
  }

  const lista: Msg[] = Array.isArray(corpo?.data) ? corpo.data : corpo?.data?.messages ?? [corpo?.data]
  let gravadas = 0
  for (const d of lista) {
    const k = d?.key ?? {}
    const jid: string = k.remoteJid ?? ""
    if (!jid || /@g\.us$|@broadcast$|@newsletter$/.test(jid)) { motivos.push(jid ? "grupo/status" : "sem jid"); continue }
    const c = conteudo(desembrulhar(d.message))
    if (!c) { motivos.push("reação/protocolo"); continue }
    const [tipo, texto] = c

    const telefone = numeroDoJid(jid, k.remoteJidAlt, k.senderPn, d.remoteJidAlt)
    const chave = telefone ?? jid
    const fromMe = !!k.fromMe
    const ts = Number(d.messageTimestamp)
    const quando = Number.isFinite(ts) && ts > 0
      ? new Date(ts * (String(Math.trunc(ts)).length > 11 ? 1 : 1000)).toISOString()
      : new Date().toISOString()

    // Conversa: cria se faltar; o nome vem do perfil de quem escreveu (não do nosso).
    const { data: existente } = await supabase.from("zap_conversas").select("chave, nome").eq("chave", chave).maybeSingle()
    if (!existente) {
      await supabase.from("zap_conversas").insert({
        chave, jid: telefone ? `${telefone}@s.whatsapp.net` : jid, telefone,
        nome: fromMe ? null : (d.pushName || null),
      })
    } else if (!fromMe && d.pushName && !existente.nome) {
      await supabase.from("zap_conversas").update({ nome: d.pushName }).eq("chave", chave)
    }

    // Resposta enviada pelo painel: a linha da fila já existe; só ganha o wa_id.
    if (fromMe && k.id) {
      const { data: daFila } = await supabase.from("zap_mensagens")
        .select("id").eq("conversa", chave).eq("de_mim", true).is("wa_id", null)
        .in("status", ["enviando", "enviada"]).eq("texto", texto ?? "")
        .gte("criada_em", new Date(Date.now() - 10 * 60 * 1000).toISOString())
        .order("criada_em", { ascending: false }).limit(1).maybeSingle()
      if (daFila) {
        await supabase.from("zap_mensagens").update({ wa_id: k.id, status: "enviada" }).eq("id", daFila.id)
        continue
      }
    }

    const { error } = await supabase.from("zap_mensagens").upsert({
      wa_id: k.id ?? null, conversa: chave, de_mim: fromMe, texto, tipo,
      status: fromMe ? "enviada" : "recebida", criada_em: quando,
    }, { onConflict: "wa_id", ignoreDuplicates: true })
    if (!error) gravadas++
    else motivos.push(`erro: ${error.message}`)
  }
  await registrar(gravadas)
  return json({ ok: true, gravadas })
})
