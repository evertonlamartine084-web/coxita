import { useCallback, useEffect, useMemo, useState } from 'react'
import { HiMap, HiRefresh } from 'react-icons/hi'
import { FaWhatsapp } from 'react-icons/fa'
import toast from 'react-hot-toast'
import { supabase } from '../../services/supabase'
import { getSettings } from '../../services/settings'
import { formatCurrency, STATUS_LABELS, STATUS_COLORS } from '../../utils/format'
import { dataLocal } from '../../utils/funcionamento'
import Badge from '../../components/ui/Badge'

/**
 * Rotas de entrega do dia.
 *
 * Lista as entregas do dia pela ordem do horário marcado e calcula a melhor ordem de visita
 * saindo da loja e voltando para ela (Valhalla público, o mesmo serviço grátis que mede a taxa).
 * A ordem mais curta pode não bater com os horários marcados: por isso cada parada mostra a
 * chegada prevista e avisa quando ela passa do horário do cliente.
 *
 * A coordenada de cada entrega vem da cotação do CEP, gravada no pedido. Pedido antigo ou
 * lançado no painel não tem: aí ela é buscada pelo CEP, aqui no navegador.
 */

const DIA = 24 * 60 * 60 * 1000
const PARADA_MIN = 4 // minutos parado em cada entrega
const hhmm = d => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

