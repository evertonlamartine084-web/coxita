import { createClient } from "npm:@supabase/supabase-js@2"

/**
 * cupom-ler — lê um cupom de compra (NFC-e) pelo QR code e lança nas planilhas e no painel.
 *
 * Três passos, chamados pela tela Compras do painel:
 *
 *   abrir     { url }                      → abre a consulta da SEFAZ-RN pela URL do QR code.
 *                                            A SEFAZ pede um código de segurança (imagem de 6
 *                                            letras) antes de mostrar a nota; devolvemos a imagem
 *                                            e um `sessao_id`. Quem digita é a pessoa no painel.
 *   confirmar { sessao_id, codigo }        → envia o código e devolve a nota lida: emitente,
 *                                            data, total, pagamento e itens, cada item já com a
 *                                            categoria sugerida (comida / limpeza / outro).
 *   gravar    { nota, itens }              → grava em `compras` + `compras_itens`, lembra a
 *                                            categoria de cada item e escreve nas duas planilhas
 *                                            do Google (itens do mês e totais por fornecedor).
 *
 * Por que a sessão fica no banco (`cupom_sessoes`): a SEFAZ amarra o código à sessão ASP.NET
 * (cookie + __VIEWSTATE). Entre o "abrir" e o "confirmar" passam segundos ou minutos, em chamadas
 * diferentes; guardar no banco é o que deixa a função sem estado. A SEFAZ expira em ~20 min.
 *
 * Planilhas: ids em `settings` (planilha_itens_id, planilha_totais_id, planilha_totais_aba), para
 * trocar das cópias de teste para as de produção sem deploy. O robô é o mesmo do hub
 * (GOOGLE_HUB_SA), com as planilhas compartilhadas com ele como Editor.
 */

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } })

// A SEFAZ-RN entrega a versão móvel da consulta (é a que o QR code abre); fingir um celular evita
// cair na versão de computador, que tem outro formulário.
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
const HOSTS_SEFAZ = ["nfce.sefaz.rn.gov.br", "nfce.set.rn.gov.br", "www.set.rn.gov.br", "set.rn.gov.br"]

type Item = {
  ordem: number
  codigo: string | null
  nome: string
  quantidade: number
  unidade: string
  valor_unitario: number
  valor_total: number
  categoria: "comida" | "limpeza" | "outro"
}
type Nota = {
  chave_acesso: string | null
  numero: string | null
  emitente_nome: string
  emitente_cnpj: string | null
  emitida_em: string | null
  total: number
  forma_pagamento: string | null
  url_qrcode: string
}

// ---------------------------------------------------------------------------------------------
// Texto e números como vêm da SEFAZ
// ---------------------------------------------------------------------------------------------

