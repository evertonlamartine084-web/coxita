import { useEffect, useMemo, useRef, useState } from 'react'
import { getAllFlavors } from '../../services/flavors'
import { ehPacote, itemPorUnidade, pacotesDoSabor } from '../../utils/pacote'
import { formatCurrency } from '../../utils/format'

/**
 * Item por unidade, no painel: "70 churros de doce de leite".
 *
 * O site só vende de 25 em 25, mas encomenda combinada no balcão ou no WhatsApp nem sempre
 * fecha nessa conta. O preço sai proporcional ao pacote escolhido.
 *
 * Vive dentro do EscolherProduto (aba "Por unidade"), com as mesmas abas e cartões dos pacotes.
 * A ordem é a da encomenda que chega: o sabor, depois quantas unidades. O pacote que dá o preço
 * vem sozinho — o menor que comporta a quantidade (70 → cento, 150 → 200), a conta que a loja
 * já fazia à mão — e os outros tamanhos ficam ao lado para trocar.
 */

const GRUPOS = [
  { slug: 'salgados', nome: 'Salgados' },
  { slug: 'pasteis', nome: 'Pastéis' },
  { slug: 'doces', nome: 'Doces' },
]

const porUnidade = (p) => Number(p.price) / p.pack_size

// item do Gourmet já é vendido por unidade: entra com a quantidade, sem pacote de base
function itemDoGourmet(produto, unidades) {
  return {
    product_id: produto.id,
    product_name: produto.name,
    price: Number(produto.price),
    cash_price: produto.cash_price != null ? Number(produto.cash_price) : null,
    quantity: unidades,
    flavors: [],
  }
}

