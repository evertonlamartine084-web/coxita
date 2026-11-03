import { createClient } from "npm:@supabase/supabase-js@2"
import { cotarInsumo } from "./mercados.js"

/**
 * cotar-mercados — todo dia, o preço de cada insumo nos mercados de Natal com loja online
 * (Atacadão e Nordestão; ver mercados.js). Grava em mercado_precos e registra a rodada em
 * mercado_rodadas; a tela "Onde comprar" do painel lê de lá (supabase/sql/onde-comprar.sql).
 *
 * Quem chama: o pg_cron às 6h30 (cabeçalho x-emissao-interna com o segredo do vault) ou o botão
 * "Buscar agora" do painel logado.
 */

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-emissao-interna",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } })

// poucos de cada vez: são sites de mercado, não precisa martelar
async function emLotes<T, R>(lista: T[], tamanho: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = []
  for (let i = 0; i < lista.length; i += tamanho) {
    saida.push(...await Promise.all(lista.slice(i, i + tamanho).map(fn)))
  }
  return saida
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ erro: "método" }, 405)

  const url = Deno.env.get("SUPABASE_URL")!
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

  const segredo = Deno.env.get("EMISSAO_INTERNA_SEGREDO")
  const chamadaDoBanco = !!segredo && req.headers.get("x-emissao-interna") === segredo
  if (!chamadaDoBanco) {
    const comoUsuario = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } })
    const { data: { user } } = await comoUsuario.auth.getUser()
    if (!user) return json({ erro: "Faça login no painel de novo." }, 401)
  }

  const db = createClient(url, service)
  try {
    const corpo = await req.json().catch(() => ({}))
    let consulta = db.from("mercado_buscas")
      .select("supply_id, termos, comeca, incluir, excluir, minimo, supplies(name, unit, pack_price, pack_quantity)")
      .eq("ativo", true)
    // { supply_id } refaz só um insumo: o painel chama depois de mudar a busca
    if (corpo.supply_id) consulta = consulta.eq("supply_id", corpo.supply_id)
    const { data: buscas, error } = await consulta
    if (error) throw error

    const { data: ign } = await db.from("mercado_ignorados").select("supply_id, mercado, produto_id")
    const ignorados = new Map<string, Set<string>>()
    for (const i of ign ?? []) {
      if (!ignorados.has(i.supply_id)) ignorados.set(i.supply_id, new Set())
      ignorados.get(i.supply_id)!.add(`${i.mercado}|${i.produto_id}`)
    }

    const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)
    const erros: string[] = []
    let precos = 0
    await emLotes(buscas ?? [], 4, async (b) => {
      const s = b.supplies as { name: string; unit: string; pack_price: number; pack_quantity: number }
      const pago = Number(s.pack_quantity) > 0 ? Number(s.pack_price) / Number(s.pack_quantity) : null
      const { achados, erros: e } = await cotarInsumo(b, s.unit, ignorados.get(b.supply_id) ?? new Set(), pago)
      erros.push(...e.map((x: string) => `${s.name} — ${x}`))
      // mercado fora do ar não apaga o que já se leu hoje
      if (e.length && !achados.length) return
      // o dia é refeito inteiro: produto que saiu da busca hoje não fica com o preço da manhã
      await db.from("mercado_precos").delete().eq("supply_id", b.supply_id).eq("visto_em", hoje)
      if (!achados.length) return
      // upsert: duas rodadas ao mesmo tempo (o cron e o "Buscar agora") não brigam pela mesma linha
      const { error: erroGravar } = await db.from("mercado_precos").upsert(achados.map((a: Record<string, unknown>) => ({
        supply_id: b.supply_id,
        mercado: a.mercado, produto_id: a.produto_id, produto: a.produto, marca: a.marca,
        tamanho: a.tamanho, preco: a.preco, preco_original: a.preco_original, preco_unidade: a.preco_unidade,
        link: a.link, imagem: a.imagem, visto_em: hoje,
      })), { onConflict: "supply_id,mercado,produto_id,visto_em" })
      if (erroGravar) erros.push(`${s.name} — gravar: ${erroGravar.message}`)
      else precos += achados.length
    })

    await db.from("mercado_rodadas").insert({ insumos: buscas?.length ?? 0, precos, erros })
    return json({ ok: true, insumos: buscas?.length ?? 0, precos, erros })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await db.from("mercado_rodadas").insert({ insumos: 0, precos: 0, erros: [msg] })
    return json({ erro: msg }, 500)
  }
})
