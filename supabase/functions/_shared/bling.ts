/**
 * Acesso à API v3 do Bling com o token guardado em `integracao_bling`.
 *
 * O access_token dura horas; o refresh_token, semanas, e é trocado a cada renovação — o antigo
 * deixa de valer. Por isso a renovação acontece aqui, só quando o token venceu, e nunca em
 * paralelo por conta própria: duas renovações simultâneas queimariam o refresh_token uma da
 * outra e a integração cairia até alguém reconectar pelo painel.
 */

const CLIENT_ID = Deno.env.get("BLING_CLIENT_ID")!
const CLIENT_SECRET = Deno.env.get("BLING_CLIENT_SECRET")!
// api.bling.com.br, não www: o www aceita a troca de código mas recusa o resto (ver bling-oauth)
export const BLING_API = "https://api.bling.com.br/Api/v3"
const TOKEN_URL = `${BLING_API}/oauth/token`

export class ErroBling extends Error {
  constructor(message: string, public status = 0, public detalhe: unknown = null) {
    super(message)
  }
}

/** O Bling pede as credenciais do app em Basic auth, não no corpo. */
function basicAuth(): string {
  return "Basic " + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)
}

export async function guardarToken(supabase: any, dados: any) {
  // 60s de folga: token que vence no meio de uma chamada falha a emissão da nota
  const expiraEm = new Date(Date.now() + (Number(dados.expires_in ?? 21600) - 60) * 1000)
  const { error } = await supabase.from("integracao_bling").upsert({
    id: 1,
    access_token: dados.access_token,
    refresh_token: dados.refresh_token,
    expira_em: expiraEm.toISOString(),
    atualizado_em: new Date().toISOString(),
  })
  if (error) throw error
  return expiraEm
}

export async function pedirToken(params: Record<string, string>) {
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(params),
  })
  const dados = await r.json().catch(() => ({}))
  return { ok: r.ok && !!dados.access_token, dados }
}

async function renovar(supabase: any, refreshToken: string): Promise<string> {
  const { ok, dados } = await pedirToken({ grant_type: "refresh_token", refresh_token: refreshToken })
  if (!ok) throw new ErroBling("o Bling recusou a renovação do acesso; reconecte pelo painel", 401, dados)
  await guardarToken(supabase, dados)
  return dados.access_token
}

/** Token válido, renovando se preciso. */
async function tokenAtual(supabase: any, forcarRenovacao = false): Promise<string> {
  const { data } = await supabase
    .from("integracao_bling")
    .select("access_token, refresh_token, expira_em")
    .eq("id", 1)
    .maybeSingle()
  if (!data) throw new ErroBling("o site nunca foi conectado ao Bling", 409)
  if (!forcarRenovacao && new Date(data.expira_em) > new Date()) return data.access_token
  return renovar(supabase, data.refresh_token)
}

/** Texto legível de um erro do Bling: a mensagem geral e, quando vem, o motivo de cada campo. */
function mensagemDeErro(corpo: any, status: number): string {
  const e = corpo?.error
  if (!e) return `o Bling respondeu ${status}`
  const campos = (e.fields ?? [])
    .map((f: any) => f?.msg ?? f?.message ?? f?.element)
    .filter(Boolean)
  return [e.description || e.message, ...campos].filter(Boolean).join(" · ")
}

/**
 * Chamada à API. Devolve o corpo já lido; erro vira ErroBling com a mensagem do Bling.
 * Um 401 com token que parecia válido (revogado, ou renovado por outra chamada) tenta uma vez
 * mais com token novo antes de desistir.
 */
export async function bling(supabase: any, metodo: string, caminho: string, corpo?: unknown) {
  let token = await tokenAtual(supabase)
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const r = await fetch(`${BLING_API}${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    })
    if (r.status === 401 && tentativa === 0) {
      token = await tokenAtual(supabase, true)
      continue
    }
    const texto = await r.text()
    const dados = texto ? JSON.parse(texto) : {}
    if (!r.ok) throw new ErroBling(mensagemDeErro(dados, r.status), r.status, dados)
    return dados
  }
  throw new ErroBling("o Bling recusou o acesso", 401)
}