function semTags(html: string) {
  return decodificar(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
}

function decodificar(s: string) {
  return s
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

/** "1.234,56" → 1234.56 ; "0,048" → 0.048 */
function numero(s: string | null | undefined): number {
  if (!s) return 0
  const limpo = s.replace(/[^\d,.-]/g, "")
  if (!limpo) return 0
  // formato brasileiro: ponto de milhar, vírgula decimal
  const n = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo
  const v = Number(n)
  return Number.isFinite(v) ? v : 0
}

/** "24/10/2026 08:05:50" → ISO em Fortaleza (-03:00) */
function dataIso(s: string | null): string | null {
  const m = s?.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (!m) return null
  const [, d, mo, a, h = "00", mi = "00", se = "00"] = m
  return `${a}-${mo}-${d}T${h}:${mi}:${se}-03:00`
}

function normalizarNome(nome: string) {
  return nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim()
}

// Palavras que, no nome do item, indicam limpeza ou embalagem. A pessoa confirma na tela e a
// escolha fica guardada por nome em `compras_categorias`, que vale mais que esta lista.
const PALAVRAS_LIMPEZA = [
  "SABAO", "DETERG", "DESINF", "SANIT", "ALVEJ", "CLORO", "ESPONJA", "PAPEL TOALHA", "PAPEL HIG",
  "GUARDANAPO", "SACO", "SACOLA", "EMBALAG", "POTE", "COPO DESC", "TALHER", "GARFO", "COLHER DESC",
  "FILME PVC", "PAPEL ALUM", "LUVA", "TOUCA", "PANO", "VASSOURA", "RODO", "LIXO", "LIMPA", "MULTIUSO",
  "AMACIANTE", "ALCOOL", "BOMBRIL", "PALHA DE ACO", "PALHA ACO", "FORMINHA", "LACRE", "FITA ", "ETIQUETA",
  "CANUDO", "PRATO DESC", "MARMITEX", "QUENTINHA", "BANDEJA", "PAPEL MANTEIGA", "PAPEL FILME", "TOALHA",
  "DESENGORD", "LUSTRA", "INSETIC", "ODORIZ", "PERFUMADOR", "FLANELA", "BALDE", "LIXEIRA",
]

function sugerirCategoria(nome: string, lembradas: Map<string, string>): Item["categoria"] {
  const n = normalizarNome(nome)
  const lembrada = lembradas.get(n)
  if (lembrada === "comida" || lembrada === "limpeza" || lembrada === "outro") return lembrada
  return PALAVRAS_LIMPEZA.some((p) => n.includes(p)) ? "limpeza" : "comida"
}

// ---------------------------------------------------------------------------------------------
// Conversa com a SEFAZ
// ---------------------------------------------------------------------------------------------

function validarUrl(url: string): URL {
  let u: URL
  try { u = new URL(url.trim()) } catch { throw new Erro("Isso não é o endereço de um QR code de cupom.", 400) }
  if (!HOSTS_SEFAZ.includes(u.hostname)) {
    throw new Erro(`Este cupom é de outro estado (${u.hostname}). Por enquanto só leio cupom do RN.`, 400)
  }
  return u
}

class Erro extends Error {
  status: number
  constructor(msg: string, status = 400) { super(msg); this.status = status }
}

/** GET seguindo o redirecionamento na mão, para capturar o cookie de sessão. */
async function abrirConsulta(url: string) {
  let cookie = ""
  let atual = url
  let html = ""
  for (let i = 0; i < 5; i++) {
    const r = await fetch(atual, {
      headers: { "User-Agent": UA, ...(cookie ? { Cookie: cookie } : {}) },
      redirect: "manual",
      signal: AbortSignal.timeout(25000),
    })
    const setCookie = r.headers.get("set-cookie")
    const m = setCookie?.match(/ASP\.NET_SessionId=([^;]+)/)
    if (m) cookie = `ASP.NET_SessionId=${m[1]}`
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
      atual = new URL(r.headers.get("location")!, atual).toString()
      await r.text().catch(() => {})
      continue
    }
    html = await r.text()
    break
  }
  return { html, cookie, urlFinal: atual }
}

function lerFormulario(html: string) {
  const action = decodificar(html.match(/<form[^>]*action="([^"]+)"/i)?.[1] ?? "")
  const campos: Record<string, string> = {}
  for (const tag of html.match(/<input[^>]*>/gi) ?? []) {
    const nome = tag.match(/name="([^"]+)"/i)?.[1]
    if (!nome) continue
    const tipo = (tag.match(/type="([^"]+)"/i)?.[1] ?? "text").toLowerCase()
    if (tipo === "submit" || tipo === "button" || tipo === "image") continue
    campos[nome] = decodificar(tag.match(/value="([^"]*)"/i)?.[1] ?? "")
  }
  return { action, campos }
}

async function baixarCaptcha(urlPagina: string, cookie: string) {
  const u = new URL("/portalDFE/JpegImage.aspx", urlPagina).toString()
  const r = await fetch(u, {
    headers: { "User-Agent": UA, Cookie: cookie, Referer: urlPagina },
    signal: AbortSignal.timeout(25000),
  })
  const tipo = r.headers.get("content-type") ?? ""
  const bytes = new Uint8Array(await r.arrayBuffer())
  if (!tipo.includes("image") || bytes.length < 100) {
    throw new Erro("A SEFAZ não mandou a imagem do código. Tente ler o cupom de novo.", 502)
  }
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return `data:image/jpeg;base64,${btoa(bin)}`
}

// ---------------------------------------------------------------------------------------------
// Leitura da página da nota
// ---------------------------------------------------------------------------------------------

function paginaDeErro(html: string) {
  return /Nfe - Erro|um erro está impedindo|Ticket\s*\d+/i.test(html)
}

