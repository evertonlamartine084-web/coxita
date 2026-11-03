import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { HiExternalLink, HiRefresh, HiX, HiPencil, HiSearch, HiChevronDown, HiChevronUp } from 'react-icons/hi'
import Button from '../../components/ui/Button'
import Loading from '../../components/ui/Loading'
import { formatCurrency } from '../../utils/format'
import { getInsumos } from '../../services/custos'
import { carregarOndeComprar, buscarAgora, salvarBusca, ignorarProduto } from '../../services/ondeComprar'
import { precoAtual, lojaDaOrigem } from '../../utils/precosDosInsumos'

/**
 * Onde comprar (02/11/2026), com cara de loja (03/11): o robô cotar-mercados procura todo dia às
 * 6h30 o preço de cada insumo nas lojas de Natal com loja online aberta (Atacadão Natal Sul, as
 * cinco do Nordestão e o Favorito Ponta Negra). Cada insumo vira uma prateleira com os produtos
 * achados, o mais barato por kg/L primeiro, contra o que se paga hoje.
 *
 * Vale a pena: 10% ou mais abaixo do que se paga hoje. "Menor em 30 dias": o melhor de hoje é o
 * menor que o robô já viu no mês.
 */

const VALE_A_PENA = 0.9
const NA_PRATELEIRA = 6

const porUnidade = (valor, unidade) => `${formatCurrency(valor)}/${unidade}`
const lista = (texto) => texto.split(',').map(s => s.trim()).filter(Boolean)
// "Nordestão Santa Catarina" -> rede "Nordestão", loja "Santa Catarina"
const redeDe = (mercado) => (mercado.startsWith('Nordestão') ? 'Nordestão' : mercado)
// Atacadão e Favorito têm uma loja online só cada um
const LOJA_UNICA = { 'Atacadão': 'Natal Sul', 'Favorito': 'Ponta Negra' }
const lojaDe = (mercado) => LOJA_UNICA[mercado] ?? (mercado.replace(/^Nordestão\s*/, '') || null)

const COR_DA_REDE = {
  'Atacadão': 'bg-red-600 text-white',
  'Nordestão': 'bg-blue-700 text-white',
  'Favorito': 'bg-emerald-600 text-white',
}

/**
 * O mesmo produto nas cinco lojas do Nordestão vira um cartão só, com o menor preço e as lojas
 * que têm esse preço.
 */
function agruparPorProduto(produtos) {
  const grupos = new Map()
  for (const p of produtos) {
    const chave = `${redeDe(p.mercado)}|${p.produto_id}`
    const g = grupos.get(chave)
    if (!g) grupos.set(chave, { ...p, rede: redeDe(p.mercado), lojas: [p.mercado], lojasMaisBaratas: [p.mercado] })
    else {
      g.lojas.push(p.mercado)
      if (Number(p.preco_unidade) < Number(g.preco_unidade)) Object.assign(g, { ...p, rede: g.rede, lojas: g.lojas, lojasMaisBaratas: [p.mercado] })
      else if (Number(p.preco_unidade) === Number(g.preco_unidade)) g.lojasMaisBaratas.push(p.mercado)
    }
  }
  return [...grupos.values()].sort((a, b) => a.preco_unidade - b.preco_unidade)
}

