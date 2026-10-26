import { createClient } from "npm:@supabase/supabase-js@2"

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

const pega = (xml: string, tag: string) => xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`))?.[1] ?? null
const bloco = (xml: string, tag: string) => xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`))?.[1] ?? ""
const num = (s: string | null) => { const v = Number(s ?? 0); return Number.isFinite(v) ? v : 0 }

function desescapar(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
}

/** "ATACADAO S.A." → "Atacadao S.A." (nome de loja em caixa alta cansa a vista na lista) */
function titulo(s: string) {
  const t = s.trim()
  if (!t || t !== t.toUpperCase()) return t
  return t.toLowerCase().replace(/(^|[\s(\/-])([a-záéíóúâêôãõç])/g, (_, a, b) => a + b.toUpperCase())
    .replace(/\b(Ltda|Me|Epp|S\/a|Sa|Eireli)\b/g, (m) => m.toUpperCase())
    .replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (m) => m.toLowerCase())
}
function nomeDoItem(s: string) {
  const t = s.replace(/\s+/g, " ").trim()
  if (!t || t !== t.toUpperCase()) return t
  const baixo = t.toLowerCase()
  return baixo.charAt(0).toUpperCase() + baixo.slice(1)
}
function normalizarNome(nome: string) {
  return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim()
}
const PALAVRAS_LIMPEZA = [
  "SABAO", "DETERG", "DESINF", "SANIT", "ALVEJ", "CLORO", "ESPONJA", "PAPEL TOALHA", "PAPEL HIG",
  "GUARDANAPO", "SACO", "SACOLA", "EMBALAG", "POTE", "COPO DESC", "TALHER", "GARFO", "COLHER DESC",
  "FILME PVC", "PAPEL ALUM", "LUVA", "TOUCA", "PANO", "VASSOURA", "RODO", "LIXO", "LIMPA", "MULTIUSO",
  "AMACIANTE", "ALCOOL", "BOMBRIL", "PALHA DE ACO", "PALHA ACO", "FORMINHA", "LACRE", "FITA ", "ETIQUETA",
  "CANUDO", "PRATO DESC", "MARMITEX", "QUENTINHA", "BANDEJA", "PAPEL MANTEIGA", "PAPEL FILME", "TOALHA",
  "DESENGORD", "LUSTRA", "INSETIC", "ODORIZ", "PERFUMADOR", "FLANELA", "BALDE", "LIXEIRA",
]

/** Código tPag da NF-e → como a planilha chama. */
function formaDePagamento(tPag: string | null) {
  const m: Record<string, string> = {
    "01": "Dinheiro", "02": "Cheque", "03": "Cartão de Crédito", "04": "Cartão de Débito", "05": "Crédito Loja",
    "10": "Vale Alimentação", "11": "Vale Refeição", "15": "Boleto", "16": "Depósito", "17": "PIX", "18": "Transferência",
    "19": "PIX", "90": "Sem pagamento", "99": "Outros",
  }
  return tPag ? (m[tPag] ?? `Outros (${tPag})`) : null
}

