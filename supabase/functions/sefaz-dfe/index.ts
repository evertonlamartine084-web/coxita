import { createClient } from "npm:@supabase/supabase-js@2"

/**
 * sefaz-dfe — fala com a Receita (NFeDistribuicaoDFe) com o certificado A1 da Coxelli.
 *
 * É o caminho das notas de empresa (NF-e, modelo 55) emitidas para o CNPJ da Coxelli: atacarejo,
 * distribuidor, qualquer compra em que o CNPJ foi informado. A Receita entrega o XML completo, sem
 * captcha e sem tela, para quem se identifica com o certificado do destinatário.
 *
 * Ações:
 *   chave  { chave }      → consulta uma nota pela chave de acesso (consChNFe)
 *   novas  {}             → lista o que há de novo para o CNPJ desde o último NSU (distNSU)
 *
 * O certificado vai nos segredos SEFAZ_CERT_PEM / SEFAZ_KEY_PEM (PEM extraído do .pfx). A Receita
 * limita: uma consulta "novas" por hora quando não há nada novo (cStat 656), e o Bling também
 * consulta com o mesmo certificado — por isso o 656 não é erro, é "tente mais tarde".
 */

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } })

const CNPJ = "68484975000176"
const UF = "24"
const URL_DFE = "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx"

function envelope(consulta: string) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>1</tpAmb><cUFAutor>${UF}</cUFAutor><CNPJ>${CNPJ}</CNPJ>
          ${consulta}
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`
}

async function chamarSefaz(consulta: string): Promise<string> {
  const cert = Deno.env.get("SEFAZ_CERT_PEM")
  const key = Deno.env.get("SEFAZ_KEY_PEM")
  if (!cert || !key) throw new Error("certificado não configurado (SEFAZ_CERT_PEM / SEFAZ_KEY_PEM)")
  // mTLS: o certificado do cliente é o que identifica a Coxelli para a Receita
  // a Receita recusa HTTP/2 ("endpoint requires HTTP/1.1")
  const client = Deno.createHttpClient({ cert, key, http1: true, http2: false })
  try {
    const r = await fetch(URL_DFE, {
      method: "POST",
      headers: { "Content-Type": "application/soap+xml; charset=utf-8" },
      body: envelope(consulta),
      client,
      signal: AbortSignal.timeout(50000),
    } as RequestInit & { client: Deno.HttpClient })
    return await r.text()
  } finally {
    client.close()
  }
}

/** Descompacta cada <docZip> (gzip + base64) da resposta. */
async function documentos(resposta: string) {
  const saida: { schema: string; nsu: string; xml: string }[] = []
  for (const m of resposta.matchAll(/<docZip[^>]*NSU="(\d+)"[^>]*schema="([^"]+)"[^>]*>([^<]+)<\/docZip>/g)) {
    const bytes = Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0))
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))
    const xml = await new Response(stream).text()
    saida.push({ nsu: m[1], schema: m[2], xml })
  }
  return saida
}

const pega = (xml: string, tag: string) => xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1] ?? null

/** Resumo legível de um XML de NF-e (procNFe) ou de resumo (resNFe). */
function resumo(doc: { schema: string; nsu: string; xml: string }) {
  const x = doc.xml
  const emit = x.match(/<emit>([\s\S]*?)<\/emit>/)?.[1] ?? x
  const itens = [...x.matchAll(/<det nItem="(\d+)">([\s\S]*?)<\/det>/g)].map((d) => ({
    ordem: Number(d[1]),
    codigo: pega(d[2], "cProd"),
    nome: pega(d[2], "xProd") ?? "",
    unidade: pega(d[2], "uCom") ?? "UN",
    quantidade: Number(pega(d[2], "qCom") ?? 0),
    valor_unitario: Number(pega(d[2], "vUnCom") ?? 0),
    valor_total: Number(pega(d[2], "vProd") ?? 0),
    desconto: Number(pega(d[2], "vDesc") ?? 0),
  }))
  return {
    nsu: doc.nsu,
    schema: doc.schema,
    chave: pega(x, "chNFe") ?? x.match(/Id="NFe(\d{44})"/)?.[1] ?? null,
    emitente_nome: pega(emit, "xFant") || pega(emit, "xNome") || pega(x, "xNome"),
    emitente_cnpj: pega(emit, "CNPJ") ?? pega(x, "CNPJ"),
    emitida_em: pega(x, "dhEmi"),
    total: Number(pega(x, "vNF") ?? 0),
    tPag: pega(x, "tPag"),
    situacao: pega(x, "cSitNFe"),
    itens,
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ erro: "método" }, 405)

  const url = Deno.env.get("SUPABASE_URL")!
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!
  const comoUsuario = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } })
  const { data: { user } } = await comoUsuario.auth.getUser()
  if (!user) return json({ erro: "Faça login no painel de novo." }, 401)

  let corpo: any
  try { corpo = await req.json() } catch { return json({ erro: "corpo inválido" }, 400) }

  try {
    let consulta: string
    if (corpo.acao === "chave") {
      const chave = String(corpo.chave ?? "").replace(/\D/g, "")
      if (chave.length !== 44) return json({ erro: "chave precisa ter 44 dígitos" }, 400)
      consulta = `<consChNFe><chNFe>${chave}</chNFe></consChNFe>`
    } else if (corpo.acao === "novas") {
      const ultNSU = String(corpo.ultNSU ?? "0").padStart(15, "0")
      consulta = `<distNSU><ultNSU>${ultNSU}</ultNSU></distNSU>`
    } else {
      return json({ erro: "ação desconhecida" }, 400)
    }
    const resposta = await chamarSefaz(consulta)
    const cStat = pega(resposta, "cStat")
    const xMotivo = pega(resposta, "xMotivo")
    const docs = await documentos(resposta)
    return json({
      cStat, xMotivo,
      ultNSU: pega(resposta, "ultNSU"), maxNSU: pega(resposta, "maxNSU"),
      documentos: docs.map(resumo),
    })
  } catch (e) {
    console.error("[sefaz-dfe]", (e as Error).message)
    return json({ erro: (e as Error).message }, 500)
  }
})