function SeloRede({ rede }) {
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${COR_DA_REDE[rede] ?? 'bg-gray-700 text-white'}`}>{rede}</span>
}

const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const daMarcaDeVoces = (produto, marcas) => (marcas ?? []).some(m => semAcento(produto).includes(semAcento(m)))

function Cartao({ p, unidade, pago, marcas, aoIgnorar, destaque = false }) {
  const diferenca = pago ? (Number(p.preco_unidade) / pago - 1) * 100 : null
  const mesmaMarca = daMarcaDeVoces(p.produto, marcas)
  const maisBarato = diferenca != null && diferenca <= -10
  const lojas = p.lojasMaisBaratas.map(lojaDe).filter(Boolean)
  return (
    <div className={`group relative flex w-44 shrink-0 flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md sm:w-auto ${destaque ? 'border-green-400 ring-1 ring-green-300' : 'border-gray-200'}`}>
      <div className="relative flex aspect-square items-center justify-center bg-white p-3">
        {p.imagem
          ? <img src={p.imagem} alt="" loading="lazy" className="h-full w-full object-contain" />
          : <div className="h-full w-full rounded-lg bg-gray-100" />}
        {diferenca != null && (
          <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${maisBarato ? 'bg-green-600 text-white' : diferenca < 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
            {diferenca < 0 ? '−' : '+'}{Math.abs(Math.round(diferenca))}%
          </span>
        )}
        <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
          {p.preco_original && <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Oferta</span>}
          {mesmaMarca && <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-950">★ A de vocês</span>}
        </div>
        <button
          type="button"
          onClick={() => aoIgnorar(p)}
          title="Não é isso: tirar este produto"
          className="absolute right-1.5 top-1.5 cursor-pointer rounded-full bg-white/90 p-1 text-gray-400 shadow-sm hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <HiX size={14} />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-1 border-t border-gray-100 p-2.5">
        <div className="flex flex-wrap items-center gap-1">
          <SeloRede rede={p.rede} />
          {lojas.length > 0 && (
            <span className="truncate text-[11px] text-gray-500">{lojas.length === p.lojas.length && lojas.length > 1 ? 'todas as lojas' : lojas.join(', ')}</span>
          )}
        </div>
        <p className="line-clamp-2 min-h-[2.5rem] text-sm leading-tight text-gray-800">{p.produto}</p>
        <div className="mt-auto">
          {p.preco_original && <p className="text-xs text-gray-400 line-through tabular-nums">{formatCurrency(p.preco_original)}</p>}
          <p className="text-lg font-extrabold leading-none text-gray-900 tabular-nums">{formatCurrency(p.preco)}</p>
          <p className={`mt-0.5 text-xs font-semibold tabular-nums ${maisBarato ? 'text-green-700' : 'text-gray-500'}`}>{porUnidade(p.preco_unidade, unidade)}</p>
        </div>
        {p.link && (
          <a href={p.link} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center justify-center gap-1 rounded-lg border border-gray-200 py-1.5 text-xs font-semibold text-gray-700 hover:border-primary hover:text-primary">
            Ver no site <HiExternalLink />
          </a>
        )}
      </div>
    </div>
  )
}

function EditarBusca({ busca, aoSalvar, aoCancelar }) {
  const [f, setF] = useState({
    termos: busca?.termos ?? '',
    comeca: (busca?.comeca ?? []).join(', '),
    excluir: (busca?.excluir ?? []).join(', '),
  })
  const campo = 'w-full rounded-lg border border-gray-200 px-3 py-2'
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
      <label className="block">
        <span className="mb-1 block font-medium">O que buscar no site (separe com ;)</span>
        <input value={f.termos} onChange={e => setF({ ...f, termos: e.target.value })} className={campo} />
      </label>
      <label className="block">
        <span className="mb-1 block font-medium">O nome começa com (separe com vírgula)</span>
        <input value={f.comeca} onChange={e => setF({ ...f, comeca: e.target.value })} className={campo} />
      </label>
      <label className="block">
        <span className="mb-1 block font-medium">Não pode ter no nome (separe com vírgula)</span>
        <input value={f.excluir} onChange={e => setF({ ...f, excluir: e.target.value })} className={campo} />
      </label>
      <div className="flex gap-2">
        <Button onClick={() => aoSalvar({ termos: f.termos.trim(), comeca: lista(f.comeca), excluir: lista(f.excluir) })}>Salvar e buscar</Button>
        <Button variant="secondary" onClick={aoCancelar}>Cancelar</Button>
      </div>
    </div>
  )
}

export default function OndeComprarPage() {
  const [dados, setDados] = useState(null)
  const [insumos, setInsumos] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [editando, setEditando] = useState(null)
  const [aberto, setAberto] = useState(null)
  const [filtro, setFiltro] = useState('')
  const [rede, setRede] = useState('')

  const carregar = useCallback(() => {
    Promise.all([carregarOndeComprar(), getInsumos()])
      .then(([d, i]) => { setDados(d); setInsumos(i.filter(x => x.kind === 'insumo')) })
      .catch(e => toast.error(e.message || 'Erro ao carregar.'))
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const redes = useMemo(() => [...new Set((dados?.precos ?? []).map(p => redeDe(p.mercado)))].sort(), [dados])

  const prateleiras = useMemo(() => {
    if (!dados) return []
    const buscaDe = new Map(dados.buscas.map(b => [b.supply_id, b]))
    const minimoDe = new Map(dados.minimos.map(m => [m.supply_id, m]))
    return insumos
      .filter(i => buscaDe.has(i.id))
      .map(i => {
        const produtos = agruparPorProduto(dados.precos.filter(p => p.supply_id === i.id && (!rede || redeDe(p.mercado) === rede)))
        const melhor = produtos[0] ?? null
        const pago = precoAtual(i)
        const min = minimoDe.get(i.id)
        return {
          insumo: i,
          busca: buscaDe.get(i.id),
          produtos,
          melhor,
          pago,
          economia: melhor && pago ? 1 - Number(melhor.preco_unidade) / pago : null,
          menorEm30: melhor && min && min.dias > 1 && Number(melhor.preco_unidade) <= Number(min.menor),
        }
      })
      .filter(l => !filtro || l.insumo.name.toLowerCase().includes(filtro.toLowerCase()))
      .sort((a, b) => (b.economia ?? -9) - (a.economia ?? -9))
  }, [dados, insumos, filtro, rede])

  const ofertas = prateleiras.filter(l => l.melhor && l.pago && Number(l.melhor.preco_unidade) <= l.pago * VALE_A_PENA)

  const rodarAgora = async (supplyId = null) => {
    setBuscando(true)
    try {
      const r = await buscarAgora(supplyId)
      toast.success(`${r.precos} preços lidos${r.erros?.length ? `, ${r.erros.length} erro(s)` : ''}.`)
      carregar()
    } catch (e) {
      toast.error(e.message || 'O robô não respondeu.')
    } finally {
      setBuscando(false)
    }
  }

  const ignorar = async (p) => {
    try {
      await ignorarProduto(p, p.lojas)
      setDados(d => ({ ...d, precos: d.precos.filter(x => !(x.supply_id === p.supply_id && p.lojas.includes(x.mercado) && x.produto_id === p.produto_id)) }))
      toast.success('Produto tirado deste insumo.')
    } catch (e) {
      toast.error(e.message || 'Não deu para tirar.')
    }
  }

  const salvar = async (supplyId, campos) => {
    try {
      await salvarBusca(supplyId, campos)
      setEditando(null)
      await rodarAgora(supplyId)
    } catch (e) {
      toast.error(e.message || 'Não deu para salvar a busca.')
    }
  }

  if (!dados) return <Loading />

  return (
    <div>
      <div className="mb-4 overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-orange-600 p-5 text-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold">Onde comprar</h1>
            <p className="mt-1 max-w-xl text-sm text-white/90">
              Os insumos da Coxelli nos mercados de Natal, por kg ou litro, contra o que vocês pagam hoje. O robô passa nas lojas todo dia às 6h30.
            </p>
          </div>
          <button type="button" onClick={() => rodarAgora()} disabled={buscando}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-primary shadow-sm disabled:opacity-70">
            <HiRefresh className={buscando ? 'animate-spin' : ''} /> {buscando ? 'Buscando…' : 'Buscar agora'}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="rounded-full bg-white/20 px-2 py-0.5">Atacadão Natal Sul</span>
          <span className="rounded-full bg-white/20 px-2 py-0.5">Nordestão: Santa Catarina, Lagoa Nova, Ponta Negra, Nova Parnamirim e Tirol</span>
          <span className="rounded-full bg-white/20 px-2 py-0.5">Favorito Ponta Negra</span>
        </div>
        {dados.rodada && (
          <p className="mt-2 text-xs text-white/80">
            Última passada: {new Date(dados.rodada.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            {' · '}{dados.precos.length} preços{dados.rodada.erros?.length ? ` · ${dados.rodada.erros.length} erro(s)` : ''}
          </p>
        )}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[12rem] flex-1">
          <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Procurar insumo…"
            className="w-full rounded-full border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
        </label>
        {['', ...redes].map(r => (
          <button key={r || 'todas'} type="button" onClick={() => setRede(r)}
            className={`cursor-pointer rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${rede === r ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {r || 'Todos'}
          </button>
        ))}
      </div>

      <section className="mb-8">
        <h2 className="mb-1 text-lg font-bold text-gray-900">🔥 Vale a pena hoje</h2>
        <p className="mb-3 text-sm text-gray-500">10% ou mais abaixo do que vocês pagam.</p>
        {ofertas.length === 0
          ? <p className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">Nada abaixo do que vocês pagam hoje.</p>
          : (
            <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-4 xl:grid-cols-5">
              {ofertas.map(l => (
                <div key={l.insumo.id} className="flex w-44 shrink-0 flex-col sm:w-auto">
                  <p className="mb-1 truncate text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {l.insumo.name}{l.menorEm30 && <span className="ml-1 normal-case text-green-700">· menor em 30 dias</span>}
                  </p>
                  <Cartao p={l.melhor} unidade={l.insumo.unit} pago={l.pago} marcas={l.busca?.marcas} aoIgnorar={ignorar} destaque />
                  <p className="mt-1 text-[11px] text-gray-500 tabular-nums">vocês pagam {porUnidade(l.pago, l.insumo.unit)}</p>
                </div>
              ))}
            </div>
          )}
      </section>

      <h2 className="mb-3 text-lg font-bold text-gray-900">Prateleiras</h2>
      <div className="space-y-6">
        {prateleiras.map(l => {
          const tudo = aberto === l.insumo.id
          const vistos = tudo ? l.produtos : l.produtos.slice(0, NA_PRATELEIRA)
          return (
            <section key={l.insumo.id} className="rounded-2xl border border-gray-200 bg-gray-50/60 p-3 sm:p-4">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-gray-900">{l.insumo.name}</h3>
                  {l.busca?.descricao && <p className="text-xs font-medium text-gray-700">O que vocês compram: {l.busca.descricao}</p>}
                  <p className="text-xs text-gray-500 tabular-nums">
                    vocês pagam <strong className="text-gray-700">{l.pago ? porUnidade(l.pago, l.insumo.unit) : '—'}</strong>
                    {lojaDaOrigem(l.insumo.preco_origem) ? ` no ${lojaDaOrigem(l.insumo.preco_origem)}` : ''}
                    {l.produtos.length > 0 && ` · ${l.produtos.length} ${l.produtos.length === 1 ? 'produto' : 'produtos'}`}
                  </p>
                </div>
                <button type="button" onClick={() => setEditando(editando === l.insumo.id ? null : l.insumo.id)}
                  className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-primary">
                  <HiPencil /> Mudar a busca
                </button>
              </div>

              {editando === l.insumo.id && (
                <EditarBusca busca={l.busca} aoSalvar={campos => salvar(l.insumo.id, campos)} aoCancelar={() => setEditando(null)} />
              )}

              {l.produtos.length === 0
                ? <p className="text-sm text-gray-500">Nenhum mercado{rede ? ` do ${rede}` : ''} tem hoje este produto como vocês compram (costuma ser coisa de distribuidora).</p>
                : (
                  <>
                    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-4 xl:grid-cols-6">
                      {vistos.map(p => (
                        <Cartao key={`${p.rede}|${p.produto_id}`} p={p} unidade={l.insumo.unit} pago={l.pago} marcas={l.busca?.marcas} aoIgnorar={ignorar} />
                      ))}
                    </div>
                    {l.produtos.length > NA_PRATELEIRA && (
                      <button type="button" onClick={() => setAberto(tudo ? null : l.insumo.id)}
                        className="mt-2 inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-gray-600 hover:text-primary">
                        {tudo ? <>Mostrar menos <HiChevronUp /></> : <>Ver os {l.produtos.length} produtos <HiChevronDown /></>}
                      </button>
                    )}
                  </>
                )}
            </section>
          )
        })}
      </div>

      <p className="mt-8 text-xs text-gray-400">
        Assaí e Carrefour bloqueiam robô no site; Super Fácil, Mar Vermelho e Rede Mais não vendem online. Preço de loja online pode mudar no caixa.
      </p>
    </div>
  )
}