function lerNota(html: string, urlQr: string): { nota: Nota; itens: Omit<Item, "categoria">[] } {
  const texto = semTags(html)

  // Itens: cada um numa linha da tabela, com spans de classe fixa (txtTit, Rqtd, RUN, RvlUnit, valor)
  const itens: Omit<Item, "categoria">[] = []
  const linhas = html.match(/<tr[^>]*id="Item\s*\+?\s*\d+"[^>]*>[\s\S]*?<\/tr>/gi)
    ?? html.match(/<tr[^>]*>[\s\S]*?class="txtTit"[\s\S]*?<\/tr>/gi)
    ?? []
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
    const codigo = pega("RCod").replace(/^.*?:/, "").replace(/[()]/g, "").trim() || null
    itens.push({
      ordem: itens.length + 1,
      codigo,
      nome,
      quantidade: qtd || 1,
      unidade: un,
      valor_unitario: vlUnit || (qtd ? vlTotal / qtd : vlTotal),
      valor_total: vlTotal || Number((vlUnit * (qtd || 1)).toFixed(2)),
    })
  }

  const emitente = semTags(html.match(/<div[^>]*id="u20"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "")
    || texto.match(/^(.*?)\s+CNPJ:/)?.[1]?.trim()
    || "Fornecedor"
  const cnpj = texto.match(/CNPJ:\s*([\d./-]{14,18})/i)?.[1] ?? null
  const chave = texto.match(/Chave de acesso\s*:?\s*((?:\d[\s]*){44})/i)?.[1]?.replace(/\D/g, "")
    ?? html.match(/chNFCe=(\d{44})/)?.[1]
    ?? null
  const numeroNota = texto.match(/N[úu]mero:\s*(\d+)\s*S[ée]rie:\s*(\d+)/i)
  const emissao = texto.match(/Emiss[ãa]o:\s*(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)/i)?.[1] ?? null
  const totalPagar = texto.match(/Valor a pagar\s*R\$\s*:?\s*([\d.,]+)/i)?.[1]
    ?? texto.match(/Valor total\s*R\$\s*:?\s*([\d.,]+)/i)?.[1]
  const pagamento = texto.match(/Forma de pagamento\s*:?\s*(Dinheiro|Cart[ãa]o de Cr[ée]dito|Cart[ãa]o de D[ée]bito|PIX|Pix|Vale[^0-9R$]*|Boleto|Cheque|Transfer[êe]ncia[^0-9R$]*|Outros?)/i)?.[1]?.trim()
    ?? null

  const total = numero(totalPagar) || Number(itens.reduce((s, i) => s + i.valor_total, 0).toFixed(2))

  return {
    nota: {
      chave_acesso: chave,
      numero: numeroNota ? `${numeroNota[1]}/${numeroNota[2]}` : null,
      emitente_nome: emitente,
      emitente_cnpj: cnpj,
      emitida_em: dataIso(emissao),
      total,
      forma_pagamento: pagamento,
      url_qrcode: urlQr,
    },
    itens,
  }
}

// ---------------------------------------------------------------------------------------------
// Planilhas do Google
// ---------------------------------------------------------------------------------------------

const b64url = (dados: ArrayBuffer | string) => {
  const bytes = typeof dados === "string" ? new TextEncoder().encode(dados) : new Uint8Array(dados)
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function tokenDoGoogle(): Promise<string> {
  const sa = JSON.parse(Deno.env.get("GOOGLE_HUB_SA")!)
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s/g, "")
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
  const chave = await crypto.subtle.importKey(
    "pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  )
  const agora = Math.floor(Date.now() / 1000)
  const corpo = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." + b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: agora,
    exp: agora + 3600,
  }))
  const assinatura = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", chave, new TextEncoder().encode(corpo))
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${corpo}.${b64url(assinatura)}`,
  })
  const d = await r.json()
  if (!d.access_token) throw new Error(`Google recusou o login do robô: ${JSON.stringify(d)}`)
  return d.access_token
}

async function sheets(token: string, metodo: string, caminho: string, corpo?: unknown) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(20000),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`Planilha: ${d?.error?.message ?? r.status}`)
  return d
}

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]

function dataLocal(iso: string | null): Date {
  return iso ? new Date(iso) : new Date()
}
function partesFortaleza(d: Date) {
  const f = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", year: "numeric" })
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]))
  return { dia: p.day, mes: Number(p.month), ano: p.year, texto: `${p.day}/${p.month}/${p.year}` }
}

const aspas = (aba: string) => `'${aba.replace(/'/g, "''")}'`
const brasileiro = (n: number, casas = 3) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas })

const UNIDADES_PESO = new Set(["KG", "KGS", "G", "GR", "L", "LT", "LTS", "ML", "M", "MT"])

