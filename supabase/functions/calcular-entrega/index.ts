import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

/**
 * calcular-entrega — taxa de entrega pelo CEP do cliente: R$ por km pelo caminho de carro, a
 * partir da loja, até um limite de km (settings `delivery_fee_per_km`, `delivery_max_km`,
 * `loja_lat`, `loja_lng`).
 *
 * Grava a cotação em `entrega_cotacoes` e devolve o id; o `criar_pedido` só aceita pedido de
 * entrega do site com uma cotação daqui, e usa a taxa dela. Assim o valor não depende do navegador.
 *
 * Coordenada pelo CEP (cep.awesomeapi.com.br), não pelo nome da rua: no Brasil o CEP divide as
 * ruas longas por faixa de numeração, e o mapa aberto em Natal só acha o meio da rua — numa
 * avenida de 5 km a taxa erraria vários reais. Se a busca por CEP falha, tenta a rua no
 * OpenStreetMap. A rota vem do OSRM; se ele falhar, usa a linha reta x 1,35 (a média de
 * desvio das ruas) e marca a cotação como "estimada".
 *
 * Os dois serviços de coordenada bloqueiam o servidor da Supabase (28/09/2026: 429 no
 * awesomeapi, IP compartilhado; 403 no Nominatim). Do celular do cliente funcionam, então o
 * checkout manda a coordenada que achou (`lat`, `lng`). Ela só é usada se a busca daqui falhar,
 * precisa estar a até RAIO_CLIENTE_KM da loja e não entra no reaproveitamento por CEP — uma
 * coordenada adulterada vale só para quem a mandou, e a distância fica no pedido para conferir.
 */

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } })

const UA = "CoxelliSalgados/1.0 (coxelli.com.br@gmail.com)"
// cotação do mesmo CEP feita há menos que isso é reaproveitada: mesmo preço e sem gastar os serviços
const REUSO_DIAS = 30
// coordenada mandada pelo navegador precisa estar perto da loja (Grande Natal)
const RAIO_CLIENTE_KM = 60
// o que deu errado nas buscas desta chamada, devolvido junto com "cep-nao-encontrado"
let falhas: string[] = []

async function buscar(url: string, ms = 6000) {
  const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(ms) })
  if (!r.ok) throw new Error(`${r.status} em ${new URL(url).host}`)
  return r.json()
}

async function coordenadaDoCep(cep: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const d = await buscar(`https://cep.awesomeapi.com.br/json/${cep}`)
    const lat = Number(d.lat), lng = Number(d.lng)
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat && lng) return { lat, lng }
  } catch (e) {
    falhas.push(`awesomeapi: ${e}`); console.warn("awesomeapi:", String(e))
  }
  // plano B: a rua do CEP (ViaCEP) no OpenStreetMap
  try {
    const v = await buscar(`https://viacep.com.br/ws/${cep}/json/`)
    if (v.erro || !v.localidade) return null
    const q = new URLSearchParams({
      format: "jsonv2", limit: "1", country: "Brasil", state: v.uf, city: v.localidade,
      ...(v.logradouro ? { street: v.logradouro } : {}),
    })
    const [r] = await buscar(`https://nominatim.openstreetmap.org/search?${q}`)
    if (r) return { lat: Number(r.lat), lng: Number(r.lon) }
  } catch (e) {
    falhas.push(`viacep/nominatim: ${e}`); console.warn("viacep/nominatim:", String(e))
  }
  return null
}

function linhaReta(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, rad = (x: number) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

async function kmDeCarro(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  try {
    const r = await buscar(
      `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`,
    )
    const m = r?.routes?.[0]?.distance
    if (r.code === "Ok" && Number.isFinite(m)) return { km: m / 1000, metodo: "rota" }
  } catch (e) {
    console.warn("osrm:", String(e))
  }
  return { km: linhaReta(a, b) * 1.35, metodo: "estimada" }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

  try {
    falhas = []
    const corpo = await req.json().catch(() => ({}))
    const cep = String(corpo.cep ?? "").replace(/\D/g, "")
    const numero = String(corpo.numero ?? "").slice(0, 20) || null
    if (cep.length !== 8) return json({ erro: "cep-invalido" }, 400)

    const { data: linhas } = await supabase.from("settings").select("key, value")
      .in("key", ["delivery_fee_per_km", "delivery_max_km", "loja_lat", "loja_lng"])
    const cfg = Object.fromEntries((linhas ?? []).map((l: any) => [l.key, l.value]))
    const porKm = Number(cfg.delivery_fee_per_km ?? 2)
    const maxKm = Number(cfg.delivery_max_km ?? 10)
    const loja = { lat: Number(cfg.loja_lat ?? -5.7371042), lng: Number(cfg.loja_lng ?? -35.2337835) }

    const doCliente = { lat: Number(corpo.lat), lng: Number(corpo.lng) }
    const clienteValido = Number.isFinite(doCliente.lat) && Number.isFinite(doCliente.lng) &&
      doCliente.lat !== 0 && linhaReta(loja, doCliente) <= RAIO_CLIENTE_KM

    let km: number, metodo: string, destino: { lat: number; lng: number } | null = null
    const { data: anterior } = await supabase.from("entrega_cotacoes").select("km, lat, lng, metodo")
      .eq("cep", cep).eq("metodo", "rota")
      .gt("criada_em", new Date(Date.now() - REUSO_DIAS * 864e5).toISOString())
      .order("criada_em", { ascending: false }).limit(1).maybeSingle()

    if (anterior) {
      km = Number(anterior.km); metodo = "rota"
      destino = { lat: Number(anterior.lat), lng: Number(anterior.lng) }
    } else {
      destino = await coordenadaDoCep(cep)
      let daqui = true
      if (!destino && clienteValido) { destino = doCliente; daqui = false }
      if (!destino) return json({ erro: "cep-nao-encontrado", falhas }, 404)
      const r = await kmDeCarro(loja, destino)
      km = Math.round(r.km * 10) / 10
      // só a rota com coordenada achada aqui é reaproveitada para o mesmo CEP (ver REUSO_DIAS)
      metodo = daqui ? r.metodo : `${r.metodo}-cliente`
    }

    const taxa = Math.round(km * porKm * 100) / 100
    const dentro_area = km <= maxKm

    const { data: cot, error } = await supabase.from("entrega_cotacoes").insert({
      cep, numero, lat: destino.lat, lng: destino.lng, km, taxa, dentro_area, metodo,
    }).select("id").single()
    if (error) throw error

    return json({ id: cot.id, km, taxa, dentro_area, max_km: maxKm, por_km: porKm, metodo })
  } catch (e) {
    console.error("calcular-entrega:", e)
    return json({ erro: "falha", detalhe: String(e?.message ?? e) }, 500)
  }
})