function lerNfe(xml: string) {
  const infNFe = bloco(xml, "infNFe")
  const chave = xml.match(/Id="NFe(\d{44})"/)?.[1] ?? pega(xml, "chNFe")
  const emit = bloco(infNFe, "emit")
  const dest = bloco(infNFe, "dest")
  const ide = bloco(infNFe, "ide")
  const total = bloco(infNFe, "ICMSTot")
  const pag = bloco(infNFe, "pag")
  const itens = [...infNFe.matchAll(/<det nItem="(\d+)">([\s\S]*?)<\/det>/g)].map((d) => {
    const prod = bloco(d[2], "prod")
    const qtd = num(pega(prod, "qCom"))
    const bruto = num(pega(prod, "vProd"))
    const desc = num(pega(prod, "vDesc"))
    const liquido = Number((bruto - desc).toFixed(2))
    return {
      ordem: Number(d[1]),
      codigo: pega(prod, "cProd"),
      nome: nomeDoItem(desescapar(pega(prod, "xProd") ?? "")),
      unidade: (pega(prod, "uCom") ?? "UN").toUpperCase(),
      quantidade: qtd || 1,
      valor_unitario: qtd ? Number((liquido / qtd).toFixed(4)) : liquido,
      valor_total: liquido,
    }
  })
  const nomeSefaz = desescapar(pega(emit, "xFant") || pega(emit, "xNome") || "Fornecedor")
  return {
    chave_acesso: chave,
    numero: pega(ide, "nNF") && pega(ide, "serie") ? `${Number(pega(ide, "nNF"))}/${Number(pega(ide, "serie"))}` : null,
    emitente_nome_sefaz: nomeSefaz,
    emitente_nome: titulo(nomeSefaz),
    emitente_cnpj: (pega(emit, "CNPJ") ?? "").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") || null,
    destinatario_cnpj: pega(dest, "CNPJ"),
    emitida_em: pega(ide, "dhEmi"),
    total: num(pega(total, "vNF")),
    forma_pagamento: formaDePagamento(pega(pag, "tPag")),
    itens,
  }
}

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

    if (corpo.acao === "nfe") {
      const xml = String(corpo.xml ?? "")
      if (!/<infNFe/.test(xml)) return json({ erro: "isso não é o XML de uma NF-e" }, 400)
      const nota = lerNfe(xml)
      if (!nota.chave_acesso || !nota.itens.length) return json({ erro: "XML sem chave ou sem itens" }, 400)

      const { data: existe } = await db.from("compras").select("id, conferida").eq("chave_acesso", nota.chave_acesso).maybeSingle()
      if (existe) return json({ ok: true, ja_existia: true, compra_id: existe.id, conferida: existe.conferida })

      // nome curto da loja já escolhido antes, e bloco lembrado por item
      const { data: cfg } = await db.from("settings").select("key, value").in("key", ["compras_fornecedores"])
      let apelidos: Record<string, string> = {}
      try { apelidos = JSON.parse(cfg?.[0]?.value ?? "{}") } catch { /* vazio */ }
      const cnpjDigitos = (nota.emitente_cnpj ?? "").replace(/\D/g, "")
      const emitenteNome = apelidos[cnpjDigitos] || nota.emitente_nome

      const nomes = nota.itens.map((i) => normalizarNome(i.nome))
      const { data: lembradas } = await db.from("compras_categorias").select("nome, categoria").in("nome", nomes)
      const mapa = new Map<string, string>((lembradas ?? []).map((c: any) => [c.nome, c.categoria]))
      const categoria = (nome: string) => {
        const n = normalizarNome(nome)
        return mapa.get(n) ?? (PALAVRAS_LIMPEZA.some((p) => n.includes(p)) ? "limpeza" : "comida")
      }

      const { data: compra, error } = await db.from("compras").insert({
        chave_acesso: nota.chave_acesso, numero: nota.numero, emitente_nome: emitenteNome, emitente_nome_sefaz: nota.emitente_nome_sefaz,
        emitente_cnpj: nota.emitente_cnpj, emitida_em: nota.emitida_em, total: nota.total, forma_pagamento: nota.forma_pagamento,
        qtd_itens: nota.itens.length, origem: "nfe", conferida: false, xml,
        observacao: corpo.nsu ? `NSU ${corpo.nsu}` : null,
      }).select("id").single()
      if (error) throw new Error(error.message)
      const { error: e2 } = await db.from("compras_itens").insert(nota.itens.map((i) => ({
        compra_id: compra.id, ordem: i.ordem, codigo: i.codigo, nome: i.nome, quantidade: i.quantidade, unidade: i.unidade,
        valor_unitario: i.valor_unitario, valor_total: i.valor_total, categoria: categoria(i.nome),
      })))
      if (e2) throw new Error(e2.message)
      return json({ ok: true, compra_id: compra.id, emitente: emitenteNome, total: nota.total, itens: nota.itens.length })
    }

    return json({ erro: "ação desconhecida" }, 400)
  } catch (e) {
    console.error("[nfe-receber]", (e as Error).message)
    return json({ erro: (e as Error).message }, 500)
  }
})
