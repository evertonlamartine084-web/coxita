import { useEffect, useMemo, useState } from 'react'
import { getAllFlavors } from '../../services/flavors'
import { ehPacote, itemPorUnidade, pacotesDoSabor } from '../../utils/pacote'
import { formatCurrency } from '../../utils/format'

/**
 * Item por unidade, no painel: "70 churros de doce de leite".
 *
 * O site só vende de 25 em 25, mas encomenda combinada no balcão ou no WhatsApp nem sempre
 * fecha nessa conta. O preço sai proporcional ao pacote escolhido.
 *
 * A ordem é a da encomenda que chega: primeiro o sabor, depois quantas unidades. O pacote que
 * dá o preço vem sozinho — o menor que comporta a quantidade (70 → cento, 150 → 200), que é a
 * conta que a loja já fazia à mão — e os outros ficam à vista para trocar.
 */

const GRUPOS = [
  { slug: 'salgados', nome: 'Salgados' },
  { slug: 'pasteis', nome: 'Pastéis' },
  { slug: 'doces', nome: 'Doces' },
]

export default function AvulsoPorUnidade({ produtos, aoAdicionar }) {
  const [sabores, setSabores] = useState([])
  const [saborId, setSaborId] = useState('')
  const [unidades, setUnidades] = useState('')
  const [pacoteEscolhido, setPacoteEscolhido] = useState('') // vazio = automático

  // todos, inclusive os desligados no site: sabor fora do cardápio ainda é feito sob encomenda
  // (o pastel de frango do Carlos, 27/10/2026), e os churros vivem como sabor fixo do pacote
  useEffect(() => { getAllFlavors().then(setSabores).catch(() => {}) }, [])

  const pacotes = useMemo(
    () => produtos.filter(p => p.active !== false && ehPacote(p)),
    [produtos],
  )

  // só sabor que tem pacote para dar o preço; ligado no site primeiro
  const porGrupo = useMemo(() => GRUPOS.map(g => ({
    ...g,
    sabores: sabores
      .filter(s => s.group_slug === g.slug && pacotesDoSabor(s, pacotes).length > 0)
      .sort((a, b) => Number(b.active) - Number(a.active)),
  })).filter(g => g.sabores.length > 0), [sabores, pacotes])

  const sabor = sabores.find(s => String(s.id) === saborId)
  const opcoes = useMemo(
    () => (sabor ? pacotesDoSabor(sabor, pacotes).sort((a, b) => a.pack_size - b.pack_size) : []),
    [sabor, pacotes],
  )
  const qtd = Number.parseInt(unidades, 10)
  const automatico = opcoes.find(p => qtd > 0 && p.pack_size >= qtd) ?? opcoes[opcoes.length - 1]
  const produto = opcoes.find(p => String(p.id) === pacoteEscolhido) ?? automatico
  const item = produto && sabor && qtd > 0 ? itemPorUnidade(produto, sabor, qtd) : null

  const escolherSabor = (id) => {
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
    <div className="space-y-2 rounded-lg border border-dashed border-gray-300 p-2">
      <p className="text-xs font-semibold text-gray-500">
        Quantidade quebrada <span className="font-normal">(fora dos pacotes de 25 em 25)</span>
      </p>

      <div className="space-y-1.5">
        {porGrupo.map(g => (
          <div key={g.slug} className="flex flex-wrap items-center gap-1.5">
            <span className="w-14 shrink-0 text-xs text-gray-400">{g.nome}</span>
            {g.sabores.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => escolherSabor(String(s.id))}
                title={s.active ? undefined : 'Desligado no site'}
                className={`cursor-pointer rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors ${
                  String(s.id) === saborId
                    ? 'bg-primary text-white ring-primary'
                    : `bg-white ring-gray-200 hover:bg-gray-50 ${s.active ? 'text-gray-800' : 'text-gray-400'}`
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        ))}
      </div>

      {sabor && (
        <div className="space-y-2 rounded-lg bg-gray-50 p-2">
          <div className="flex items-center gap-2">
            <input
              type="number" inputMode="numeric" min="1" autoFocus
              value={unidades} onChange={e => setUnidades(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionar() } }}
              placeholder="Quantas?"
              className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-sm tabular-nums"
            />
            <span className="min-w-0 flex-1 truncate text-sm">
              {item ? (
                <>
                  <strong>{qtd} {sabor.name}</strong> · {formatCurrency(item.price)}
                  {item.cash_price != null && <span className="text-green-700"> · Pix {formatCurrency(item.cash_price)}</span>}
                </>
              ) : <span className="text-gray-400">{sabor.name}</span>}
            </span>
            <button type="button" onClick={adicionar} disabled={!item}
              className="cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
              Adicionar
            </button>
          </div>

          {opcoes.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-gray-500">Preço do pacote de</span>
              {opcoes.map(p => {
                const ativo = produto?.id === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPacoteEscolhido(String(p.id))}
                    className={`cursor-pointer rounded-md px-2 py-0.5 tabular-nums ring-1 ${
                      ativo ? 'bg-secondary/40 font-semibold text-brown ring-secondary' : 'bg-white text-gray-600 ring-gray-200'
                    }`}
                  >
                    {p.pack_size} · {formatCurrency(Number(p.price) / p.pack_size)}/un
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