function distanciaKm(a, b) {
  const rad = x => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

async function coordenadaDoCep(cep) {
  const limpo = String(cep ?? '').replace(/\D/g, '')
  if (limpo.length !== 8) return null
  const chave = `cep-coord:${limpo}`
  try {
    const guardada = sessionStorage.getItem(chave)
    if (guardada) return JSON.parse(guardada)
  } catch { /* sem armazenamento */ }
  try {
    const r = await fetch(`https://cep.awesomeapi.com.br/json/${limpo}`)
    if (!r.ok) return null
    const d = await r.json()
    const c = Number(d.lat) && Number(d.lng) ? { lat: Number(d.lat), lng: Number(d.lng) } : null
    if (c) try { sessionStorage.setItem(chave, JSON.stringify(c)) } catch { /* sem armazenamento */ }
    return c
  } catch {
    return null
  }
}

/**
 * Melhor ordem de visita: loja → paradas → loja. Devolve { ordem: [índices das paradas],
 * pernas: [{ km, min }] (uma a mais que as paradas: a volta), fonte }.
 */
async function otimizarRota(loja, paradas) {
  const locais = [loja, ...paradas, loja].map(p => ({ lat: p.lat, lon: p.lng }))
  try {
    const json = encodeURIComponent(JSON.stringify({ locations: locais, costing: 'auto', units: 'kilometers' }))
    const r = await fetch(`https://valhalla1.openstreetmap.de/optimized_route?json=${json}`)
    if (!r.ok) throw new Error(`valhalla ${r.status}`)
    const { trip } = await r.json()
    const ordem = trip.locations.slice(1, -1).map(l => l.original_index - 1)
    const pernas = trip.legs.map(l => ({ km: l.summary.length, min: l.summary.time / 60 }))
    return { ordem, pernas, fonte: 'ruas' }
  } catch (e) {
    console.warn('Rota pelo Valhalla falhou, usando linha reta:', e)
  }
  // reserva: vizinho mais próximo em linha reta, com 30% a mais de caminho e 25 km/h
  const restantes = paradas.map((p, i) => i)
  const ordem = []
  let atual = loja
  while (restantes.length) {
    restantes.sort((a, b) => distanciaKm(atual, paradas[a]) - distanciaKm(atual, paradas[b]))
    const prox = restantes.shift()
    ordem.push(prox)
    atual = paradas[prox]
  }
  const pontos = [loja, ...ordem.map(i => paradas[i]), loja]
  const pernas = pontos.slice(1).map((p, i) => {
    const km = distanciaKm(pontos[i], p) * 1.3
    return { km, min: (km / 25) * 60 }
  })
  return { ordem, pernas, fonte: 'estimada' }
}

export default function RotasPage() {
  const [dia, setDia] = useState(() => dataLocal())
  const [pedidos, setPedidos] = useState(null)
  const [coords, setCoords] = useState({})
  const [loja, setLoja] = useState(null)
  const [selecionados, setSelecionados] = useState(new Set())
  const [saida, setSaida] = useState('')
  const [rota, setRota] = useState(null)
  const [calculando, setCalculando] = useState(false)

  useEffect(() => {
    getSettings().then(s => {
      const lat = Number(s.loja_lat)
      const lng = Number(s.loja_lng)
      if (lat && lng) setLoja({ lat, lng })
    }).catch(() => {})
  }, [])

  const carregar = useCallback(async () => {
    const ini = new Date(`${dia}T00:00:00`)
    const fim = new Date(+ini + DIA)
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, customer_name, customer_phone, address, address_number, address_complement, neighborhood, address_reference, address_cep, scheduled_for, created_at, status, total, payment_method, entrega_lat, entrega_lng')
      .eq('delivery_type', 'entrega')
      .neq('status', 'cancelado')
      .or(`and(scheduled_for.gte.${ini.toISOString()},scheduled_for.lt.${fim.toISOString()}),and(scheduled_for.is.null,created_at.gte.${ini.toISOString()},created_at.lt.${fim.toISOString()})`)
    if (error) { toast.error(`Não foi possível carregar: ${error.message}`); setPedidos([]); return }
    const lista = (data ?? []).sort((a, b) => new Date(a.scheduled_for ?? a.created_at) - new Date(b.scheduled_for ?? b.created_at))
    setPedidos(lista)
    setSelecionados(new Set(lista.filter(o => o.status !== 'entregue').map(o => o.id)))
    setRota(null)

    const novas = {}
    for (const o of lista) {
      novas[o.id] = o.entrega_lat && o.entrega_lng
        ? { lat: Number(o.entrega_lat), lng: Number(o.entrega_lng), pelo: 'endereco' }
        : await coordenadaDoCep(o.address_cep).then(c => (c ? { ...c, pelo: 'cep' } : null))
    }
    setCoords(novas)
  }, [dia])

  useEffect(() => { carregar() }, [carregar])

  const escolhidos = useMemo(
    () => (pedidos ?? []).filter(o => selecionados.has(o.id)),
    [pedidos, selecionados],
  )
  const semCoordenada = escolhidos.filter(o => !coords[o.id])

  const alternar = (id) => setSelecionados(atual => {
    const novo = new Set(atual)
    if (novo.has(id)) novo.delete(id); else novo.add(id)
    return novo
  })

  const calcular = async () => {
    if (!loja) return toast.error('Falta a localização da loja em Configurações.')
    const paradas = escolhidos.filter(o => coords[o.id])
    if (!paradas.length) return toast.error('Marque ao menos uma entrega com endereço encontrado.')
    setCalculando(true)
    try {
      const r = await otimizarRota(loja, paradas.map(o => coords[o.id]))
      // saída: a escolhida; senão 20 min antes da 1ª entrega marcada, mas nunca antes de agora
      let inicio
      if (saida) inicio = new Date(`${dia}T${saida}`)
      else {
        const primeira = Math.min(...paradas.map(o => +new Date(o.scheduled_for ?? o.created_at)))
        inicio = new Date(Math.max(Date.now(), primeira - 20 * 60 * 1000))
      }
      let t = +inicio
      const passos = r.ordem.map((i, n) => {
        t += r.pernas[n].min * 60 * 1000
        const chegada = new Date(t)
        t += PARADA_MIN * 60 * 1000
        return { pedido: paradas[i], km: r.pernas[n].km, min: r.pernas[n].min, chegada }
      })
      const volta = r.pernas[r.pernas.length - 1]
      setRota({
        passos,
        inicio,
        fonte: r.fonte,
        totalKm: r.pernas.reduce((s, p) => s + p.km, 0),
        retorno: new Date(t + volta.min * 60 * 1000),
      })
    } finally {
      setCalculando(false)
    }
  }

  const linkMaps = () => {
    const p = c => `${c.lat},${c.lng}`
    const pontos = rota.passos.map(s => p(coords[s.pedido.id]))
    const params = new URLSearchParams({
      api: '1',
      origin: p(loja),
      destination: p(loja),
      waypoints: pontos.join('|'),
      travelmode: 'driving',
    })
    return `https://www.google.com/maps/dir/?${params}`
  }

  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i)
    return { data: dataLocal(d), rotulo: i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) }
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">Rotas de entrega</h1>
        <button type="button" onClick={carregar}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-semibold hover:bg-bg-warm">
          <HiRefresh className="size-4" /> Atualizar
        </button>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {dias.map(d => (
          <button key={d.data} type="button" onClick={() => setDia(d.data)}
            className={`shrink-0 cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold capitalize ${
              dia === d.data ? 'bg-primary text-white' : 'bg-white text-text-light ring-1 ring-border hover:bg-bg-warm'
            }`}>
            {d.rotulo}
          </button>
        ))}
        <input type="date" value={dia} onChange={e => e.target.value && setDia(e.target.value)}
          className="shrink-0 rounded-lg border border-border bg-white px-2 py-1 text-sm" aria-label="Outro dia" />
      </div>

      {/* Entregas do dia */}
      <section className="rounded-xl border border-border bg-white p-4 sm:p-5">
        <h2 className="text-lg font-semibold">Entregas do dia</h2>
        <p className="text-sm text-text-light">Marque as que vão nesta saída. Já entregues ficam desmarcadas.</p>
        {pedidos === null ? (
          <p className="mt-4 text-sm text-text-light">Carregando…</p>
        ) : pedidos.length === 0 ? (
          <p className="mt-4 text-sm text-text-light">Nenhuma entrega neste dia.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {pedidos.map(o => (
              <li key={o.id}>
                <label className="flex cursor-pointer items-start gap-3 py-3">
                  <input type="checkbox" checked={selecionados.has(o.id)} onChange={() => alternar(o.id)} className="mt-1 size-4 accent-primary" />
                  <span className="w-12 shrink-0 font-bold tabular-nums">
                    {o.scheduled_for ? hhmm(new Date(o.scheduled_for)) : 'Agora'}
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block"><strong>#{o.order_number}</strong> {o.customer_name}</span>
                    <span className="block text-text-light">
                      {[o.address, o.address_number].filter(Boolean).join(', ')}{o.neighborhood ? ` · ${o.neighborhood}` : ''}
                    </span>
                    {!coords[o.id] && pedidos && (
                      <span className="block text-xs font-semibold text-danger">Endereço não encontrado no mapa</span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <Badge className={STATUS_COLORS[o.status]}>{STATUS_LABELS[o.status]}</Badge>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {pedidos?.length > 0 && (
          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
            <label className="text-sm">
              <span className="mb-1 block text-text-light">Saída da loja</span>
              <input type="time" value={saida} onChange={e => setSaida(e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5" />
            </label>
            <button type="button" onClick={calcular} disabled={calculando || !escolhidos.length}
              className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50">
              {calculando ? 'Calculando…' : `Calcular melhor rota (${escolhidos.length})`}
            </button>
            {semCoordenada.length > 0 && (
              <p className="w-full text-xs text-danger">
                {semCoordenada.length} entrega(s) sem endereço no mapa ficam fora da rota: {semCoordenada.map(o => `#${o.order_number}`).join(', ')}.
              </p>
            )}
          </div>
        )}
      </section>

      {rota && (
        <section className="rounded-xl border border-border bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Melhor rota</h2>
              <p className="text-sm text-text-light">
                Sai {hhmm(rota.inicio)} · {rota.totalKm.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km · volta à loja por volta de {hhmm(rota.retorno)}
                {rota.fonte === 'estimada' && ' · estimada em linha reta (o serviço de mapa não respondeu)'}
              </p>
            </div>
            <a href={linkMaps()} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-light">
              <HiMap className="size-4" /> Abrir no Google Maps
            </a>
          </div>

          <ol className="mt-4 space-y-3">
            {rota.passos.map((s, n) => {
              const o = s.pedido
              const marcado = o.scheduled_for ? new Date(o.scheduled_for) : null
              const atraso = marcado ? (s.chegada - marcado) / 60000 : 0
              const c = coords[o.id]
              const fone = String(o.customer_phone ?? '').replace(/\D/g, '')
              return (
                <li key={o.id} className="flex gap-3 rounded-lg border border-border p-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-white">{n + 1}</span>
                  <div className="min-w-0 flex-1 text-sm">
                    <p><strong>#{o.order_number}</strong> {o.customer_name} · {formatCurrency(o.total)}</p>
                    <p className="text-text-light">
                      {[o.address, o.address_number, o.address_complement].filter(Boolean).join(', ')}{o.neighborhood ? ` · ${o.neighborhood}` : ''}
                      {o.address_reference ? ` · ${o.address_reference}` : ''}
                    </p>
                    <p className="mt-1">
                      Chega ~<strong>{hhmm(s.chegada)}</strong>
                      {marcado && <> · marcado {hhmm(marcado)}</>}
                      <span className="text-text-light"> · {s.km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km da parada anterior</span>
                    </p>
                    {atraso > 30 && <p className="font-semibold text-danger">Passa {Math.round(atraso - 30)} min da janela dele (até {hhmm(new Date(+marcado + 30 * 60000))})</p>}
                    {atraso < -15 && <p className="font-semibold text-yellow-700">Chega {Math.round(-atraso)} min antes do horário: avise o cliente</p>}
                    {c?.pelo === 'cep' && <p className="text-xs text-text-light">Localização aproximada, pelo CEP</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a href={`https://waze.com/ul?ll=${c.lat},${c.lng}&navigate=yes`} target="_blank" rel="noreferrer"
                        className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold hover:bg-bg-warm">Waze</a>
                      {fone && (
                        <a href={`https://wa.me/55${fone}`} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold hover:bg-bg-warm">
                          <FaWhatsapp className="size-3.5" /> WhatsApp
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
          <p className="mt-3 text-xs text-text-light">
            Tempo de carro pelo mapa, mais {PARADA_MIN} min em cada parada. A ordem é a mais curta; se algum cliente tiver que ser atendido antes, desmarque e faça duas saídas.
          </p>
        </section>
      )}
    </div>
  )
}