/**
 * Como cada item vira linha na planilha de itens (Nome | Quantidade | Unidade | Valor unitário):
 * a planilha entende "Quantidade" como o tamanho da embalagem ("1 kg", "900 ml"), "Unidade" como
 * quantas embalagens e "Valor unitário" como o preço de uma. O cupom não diz o tamanho da
 * embalagem, então: item pesado (kg, g, l, ml) vai como 1 embalagem do peso comprado, pelo total;
 * item por unidade vai como N embalagens de "1 un" ao preço unitário. A coluna E (total) tem
 * fórmula na planilha e fica como está.
 */
function linhaDoItem(i: Item) {
  if (UNIDADES_PESO.has(i.unidade)) {
    return [i.nome, `${brasileiro(i.quantidade)} ${i.unidade.toLowerCase()}`, 1, Number(i.valor_total.toFixed(2))]
  }
  return [i.nome, "1 un", Number(i.quantidade), Number(i.valor_unitario.toFixed(2))]
}

async function gravarNaPlanilhaDeItens(token: string, planilhaId: string, nota: Nota, itens: Item[]) {
  const quando = partesFortaleza(dataLocal(nota.emitida_em))
  const aba = `${MESES[quando.mes - 1]} - ${quando.ano}`

  const meta = await sheets(token, "GET", `${planilhaId}?fields=sheets.properties(title,sheetId)`)
  const abas: { title: string; sheetId: number }[] = (meta.sheets ?? []).map((s: any) => s.properties)
  if (!abas.some((a) => a.title === aba)) {
    const modelo = abas.find((a) => /^modelo$/i.test(a.title))
    if (!modelo) throw new Error(`a planilha de itens não tem a aba "${aba}" nem uma aba "Modelo" para copiar`)
    await sheets(token, "POST", `${planilhaId}:batchUpdate`, {
      requests: [{ duplicateSheet: { sourceSheetId: modelo.sheetId, insertSheetIndex: abas.length, newSheetName: aba } }],
    })
  }

  // primeira linha vazia de cada bloco, a partir da linha 4 (1 título, 2 total, 3 cabeçalho)
  const lidos = await sheets(token, "GET",
    `${planilhaId}/values:batchGet?ranges=${encodeURIComponent(`${aspas(aba)}!A4:A`)}&ranges=${encodeURIComponent(`${aspas(aba)}!G4:G`)}`)
  const primeiraVazia = (valores: string[][] | undefined) => {
    const col = (valores ?? []).map((l) => (l[0] ?? "").trim())
    const i = col.findIndex((v) => !v)
    return 4 + (i === -1 ? col.length : i)
  }
  const linhaComida = primeiraVazia(lidos.valueRanges?.[0]?.values)
  const linhaLimpeza = primeiraVazia(lidos.valueRanges?.[1]?.values)

  const comida = itens.filter((i) => i.categoria === "comida")
  const limpeza = itens.filter((i) => i.categoria === "limpeza")
  const data: { range: string; values: unknown[][] }[] = []
  const linhas = new Map<number, number>() // ordem do item → linha na planilha
  if (comida.length) {
    data.push({ range: `${aspas(aba)}!A${linhaComida}:D${linhaComida + comida.length - 1}`, values: comida.map(linhaDoItem) })
    comida.forEach((i, k) => linhas.set(i.ordem, linhaComida + k))
  }
  if (limpeza.length) {
    data.push({ range: `${aspas(aba)}!G${linhaLimpeza}:J${linhaLimpeza + limpeza.length - 1}`, values: limpeza.map(linhaDoItem) })
    limpeza.forEach((i, k) => linhas.set(i.ordem, linhaLimpeza + k))
  }
  if (data.length) {
    await sheets(token, "POST", `${planilhaId}/values:batchUpdate`, { valueInputOption: "USER_ENTERED", data })
  }
  return { aba, linhas }
}

