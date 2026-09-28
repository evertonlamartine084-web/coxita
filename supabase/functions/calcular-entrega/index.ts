import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

/**
 * calcular-entrega — taxa de entrega pelo endereço do cliente: R$ por km pelo caminho de carro,
 * a partir da loja, até um limite de km (settings `delivery_fee_per_km`, `delivery_max_km`,
 * `loja_lat`, `loja_lng`).
 *
 * Grava a cotação em `entrega_cotacoes` e devolve o id; o `criar_pedido` só aceita pedido de
 * entrega do site com uma cotação daqui, e usa a taxa dela. Assim o valor não depende do navegador.
 *
 * Distância, em ordem de preferência:
 *
 * 1. Google (Routes API), com a chave GOOGLE_MAPS_KEY (secret da função), pelo endereço completo
 *    com número: a mesma distância que o dono confere no Google Maps.
 * 2. Mapa aberto: coordenada do CEP (cep.awesomeapi.com.br) e rota do OSRM. Em 28/09/2026 errava
 *    para mais em trechos da Zona Norte (6,5 km contra 5,3 km do Google até a Rua João Paulo II),
 *    porque monta um caminho mais longo depois da Av. Rio Doce. Se o OSRM falhar, linha reta
 *    x 1,35 (cotação "estimada").
 *
 * Os serviços de coordenada por CEP bloqueiam o servidor da Supabase (429 no awesomeapi, IP
 * compartilhado; 403 no Nominatim). Do celular do cliente funcionam, então o checkout manda a
 * coordenada que achou (`lat`, `lng`). Ela só é usada se a busca daqui falhar, precisa estar a
 * até RAIO_CLIENTE_KM da loja e não entra no reaproveitamento por CEP: uma coordenada adulterada
 * vale só para quem a mandou, e a distância fica no pedido para conferir.
 */

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } })

const UA = "CoxelliSalgados/1.0 (coxelli.com.br@gmail.com)"
const GOOGLE_KEY = Deno.env.get("GOOGLE_MAPS_KEY")
// cotação igual feita há menos que isso é reaproveitada: mesmo preço e sem gastar os serviços
const REUSO_DIAS = 30
// coordenada mandada pelo navegador precisa estar perto da loja (Grande Natal)
const RAIO_CLIENTE_KM = 60

type Ponto = { lat: number; lng: number }

// o que deu errado nas buscas desta chamada, devolvido junto com a resposta
let falhas: string[] = []

async function buscar(url: string, ms = 6000) {
  const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(ms) })
  if (!r.ok) throw new Error(`${r.status} em ${new URL(url).host}`)
  return r.json()
}

/** Distância de carro pelo Google, da loja até o endereço escrito (rua, número, bairro, CEP). */
async function kmPeloGoogle(loja: Ponto, endereco: string): Promise<number | null> {
  if (!GOOGLE_KEY) return null
  try {
    const r = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_KEY,
        "X-Goog-FieldMask": "routes.distanceMeters",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: loja.lat, longitude: loja.lng } } },
        destination: { address: endereco },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        languageCode: "pt-BR",
        regionCode: "BR",
      }),
    })
    const d = await r.json().catch(() => ({}))
    const m = d?.routes?.[0]?.distanceMeters
    if (r.ok && Number.isFinite(m)) return m / 1000
    falhas.push(`google: ${r.status} ${String(d?.error?.message ?? JSON.stringify(d)).slice(0, 200)}`)
  } catch (e) {
    falhas.push(`google: ${e}`)
  }
  return null
}

/** Endereço por extenso para o Google: rua e bairro digitados, cidade e UF do ViaCEP. */
async function enderecoPorExtenso(cep: string, rua: string, numero: string, bairro: string) {
  let cidade = "Natal", uf = "RN"
  try {
    const v = await buscar(`https://viacep.com.br/ws/${cep}/json/`)
    if (!v.erro) {
      cidade = v.localidade || cidade
      uf = v.uf || uf
      rua = rua || v.logradouro || ""
      bairro = bairro || v.bairro || ""
    }
  } catch {
    // segue com o que o cliente digitou
  }
  const cepFmt = `${cep.slice(0, 5)}-${cep.slice(5)}`
  const linhaRua = rua ? (numero ? `${rua}, ${numero}` : rua) : ""
  return [linhaRua, bairro, `${cidade} - ${uf}`, cepFmt, "Brasil"].filter(Boolean).join(", ")
}

async function coordenadaDoCep(cep: string): Promise<Ponto | null> {
  try {
    const d = await buscar(`https://cep.awesomeapi.com.br/json/${cep}`)
    const lat = Number(d.lat), lng = Number(d.lng)
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat && lng) return { lat, lng }
  } catch (e) {
    falhas.push(`awesomeapi: ${e}`)
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
    falhas.push(`viacep/nominatim: ${e}`)
  }
  return null
}

