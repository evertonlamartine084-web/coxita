import { useMemo, useState } from 'react'
import { HiSearch, HiX } from 'react-icons/hi'
import { formatCurrency } from '../../utils/format'

/**
 * Escolha do produto no "Novo pedido": abas por categoria, busca e um botão por produto.
 *
 * Substitui a lista suspensa única, onde 33 produtos vinham misturados (refri entre os centos,
 * quiche no meio dos congelados) e achar "200 Churros" exigia ler a lista toda. Aqui a pessoa
 * toca a categoria e vê os tamanhos lado a lado, já com o preço do cartão e do Pix.
 */

// a ordem em que a cozinha pensa; categoria nova cai no fim, na ordem do banco
const ORDEM = ['Salgados', 'Pastéis', 'Congelados', 'Doces', 'Bebidas', 'Gourmet']

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function EscolherProduto({ produtos, aoEscolher, ehIfood = false }) {
  const [busca, setBusca] = useState('')
  const [aba, setAba] = useState(null)

  const grupos = useMemo(() => {
    const mapa = new Map()
    for (const p of produtos) {
      if (p.active === false) continue
      const cat = p.categories?.name ?? 'Outros'
      if (!mapa.has(cat)) mapa.set(cat, [])
      mapa.get(cat).push(p)
    }
    // dentro da categoria: por sabor/família e, nela, do menor pacote para o maior
    for (const lista of mapa.values()) {
      lista.sort((a, b) => familia(a).localeCompare(familia(b), 'pt-BR') || (a.pack_size ?? 0) - (b.pack_size ?? 0))
    }
    const nomes = [...mapa.keys()].sort((a, b) => posicao(a) - posicao(b))
    return nomes.map(nome => ({ nome, produtos: mapa.get(nome) }))
  }, [produtos])

  const abaAtual = aba ?? grupos[0]?.nome
  const termo = semAcento(busca.trim())
  const visiveis = termo
    ? grupos.flatMap(g => g.produtos).filter(p => semAcento(`${p.name} ${p.pack_size ?? ''} ${familia(p)}`).includes(termo))
    : grupos.find(g => g.nome === abaAtual)?.produtos ?? []

  return (
    <div className="space-y-2">
      <div className="relative">
        <HiSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar produto (ex.: 200, nutella, coca)"
          className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-9 text-sm outline-none focus:border-primary"
        />
        {busca && (
          <button type="button" onClick={() => setBusca('')} aria-label="Limpar busca"
            className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 text-gray-400 hover:text-gray-600">
            <HiX className="size-4" />
          </button>
        )}
      </div>

      {!termo && (
        <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Categorias">
          {grupos.map(g => (
            <button
              key={g.nome}
              type="button"
              role="tab"
              aria-selected={g.nome === abaAtual}
              onClick={() => setAba(g.nome)}
              className={`shrink-0 cursor-pointer rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                g.nome === abaAtual ? 'bg-primary text-white' : 'bg-gray-100 text-text-light hover:bg-gray-200'
              }`}
            >
              {g.nome} <span className="font-normal opacity-70">{g.produtos.length}</span>
            </button>
          ))}
        </div>
      )}

      {visiveis.length === 0 ? (
        <p className="py-3 text-center text-sm text-gray-400">Nenhum produto com “{busca}”.</p>
      ) : (
        <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
          {visiveis.map(p => {
            const preco = ehIfood && p.preco_ifood ? Number(p.preco_ifood) : Number(p.price)
            const pix = !ehIfood && p.cash_price != null && Number(p.cash_price) < Number(p.price) ? Number(p.cash_price) : null
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => aoEscolher(p.id)}
                className="flex min-h-16 cursor-pointer flex-col items-start justify-between rounded-lg border border-gray-200 bg-white p-2 text-left transition-colors hover:border-primary hover:bg-primary/5 active:scale-[0.98]"
              >
                <span className="text-sm font-semibold leading-tight text-brown">
                  {p.pack_size ? <span className="mr-1 rounded bg-secondary/40 px-1 tabular-nums">{p.pack_size}</span> : null}
                  {familia(p)}
                </span>
                <span className="mt-1 text-xs tabular-nums text-text-light">
                  {formatCurrency(preco)}
                  {/* gourmet vai por unidade: "R$ 0,43" sozinho parece erro de preço */}
                  {!p.pack_size && p.categories?.name === 'Gourmet' && ' /un'}
                  {pix != null && <span className="text-green-700"> · Pix {formatCurrency(pix)}</span>}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function posicao(categoria) {
  const i = ORDEM.indexOf(categoria)
  return i === -1 ? ORDEM.length : i
}

/** "Cento de Churros de Brigadeiro" → "Churros de Brigadeiro": o tamanho já vai no selo. */
function familia(p) {
  if (!p.pack_size) return p.name
  const resto = p.name
    .replace(/^(meio cento|cento|\d+(\s*un\.)?)\s*(de\s+)?/i, '')
    .trim()
  if (!resto) return p.name
  return resto.charAt(0).toUpperCase() + resto.slice(1)
}