async function gravarNaPlanilhaDeTotais(token: string, planilhaId: string, aba: string, nota: Nota, qtdItens: number) {
  const lidos = await sheets(token, "GET", `${planilhaId}/values/${encodeURIComponent(`${aspas(aba)}!A1:A`)}`)
  const colA: string[] = (lidos.values ?? []).map((l: string[]) => (l[0] ?? "").trim())
  let ultima = colA.length
  while (ultima > 1 && !colA[ultima - 1]) ultima--
  const quando = partesFortaleza(dataLocal(nota.emitida_em))
  // a planilha separa os meses com uma linha em branco; seguimos o costume
  const anterior = colA[ultima - 1]?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  const mudouMes = anterior && (Number(anterior[2]) !== quando.mes || anterior[3] !== quando.ano)
  const linha = ultima + (mudouMes ? 2 : 1)

  const descricao = `Compra de mercado: ${qtdItens} ${qtdItens === 1 ? "item" : "itens"}${nota.numero ? ` (cupom ${nota.numero})` : ""}`
  await sheets(token, "PUT", `${planilhaId}/values/${encodeURIComponent(`${aspas(aba)}!A${linha}:F${linha}`)}?valueInputOption=USER_ENTERED`, {
    values: [[quando.texto, nota.emitente_nome, descricao, -Math.abs(Number(nota.total.toFixed(2))), nota.forma_pagamento ?? "", "Despesa"]],
  })
  return linha
}

