import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { HiExternalLink, HiRefresh, HiX, HiChevronDown, HiChevronUp, HiPencil } from 'react-icons/hi'
import Button from '../../components/ui/Button'
import Loading from '../../components/ui/Loading'
import { formatCurrency } from '../../utils/format'
import { getInsumos } from '../../services/custos'
import { carregarOndeComprar, buscarAgora, salvarBusca, ignorarProduto } from '../../services/ondeComprar'
import { precoAtual, lojaDaOrigem } from '../../utils/precosDosInsumos'

/**
 * Onde comprar (02/11/2026): o robô cotar-mercados procura todo dia às 6h30 o preço de cada insumo
 * no Atacadão, no Nordestão e no Favorito (os mercados de Natal com loja online aberta). Aqui, o mais barato de
 * hoje contra o que se paga, e a oferta que vale a pena em destaque.
 *
 * Vale a pena: 10% ou mais abaixo do que se paga hoje. "Menor em 30 dias": o melhor de hoje é o
 * menor que o robô já viu no mês.
 */

const VALE_A_PENA = 0.9

const porUnidade = (valor, unidade) => `${formatCurrency(valor)}/${unidade}`
const lista = (texto) => texto.split(',').map(s => s.trim()).filter(Boolean)

function EditarBusca({ busca, aoSalvar, aoCancelar }) {
  const [f, setF] = useState({
    termos: busca?.termos ?? '',
    comeca: (busca?.comeca ?? []).join(', '),
    excluir: (busca?.excluir ?? []).join(', '),
  })
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
      <label className="block">
        <span className="mb-1 block font-medium">O que buscar no site (separe com ;)</span>
        <input value={f.termos} onChange={e => setF({ ...f, termos: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2" />
      </label>
      <label className="block">
        <span className="mb-1 block font-medium">O nome começa com (separe com vírgula)</span>
        <input value={f.comeca} onChange={e => setF({ ...f, comeca: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2" />
      </label>
      <label className="block">
        <span className="mb-1 block font-medium">Não pode ter no nome (separe com vírgula)</span>
        <input value={f.excluir} onChange={e => setF({ ...f, excluir: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2" />
      </label>
      <div className="flex gap-2">
        <Button onClick={() => aoSalvar({ termos: f.termos.trim(), comeca: lista(f.comeca), excluir: lista(f.excluir) })}>Salvar e buscar</Button>
        <Button variant="secondary" onClick={aoCancelar}>Cancelar</Button>
      </div>
    </div>
  )
}

function Produto({ p, unidade, pago, aoIgnorar }) {
  const diferenca = pago ? (p.preco_unidade / pago - 1) * 100 : null
  return (
    <li className="flex items-start gap-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900">
          {p.produto}
          {p.preco_original && <span className="ml-1 rounded bg-red-100 px-1 text-[11px] font-semibold text-red-700">oferta</span>}
        </p>
        <p className="text-xs text-gray-500 tabular-nums">
          {p.mercado} · {formatCurrency(p.preco)}
          {p.preco_original && <span className="line-through"> {formatCurrency(p.preco_original)}</span>}
          {' · '}<strong className="text-gray-800">{porUnidade(p.preco_unidade, unidade)}</strong>
          {diferenca != null && (
            <span className={diferenca < 0 ? 'text-green-700' : 'text-gray-400'}> ({diferenca < 0 ? '' : '+'}{diferenca.toFixed(0)}%)</span>
          )}
        </p>
      </div>
      {p.link && (
        <a href={p.link} target="_blank" rel="noreferrer" className="shrink-0 p-1 text-gray-400 hover:text-primary" title="Abrir no site do mercado">
          <HiExternalLink size={16} />
        </a>
      )}
      <button type="button" onClick={() => aoIgnorar(p)} className="shrink-0 cursor-pointer p-1 text-gray-400 hover:text-red-600" title="Não é isso: tirar este produto">
        <HiX size={16} />
      </button>
    </li>
  )
}

export default function OndeComprarPage() {
  const [dados, setDados] = useState(null)
  const [insumos, setInsumos] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [aberto, setAberto] = useState(null)
  const [editando, setEditando] = useState(null)

  const carregar = useCallback(() => {
    Promise.all([carregarOndeComprar(), getInsumos()])
      .then(([d, i]) => { setDados(d); setInsumos(i.filter(x => x.kind === 'insumo')) })
      .catch(e => toast.error(e.message || 'Erro ao carregar.'))
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const linhas = useMemo(() => {
    if (!dados) return []
    const buscaDe = new Map(dados.buscas.map(b => [b.supply_id, b]))
    return insumos
      .filter(i => buscaDe.has(i.id))
      .map(i => {
        const doInsumo = dados.precos.filter(p => p.supply_id === i.id)
        const hoje = doInsumo.filter(p => p.visto_em === dados.hoje)
        // sem rodada hoje ainda (antes das 6h30), mostra a mais recente
        const ultimoDia = doInsumo.reduce((m, p) => (p.visto_em > m ? p.visto_em : m), '')
        const doDia = hoje.length ? hoje : doInsumo.filter(p => p.visto_em === ultimoDia)
        const melhor = doDia[0] ?? null
        const menorDoMes = doInsumo.reduce((m, p) => Math.min(m, Number(p.preco_unidade)), Infinity)
        const pago = precoAtual(i)
        return {
          insumo: i,
          busca: buscaDe.get(i.id),
          produtos: doDia,
          melhor,
          pago,
          economia: melhor && pago ? 1 - Number(melhor.preco_unidade) / pago : null,
          menorEm30: melhor && Number(melhor.preco_unidade) <= menorDoMes && doInsumo.some(p => p.visto_em !== melhor.visto_em),
        }
      })
      .sort((a, b) => (b.economia ?? -9) - (a.economia ?? -9))
  }, [dados, insumos])

  const ofertas = linhas.filter(l => l.melhor && l.pago && Number(l.melhor.preco_unidade) <= l.pago * VALE_A_PENA)

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
      await ignorarProduto(p)
      setDados(d => ({ ...d, precos: d.precos.filter(x => !(x.supply_id === p.supply_id && x.mercado === p.mercado && x.produto_id === p.produto_id)) }))
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
      <div className="mb-2 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Onde comprar</h1>
        <Button variant="secondary" onClick={() => rodarAgora()} disabled={buscando}>
          <HiRefresh className={`mr-1 inline ${buscando ? 'animate-spin' : ''}`} /> {buscando ? 'Buscando…' : 'Buscar agora'}
        </Button>
      </div>
      <p className="mb-6 text-sm text-gray-500">
        Todo dia às 6h30 o robô procura os insumos nas lojas de Natal do Atacadão (Natal Sul), do Nordestão (Santa Catarina, Lagoa Nova, Ponta Negra, Nova Parnamirim e Tirol) e do Favorito (Ponta Negra), com o estoque delas,
        e compara, por kg ou litro, com o que vocês pagam hoje. Assaí e Carrefour bloqueiam robô; Super Fácil, Mar Vermelho e Rede Mais não vendem online.
        {dados.rodada && <> Última busca: {new Date(dados.rodada.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}{dados.rodada.erros?.length ? ` (${dados.rodada.erros.length} erro(s))` : ''}.</>}
      </p>

      <h2 className="mb-3 font-semibold text-gray-900">Vale a pena hoje</h2>
      {ofertas.length === 0
        ? <p className="mb-8 text-sm text-gray-500">Nada 10% ou mais abaixo do que vocês pagam.</p>
        : (
          <div className="mb-8 grid gap-3 sm:grid-cols-2">
            {ofertas.map(l => (
              <div key={l.insumo.id} className="rounded-xl border border-green-300 bg-green-50 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold text-gray-900">{l.insumo.name}</p>
                  <p className="text-sm font-bold text-green-700 tabular-nums">{Math.round(l.economia * 100)}% mais barato</p>
                </div>
                <p className="mt-1 text-sm text-gray-800">
                  {l.melhor.mercado}: {l.melhor.produto} por <strong>{formatCurrency(l.melhor.preco)}</strong>
                  {l.melhor.preco_original && <span className="ml-1 rounded bg-red-100 px-1 text-[11px] font-semibold text-red-700">oferta</span>}
                </p>
                <p className="text-xs text-gray-600 tabular-nums">
                  {porUnidade(l.melhor.preco_unidade, l.insumo.unit)} · vocês pagam {porUnidade(l.pago, l.insumo.unit)}
                  {lojaDaOrigem(l.insumo.preco_origem) ? ` (${lojaDaOrigem(l.insumo.preco_origem)})` : ''}
                  {l.menorEm30 && <span className="ml-1 font-semibold text-green-700">· menor em 30 dias</span>}
                </p>
                {l.melhor.link && (
                  <a href={l.melhor.link} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                    Ver no site <HiExternalLink />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

      <h2 className="mb-3 font-semibold text-gray-900">Todos os insumos</h2>
      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {linhas.map(l => {
          const abertoAqui = aberto === l.insumo.id
          return (
            <div key={l.insumo.id} className="px-4 py-3">
              <button type="button" onClick={() => setAberto(abertoAqui ? null : l.insumo.id)} className="flex w-full cursor-pointer items-center gap-3 text-left">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900">{l.insumo.name}</p>
                  <p className="text-xs text-gray-500 tabular-nums">
                    vocês pagam {l.pago ? porUnidade(l.pago, l.insumo.unit) : '—'}
                    {lojaDaOrigem(l.insumo.preco_origem) ? ` (${lojaDaOrigem(l.insumo.preco_origem)})` : ''}
                  </p>
                </div>
                <div className="text-right text-sm tabular-nums">
                  {l.melhor
                    ? <>
                        <p className="font-semibold text-gray-900">{porUnidade(l.melhor.preco_unidade, l.insumo.unit)}</p>
                        <p className={`text-xs ${l.economia > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                          {l.melhor.mercado}{l.economia != null ? ` · ${l.economia > 0 ? '−' : '+'}${Math.abs(Math.round(l.economia * 100))}%` : ''}
                        </p>
                      </>
                    : <p className="text-xs text-gray-400">não achou</p>}
                </div>
                {abertoAqui ? <HiChevronUp className="text-gray-400" /> : <HiChevronDown className="text-gray-400" />}
              </button>

              {abertoAqui && (
                <div className="mt-2">
                  {l.produtos.length > 0 && (
                    <ul className="divide-y divide-gray-100">
                      {l.produtos.slice(0, 8).map(p => (
                        <Produto key={`${p.mercado}|${p.produto_id}`} p={p} unidade={l.insumo.unit} pago={l.pago} aoIgnorar={ignorar} />
                      ))}
                    </ul>
                  )}
                  {editando === l.insumo.id
                    ? <EditarBusca busca={l.busca} aoSalvar={campos => salvar(l.insumo.id, campos)} aoCancelar={() => setEditando(null)} />
                    : (
                      <button type="button" onClick={() => setEditando(l.insumo.id)} className="mt-2 inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-primary">
                        <HiPencil /> Mudar a busca
                      </button>
                    )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