export default function AvulsoPorUnidade({ produtos, aoAdicionar }) {
  const [sabores, setSabores] = useState([])
  const [aba, setAba] = useState('salgados')
  const [saborId, setSaborId] = useState('')
  const [unidades, setUnidades] = useState('')
  const [pacoteEscolhido, setPacoteEscolhido] = useState('') // vazio = automático
  const campoRef = useRef(null)

  // todos, inclusive os desligados no site: sabor fora do cardápio ainda é feito sob encomenda
  // (o pastel de frango do Carlos, 27/10/2026), e os churros vivem como sabor fixo do pacote
  useEffect(() => { getAllFlavors().then(setSabores).catch(() => {}) }, [])

  const pacotes = useMemo(
    () => produtos.filter(p => p.active !== false && ehPacote(p)),
    [produtos],
  )

  // só sabor que tem pacote para dar o preço; ligado no site primeiro
  const grupos = useMemo(() => [...GRUPOS.map(g => ({
    ...g,
    sabores: sabores
      .filter(s => s.group_slug === g.slug)
      .map(s => ({ ...s, pacotes: pacotesDoSabor(s, pacotes).sort((a, b) => a.pack_size - b.pack_size) }))
      .filter(s => s.pacotes.length > 0)
      .sort((a, b) => Number(b.active || b.pacotes.some(p => p.fixed_flavor_id === b.id)) - Number(a.active || a.pacotes.some(p => p.fixed_flavor_id === a.id))),
  })), {
    // quiches, empadas e doces finos: produto por unidade, cada um com seu preço
    slug: 'gourmet',
    nome: 'Gourmet',
    sabores: produtos
      .filter(p => p.active !== false && !ehPacote(p) && p.categories?.name === 'Gourmet')
      .map(p => ({ id: `p:${p.id}`, name: p.name, active: true, produto: p, pacotes: [] }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
  }].filter(g => g.sabores.length > 0), [sabores, pacotes, produtos])

  const grupo = grupos.find(g => g.slug === aba) ?? grupos[0]
  const sabor = grupos.flatMap(g => g.sabores).find(s => String(s.id) === saborId)
  const opcoes = sabor?.pacotes ?? []
  const qtd = Number.parseInt(unidades, 10)
  const automatico = opcoes.find(p => qtd > 0 && p.pack_size >= qtd) ?? opcoes[opcoes.length - 1]
  const produto = opcoes.find(p => String(p.id) === pacoteEscolhido) ?? automatico
  const item = !(sabor && qtd > 0) ? null
    : sabor.produto ? itemDoGourmet(sabor.produto, qtd)
    : produto ? itemPorUnidade(produto, sabor, qtd) : null
  // o item do Gourmet leva a quantidade; o de pacote já vem com o preço das unidades todas
  const vezes = item?.quantity ?? 1

  useEffect(() => { if (saborId) campoRef.current?.focus() }, [saborId])

  const escolher = (id) => {
    setSaborId(id === saborId ? '' : id)
    setPacoteEscolhido('')
  }

  const adicionar = () => {
    if (!item) return
    aoAdicionar(item)
    setSaborId('')
    setUnidades('')
    setPacoteEscolhido('')
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Grupos de sabor">
        {grupos.map(g => (
          <button
            key={g.slug}
            type="button"
            role="tab"
            aria-selected={g.slug === grupo?.slug}
            onClick={() => setAba(g.slug)}
            className={`shrink-0 cursor-pointer rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
              g.slug === grupo?.slug ? 'bg-primary text-white' : 'bg-gray-100 text-text-light hover:bg-gray-200'
            }`}
          >
            {g.nome} <span className="font-normal opacity-70">{g.sabores.length}</span>
          </button>
        ))}
      </div>

      <div className="grid max-h-60 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
        {grupo?.sabores.map(s => {
          const valores = s.produto ? [Number(s.produto.price)] : s.pacotes.map(porUnidade)
          const min = Math.min(...valores)
          const max = Math.max(...valores)
          const marcado = String(s.id) === saborId
          // churros: o sabor fica desligado, mas o pacote dele está à venda no site
          const noSite = s.produto || s.active || s.pacotes.some(p => p.fixed_flavor_id === s.id)
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => escolher(String(s.id))}
              aria-pressed={marcado}
              className={`flex min-h-14 cursor-pointer flex-col items-start justify-between rounded-lg border p-2 text-left transition-colors active:scale-[0.98] ${
                marcado ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-gray-200 bg-white hover:border-primary hover:bg-primary/5'
              }`}
            >
              <span className={`text-sm font-semibold leading-tight ${noSite ? 'text-brown' : 'text-gray-500'}`}>
                {s.name}
              </span>
              <span className="mt-1 flex w-full items-center justify-between gap-1 text-xs tabular-nums text-text-light">
                <span>{formatCurrency(min)}{max > min ? ` a ${formatCurrency(max).replace(/^R\$\s*/, '')}` : ''}/un</span>
                {!noSite && <span className="rounded bg-gray-100 px-1 text-[10px] text-gray-500">fora do site</span>}
              </span>
            </button>
          )
        })}
      </div>

      {sabor && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2">
              <input
                ref={campoRef}
                type="number" inputMode="numeric" min="1"
                value={unidades} onChange={e => setUnidades(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionar() } }}
                placeholder="0"
                aria-label="Quantas unidades"
                className="w-20 rounded-lg border border-gray-300 bg-white px-2 py-2 text-center text-lg font-bold tabular-nums outline-none focus:border-primary"
              />
              <span className="text-sm font-semibold text-brown">{sabor.name}</span>
            </label>
            <div className="ml-auto text-right">
              <p className="text-lg font-bold leading-none tabular-nums text-brown">{item ? formatCurrency(item.price * vezes) : '—'}</p>
              {item?.cash_price != null && (
                <p className="mt-0.5 text-xs tabular-nums text-green-700">Pix {formatCurrency(item.cash_price * vezes)}</p>
              )}
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            {opcoes.length > 1 && (
              <div className="flex flex-1 flex-wrap items-center gap-1 text-xs" role="radiogroup" aria-label="Pacote que dá o preço">
                {opcoes.map(p => {
                  const ativo = produto?.id === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={ativo}
                      onClick={() => setPacoteEscolhido(String(p.id))}
                      title={`Preço proporcional ao pacote de ${p.pack_size}`}
                      className={`cursor-pointer rounded-md px-2 py-1 tabular-nums transition-colors ${
                        ativo ? 'bg-white font-semibold text-brown shadow-sm ring-1 ring-primary/40' : 'text-gray-500 hover:bg-white/70'
                      }`}
                    >
                      base {p.pack_size} · {formatCurrency(porUnidade(p))}
                    </button>
                  )
                })}
              </div>
            )}
            <button type="button" onClick={adicionar} disabled={!item}
              className="ml-auto cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-40">
              Adicionar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