// ---------------------------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ erro: "método" }, 405)

  const url = Deno.env.get("SUPABASE_URL")!
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

  // só quem está logado no painel
  const auth = req.headers.get("Authorization") ?? ""
  const comoUsuario = createClient(url, anon, { global: { headers: { Authorization: auth } } })
  const { data: { user } } = await comoUsuario.auth.getUser()
  if (!user) return json({ erro: "Faça login no painel de novo." }, 401)

  const db = createClient(url, service)

  let corpo: any
  try { corpo = await req.json() } catch { return json({ erro: "corpo inválido" }, 400) }

  try {
    // ------------------------------------------------------------------ abrir
    if (corpo.acao === "abrir") {
      const u = validarUrl(String(corpo.url ?? ""))
      const { html, cookie, urlFinal } = await abrirConsulta(u.toString())
      if (paginaDeErro(html)) {
        throw new Erro("A SEFAZ respondeu com erro para este cupom. Se ele foi emitido em contingência, pode levar algumas horas até a nota entrar lá. Tente mais tarde.", 502)
      }
      const chave = u.searchParams.get("p")?.split("|")[0]?.replace(/\D/g, "") ?? null

      if (/txt_cod_antirobo/.test(html)) {
        const { action, campos } = lerFormulario(html)
        const captcha = await baixarCaptcha(urlFinal, cookie)
        const { data: sessao, error } = await db.from("cupom_sessoes").insert({
          chave_acesso: chave, url_qrcode: u.toString(), cookie, action: new URL(action, urlFinal).toString(), campos,
        }).select("id").single()
        if (error) throw new Error(error.message)
        return json({ precisa_codigo: true, sessao_id: sessao.id, captcha, chave })
      }

      // sem código: já é a nota
      const lido = lerNota(html, u.toString())
      if (!lido.itens.length) throw new Erro("Não achei os itens na página da SEFAZ. Guardei a página para conferir.", 502)
      return json({ precisa_codigo: false, ...(await comCategorias(db, lido)) })
    }

    // -------------------------------------------------------------- confirmar
    if (corpo.acao === "confirmar") {
      const codigo = String(corpo.codigo ?? "").trim()
      if (codigo.length < 4) throw new Erro("Digite o código da imagem.")
      const { data: s } = await db.from("cupom_sessoes").select("*").eq("id", corpo.sessao_id).maybeSingle()
      if (!s) throw new Erro("Essa leitura expirou. Leia o QR code de novo.", 410)

      const campos = { ...(s.campos ?? {}), txt_cod_antirobo: codigo, btnVerDanfe: "Ver DANFE" }
      const r = await fetch(s.action, {
        method: "POST",
        headers: {
          "User-Agent": UA, Cookie: s.cookie, Referer: s.url_qrcode,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(campos).toString(),
        signal: AbortSignal.timeout(25000),
      })
      const html = await r.text()
      await db.from("cupom_sessoes").update({ html }).eq("id", s.id)

      if (/txt_cod_antirobo/.test(html)) {
        // a SEFAZ devolveu o formulário de novo: código errado. Imagem nova para tentar outra vez.
        const { action, campos: novos } = lerFormulario(html)
        const captcha = await baixarCaptcha(s.action, s.cookie)
        await db.from("cupom_sessoes").update({ action: new URL(action, s.action).toString(), campos: novos }).eq("id", s.id)
        return json({ codigo_errado: true, captcha })
      }
      if (paginaDeErro(html)) {
        throw new Erro("A SEFAZ recusou (código errado ou sessão vencida). Leia o QR code de novo.", 502)
      }
      const lido = lerNota(html, s.url_qrcode)
      if (!lido.itens.length) {
        throw new Erro("A SEFAZ abriu a nota, mas não consegui ler os itens. Guardei a página para eu conferir o leitor.", 502)
      }
      if (!lido.nota.chave_acesso) lido.nota.chave_acesso = s.chave_acesso
      return json(await comCategorias(db, lido))
    }

    // ----------------------------------------------------------------- gravar
    if (corpo.acao === "gravar") {
      const nota = corpo.nota as Nota
      const itens = (corpo.itens as Item[]).map((i, k) => ({ ...i, ordem: k + 1 }))
      if (!nota?.emitente_nome || !itens.length) throw new Erro("Nota sem itens.")

      if (nota.chave_acesso) {
        const { data: existe } = await db.from("compras").select("id, created_at").eq("chave_acesso", nota.chave_acesso).maybeSingle()
        if (existe) throw new Erro("Este cupom já foi lançado.", 409)
      }

      const { data: compra, error } = await db.from("compras").insert({
        chave_acesso: nota.chave_acesso, numero: nota.numero, emitente_nome: nota.emitente_nome,
        emitente_cnpj: nota.emitente_cnpj, emitida_em: nota.emitida_em, total: nota.total,
        forma_pagamento: nota.forma_pagamento, qtd_itens: itens.length, url_qrcode: nota.url_qrcode,
      }).select("id").single()
      if (error) throw new Error(error.message)

      const { error: e2 } = await db.from("compras_itens").insert(itens.map((i) => ({
        compra_id: compra.id, ordem: i.ordem, codigo: i.codigo, nome: i.nome, quantidade: i.quantidade,
        unidade: i.unidade, valor_unitario: i.valor_unitario, valor_total: i.valor_total, categoria: i.categoria,
      })))
      if (e2) throw new Error(e2.message)

      // lembrar a escolha de bloco por nome
      await db.from("compras_categorias").upsert(
        itens.map((i) => ({ nome: normalizarNome(i.nome), categoria: i.categoria, atualizado_em: new Date().toISOString() })),
        { onConflict: "nome" },
      )

      // planilhas: erro aqui não desfaz o lançamento no painel; fica registrado para tentar de novo
      const planilhas: Record<string, unknown> = {}
      try {
        const { data: cfg } = await db.from("settings").select("key, value").in("key", ["planilha_itens_id", "planilha_totais_id", "planilha_totais_aba"])
        const conf = Object.fromEntries((cfg ?? []).map((c: any) => [c.key, c.value]))
        const token = await tokenDoGoogle()
        if (conf.planilha_itens_id) {
          const { aba, linhas } = await gravarNaPlanilhaDeItens(token, conf.planilha_itens_id, nota, itens)
          planilhas.itens = { aba, lancados: linhas.size }
          for (const [ordem, linha] of linhas) {
            await db.from("compras_itens").update({ planilha_linha: linha }).eq("compra_id", compra.id).eq("ordem", ordem)
          }
        }
        if (conf.planilha_totais_id) {
          const linha = await gravarNaPlanilhaDeTotais(token, conf.planilha_totais_id, conf.planilha_totais_aba || "2026", nota, itens.length)
          planilhas.totais = { linha }
          await db.from("compras").update({ planilha_totais_linha: linha }).eq("id", compra.id)
        }
      } catch (e) {
        planilhas.erro = (e as Error).message
        await db.from("compras").update({ planilha_erro: planilhas.erro }).eq("id", compra.id)
      }

      if (corpo.sessao_id) await db.from("cupom_sessoes").delete().eq("id", corpo.sessao_id)
      await db.rpc("limpar_cupom_sessoes").then(() => {}, () => {})
      return json({ compra_id: compra.id, planilhas })
    }

    throw new Erro("ação desconhecida")
  } catch (e) {
    const status = e instanceof Erro ? e.status : 500
    console.error("[cupom-ler]", corpo?.acao, (e as Error).message)
    return json({ erro: (e as Error).message }, status)
  }
})

async function comCategorias(db: any, lido: { nota: Nota; itens: Omit<Item, "categoria">[] }) {
  const nomes = lido.itens.map((i) => normalizarNome(i.nome))
  const { data } = await db.from("compras_categorias").select("nome, categoria").in("nome", nomes)
  const lembradas = new Map<string, string>((data ?? []).map((c: any) => [c.nome, c.categoria]))
  const itens: Item[] = lido.itens.map((i) => ({ ...i, categoria: sugerirCategoria(i.nome, lembradas) }))
  return { nota: lido.nota, itens }
}