function linhaReta(a: Ponto, b: Ponto) {
  const R = 6371, rad = (x: number) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

async function kmDeCarro(a: Ponto, b: Ponto) {
  try {
    const r = await buscar(
      `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false&alternatives=3`,
    )
    // o OSRM ordena pelo tempo do modelo dele, que às vezes prefere uma volta longa; a taxa é por
    // km, então vale a alternativa mais curta (é também a mais perto do que o Google mostra)
    const distancias = (r?.routes ?? []).map((x: any) => x.distance).filter(Number.isFinite)
    if (r.code === "Ok" && distancias.length) return { km: Math.min(...distancias) / 1000, metodo: "rota" }
  } catch (e) {
    falhas.push(`osrm: ${e}`)
  }
  return { km: linhaReta(a, b) * 1.35, metodo: "estimada" }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  const recente = () => new Date(Date.now() - REUSO_DIAS * 864e5).toISOString()

  try {
    falhas = []
    const corpo = await req.json().catch(() => ({}))
    const cep = String(corpo.cep ?? "").replace(/\D/g, "")
    const numero = String(corpo.numero ?? "").trim().slice(0, 20)
    const rua = String(corpo.rua ?? "").trim().slice(0, 120)
    const bairro = String(corpo.bairro ?? "").trim().slice(0, 80)
    if (cep.length !== 8) return json({ erro: "cep-invalido" }, 400)

    const { data: linhas } = await supabase.from("settings").select("key, value")
      .in("key", ["delivery_fee_per_km", "delivery_max_km", "loja_lat", "loja_lng"])
    const cfg = Object.fromEntries((linhas ?? []).map((l: any) => [l.key, l.value]))
    const porKm = Number(cfg.delivery_fee_per_km ?? 2)
    const maxKm = Number(cfg.delivery_max_km ?? 10)
    const loja = { lat: Number(cfg.loja_lat ?? -5.7352728), lng: Number(cfg.loja_lng ?? -35.2321784) }

    const doCliente = { lat: Number(corpo.lat), lng: Number(corpo.lng) }
    const clienteValido = Number.isFinite(doCliente.lat) && Number.isFinite(doCliente.lng) &&
      doCliente.lat !== 0 && linhaReta(loja, doCliente) <= RAIO_CLIENTE_KM

    let km: number | null = null
    let metodo = ""
    let destino: Ponto | null = null

    // 1) Google, pelo endereço com número (reaproveita a cotação do mesmo CEP e número)
    if (GOOGLE_KEY) {
      const { data: igual } = await supabase.from("entrega_cotacoes").select("km")
        .eq("cep", cep).eq("numero", numero).eq("metodo", "google").gt("criada_em", recente())
        .order("criada_em", { ascending: false }).limit(1).maybeSingle()
      const g = igual
        ? Number(igual.km)
        : await kmPeloGoogle(loja, await enderecoPorExtenso(cep, rua, numero, bairro))
      if (g != null) {
        km = Math.round(g * 10) / 10
        metodo = "google"
        destino = clienteValido ? doCliente : null
      }
    }

    // 2) mapa aberto: coordenada do CEP + rota do OSRM
    if (km == null) {
      const { data: anterior } = await supabase.from("entrega_cotacoes").select("km, lat, lng")
        .eq("cep", cep).eq("metodo", "rota").gt("criada_em", recente())
        .order("criada_em", { ascending: false }).limit(1).maybeSingle()
      if (anterior) {
        km = Number(anterior.km)
        metodo = "rota"
        destino = { lat: Number(anterior.lat), lng: Number(anterior.lng) }
      } else {
        destino = await coordenadaDoCep(cep)
        let daqui = true
        if (!destino && clienteValido) {
          destino = doCliente
          daqui = false
        }
        if (!destino) return json({ erro: "cep-nao-encontrado", falhas }, 404)
        const r = await kmDeCarro(loja, destino)
        km = Math.round(r.km * 10) / 10
        // só a rota com coordenada achada aqui é reaproveitada para o mesmo CEP
        metodo = daqui ? r.metodo : `${r.metodo}-cliente`
      }
    }

    const taxa = Math.round(km * porKm * 100) / 100
    const dentro_area = km <= maxKm

    const { data: cot, error } = await supabase.from("entrega_cotacoes").insert({
      cep, numero, lat: destino?.lat ?? null, lng: destino?.lng ?? null, km, taxa, dentro_area, metodo,
    }).select("id").single()
    if (error) throw error

    return json({ id: cot.id, km, taxa, dentro_area, max_km: maxKm, por_km: porKm, metodo, falhas })
  } catch (e) {
    console.error("calcular-entrega:", e)
    return json({ erro: "falha", detalhe: String((e as Error)?.message ?? e) }, 500)
  }
})
