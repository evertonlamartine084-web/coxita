/**
 * Leitor da página da NFC-e da SEFAZ-RN ("Visualizador Mobile NFC-e", versão 3.00).
 *
 * Módulo sem Deno nem rede, de propósito: dá para testar com Node em cima de uma página guardada
 * (`cupom_sessoes.html`), que é como o primeiro leitor foi corrigido em 26/10/2026 — a página
 * real não tinha nada do layout "ENCAT" (spans txtTit/Rqtd) que eu supus; ela usa ids ASP.NET
 * (`tbItensList_lblTbItensDescricao_0`, `lblValorPago`, `lblFormaPagamento`...). O layout ENCAT
 * fica como segunda tentativa, caso a SEFAZ troque de visualizador.
 */

export type ItemLido = {
  ordem: number
  codigo: string | null
  nome: string
  quantidade: number
  unidade: string
  valor_unitario: number
  valor_total: number
}
export type NotaLida = {
  chave_acesso: string | null
  numero: string | null
  emitente_nome: string
  emitente_cnpj: string | null
  emitida_em: string | null
  total: number
  forma_pagamento: string | null
  url_qrcode: string
}

export function decodificar(s: string) {
  return s
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

export function semTags(html: string) {
  return decodificar(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
}

/** "1.234,56" → 1234.56 ; "0,048" → 0.048 ; "1,0" → 1 */
export function numero(s: string | null | undefined): number {
  if (!s) return 0
  const limpo = s.replace(/[^\d,.-]/g, "")
  if (!limpo) return 0
  const n = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo
  const v = Number(n)
  return Number.isFinite(v) ? v : 0
}

/** "24/10/2026 08:30:26" → ISO em Fortaleza (-03:00) */
export function dataIso(s: string | null | undefined): string | null {
  const m = s?.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (!m) return null
  const [, d, mo, a, h = "00", mi = "00", se = "00"] = m
  return `${a}-${mo}-${d}T${h}:${mi}:${se}-03:00`
}

export function paginaDeErro(html: string) {
  return /Nfe - Erro|um erro está impedindo|Ticket\s*\d+/i.test(html)
}

/** Conteúdo do <span id="..."> (ou qualquer tag com esse id), sem tags. */
function porId(html: string, id: string): string {
  const m = html.match(new RegExp(`<[a-z]+[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)<\\/[a-z]+>`, "i"))
  return m ? semTags(m[1]) : ""
}

const FORMAS = /(Dinheiro|Cart[ãa]o de Cr[ée]dito|Cart[ãa]o de D[ée]bito|Cr[ée]dito Loja|PIX|Pix|Vale[^0-9R$|]*|Boleto|Cheque|Transfer[êe]ncia[^0-9R$|]*|Dep[óo]sito[^0-9R$|]*|Sem pagamento|Outros?)/i

// ------------------------------------------------------------------ layout da SEFAZ-RN (ids)

function lerLayoutRN(html: string): { itens: ItemLido[]; cabecalho: Partial<NotaLida> } | null {
  if (!/tbItensList_lblTbItensDescricao_0/.test(html)) return null
  const itens: ItemLido[] = []
  for (let k = 0; k < 500; k++) {
    const nome = porId(html, `tbItensList_lblTbItensDescricao_${k}`)
    if (!nome) break
    const qtd = numero(porId(html, `tbItensList_lblTbItensQtde_${k}`))
    const un = (porId(html, `tbItensList_lblTbItensUnidade_${k}`) || "UN").toUpperCase()
    const vlUnit = numero(porId(html, `tbItensList_lblTbItensValorUnid_${k}`))
    const desconto = numero(porId(html, `tbItensList_lblTbDesconto_${k}`))
    let vlTotal = numero(porId(html, `tbItensList_lblTbItensValorTotal_${k}`))
    // o "Vl. total" da SEFAZ é antes do desconto do item; o que saiu do bolso é depois
    if (desconto > 0 && vlTotal > desconto) vlTotal = Number((vlTotal - desconto).toFixed(2))
    const codigo = porId(html, `tbItensList_lblTbItensCodigo_${k}`) || null
    itens.push({
      ordem: itens.length + 1,
      codigo,
      nome,
      quantidade: qtd || 1,
      unidade: un,
      valor_unitario: vlUnit || (qtd ? Number((vlTotal / qtd).toFixed(4)) : vlTotal),
      valor_total: vlTotal || Number((vlUnit * (qtd || 1)).toFixed(2)),
    })
  }
  const fantasia = porId(html, "lblNomeFantasia").replace(/^NOME FANTASIA:\s*/i, "").trim()
  const razao = porId(html, "lblRazaoSocialEmitente").replace(/^RAZ[ÃA]O SOCIAL:\s*/i, "").trim()
  const numeroSerie = porId(html, "lblNumeroSerie").match(/N[ÚU]MERO:\s*(\d+)\s*S[ÉE]RIE:\s*(\d+)/i)
  return {
    itens,
    cabecalho: {
      emitente_nome: titulo(fantasia || razao),
      emitente_cnpj: porId(html, "lblCPFCNPJEmitente").match(/[\d.\/-]{14,18}/)?.[0] ?? null,
      chave_acesso: porId(html, "lblChave").replace(/\D/g, "") || null,
      numero: numeroSerie ? `${Number(numeroSerie[1])}/${Number(numeroSerie[2])}` : null,
      emitida_em: dataIso(porId(html, "lblDataEmissao")),
      total: numero(porId(html, "lblValorPago")) || numero(porId(html, "lblValorTotal")),
      forma_pagamento: porId(html, "lblFormaPagamento").match(FORMAS)?.[1]?.trim() ?? (porId(html, "lblFormaPagamento") || null),
    },
  }
}

// ------------------------------------------------------- layout "ENCAT" (outros estados / futuro)

function lerLayoutEncat(html: string): { itens: ItemLido[]; cabecalho: Partial<NotaLida> } | null {
  const linhas = html.match(/<tr[^>]*id="Item\s*\+?\s*\d+"[^>]*>[\s\S]*?<\/tr>/gi)
    ?? html.match(/<tr[^>]*>[\s\S]*?class="txtTit"[\s\S]*?<\/tr>/gi)
  if (!linhas?.length) return null
  const itens: ItemLido[] = []
  for (const tr of linhas) {
    const pega = (classe: string) => {
      const m = tr.match(new RegExp(`<span[^>]*class="${classe}"[^>]*>([\\s\\S]*?)<\\/span>`, "i"))
      return m ? semTags(m[1]) : ""
    }
    const nome = pega("txtTit")
    if (!nome) continue
    const qtd = numero(pega("Rqtd").replace(/^.*?:/, ""))
    const un = (pega("RUN").replace(/^.*?:/, "").trim() || "UN").toUpperCase()
    const vlUnit = numero(pega("RvlUnit").replace(/^.*?:/, ""))
    const vlTotal = numero(pega("valor"))
    itens.push({
      ordem: itens.length + 1,
      codigo: pega("RCod").replace(/^.*?:/, "").replace(/[()]/g, "").trim() || null,
      nome, quantidade: qtd || 1, unidade: un,
      valor_unitario: vlUnit || (qtd ? vlTotal / qtd : vlTotal),
      valor_total: vlTotal || Number((vlUnit * (qtd || 1)).toFixed(2)),
    })
  }
  const texto = semTags(html)
  const numeroNota = texto.match(/N[úu]mero:\s*(\d+)\s*S[ée]rie:\s*(\d+)/i)
  return {
    itens,
    cabecalho: {
      emitente_nome: titulo(semTags(html.match(/<div[^>]*id="u20"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "") || texto.match(/^(.*?)\s+CNPJ:/)?.[1] || ""),
      emitente_cnpj: texto.match(/CNPJ:\s*([\d.\/-]{14,18})/i)?.[1] ?? null,
      chave_acesso: texto.match(/Chave de acesso\s*:?\s*((?:\d[\s]*){44})/i)?.[1]?.replace(/\D/g, "") ?? null,
      numero: numeroNota ? `${Number(numeroNota[1])}/${Number(numeroNota[2])}` : null,
      emitida_em: dataIso(texto.match(/Emiss[ãa]o:\s*(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)/i)?.[1]),
      total: numero(texto.match(/Valor a pagar\s*R\$\s*:?\s*([\d.,]+)/i)?.[1]) || numero(texto.match(/Valor total\s*R\$\s*:?\s*([\d.,]+)/i)?.[1]),
      forma_pagamento: texto.match(new RegExp(`Forma de pagamento\\s*:?\\s*${FORMAS.source}`, "i"))?.[1]?.trim() ?? null,
    },
  }
}

/** "ATACADO FAVORITO" → "Atacado Favorito" (nome de loja em caixa alta cansa a vista na lista) */
function titulo(s: string) {
  const t = s.trim()
  if (!t || t !== t.toUpperCase()) return t
  return t.toLowerCase().replace(/(^|[\s(\/-])([a-záéíóúâêôãõç])/g, (_, a, b) => a + b.toUpperCase())
    .replace(/\b(Ltda|Me|Epp|S\/a|Sa|Eireli)\b/g, (m) => m.toUpperCase())
    .replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (m) => m.toLowerCase())
}

export function lerNota(html: string, urlQr: string): { nota: NotaLida; itens: ItemLido[] } {
  const lido = lerLayoutRN(html) ?? lerLayoutEncat(html) ?? { itens: [], cabecalho: {} }
  const c = lido.cabecalho
  const somaItens = Number(lido.itens.reduce((s, i) => s + i.valor_total, 0).toFixed(2))
  return {
    nota: {
      chave_acesso: c.chave_acesso ?? (urlQr.match(/[?&]p=(\d{44})/)?.[1] ?? null),
      numero: c.numero ?? null,
      emitente_nome: c.emitente_nome || "Fornecedor",
      emitente_cnpj: c.emitente_cnpj ?? null,
      emitida_em: c.emitida_em ?? null,
      total: c.total || somaItens,
      forma_pagamento: c.forma_pagamento ?? null,
      url_qrcode: urlQr,
    },
    itens: lido.itens,
  }
}
