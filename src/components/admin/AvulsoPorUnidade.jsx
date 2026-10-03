import { useEffect, useMemo, useState } from 'react'
import { getFlavors, peekFlavors } from '../../services/flavors'
import { ehPacote, itemPorUnidade, saboresDoPacote } from '../../utils/pacote'
import { formatCurrency } from '../../utils/format'

/**
 * Item por unidade, no painel: "70 churros de doce de leite".
 *
 * O site só vende de 25 em 25, mas encomenda combinada no balcão ou no WhatsApp nem sempre
 * fecha nessa conta. O preço sai proporcional ao pacote escolhido.
 */
export default function AvulsoPorUnidade({ produtos, aoAdicionar }) {
  const [sabores, setSabores] = useState(() => peekFlavors() ?? [])
  const [produtoId, setProdutoId] = useState('')
  const [saborId, setSaborId] = useState('')
  const [unidades, setUnidades] = useState('')

  useEffect(() => { getFlavors().then(setSabores).catch(() => {}) }, [])

  // todos os tamanhos: o preço por unidade muda com o pacote (o de 200 sai mais barato)
  const pacotes = useMemo(
    () => produtos.filter(p => p.active !== false && ehPacote(p)),
    [produtos],
  )

  const produto = pacotes.find(p => String(p.id) === produtoId)
  const opcoes = !produto ? []
    : produto.fixed_flavor_id ? sabores.filter(s => s.id === produto.fixed_flavor_id)
    : saboresDoPacote(produto, sabores)
  const sabor = opcoes.length === 1 ? opcoes[0] : opcoes.find(s => String(s.id) === saborId)
  const qtd = Number.parseInt(unidades, 10)
  const item = produto && sabor && qtd > 0 ? itemPorUnidade(produto, sabor, qtd) : null

  const adicionar = () => {
    if (!item) return
    aoAdicionar(item)
    setSaborId('')
    setUnidades('')
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-gray-300 p-2">
      <p className="text-xs font-semibold text-gray-500">Por unidade</p>
      <select value={produtoId} onChange={e => { setProdutoId(e.target.value); setSaborId('') }}
        className="w-full cursor-pointer rounded-lg border border-gray-200 px-2 py-1.5 text-sm">
        <option value="">Preço de qual pacote…</option>
        {pacotes.map(p => (
          <option key={p.id} value={p.id}>{p.name} — {formatCurrency(p.price)}</option>
        ))}
      </select>
      {opcoes.length > 1 && (
        <select value={saborId} onChange={e => setSaborId(e.target.value)}
          className="w-full cursor-pointer rounded-lg border border-gray-200 px-2 py-1.5 text-sm">
          <option value="">Sabor…</option>
          {opcoes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      <div className="flex items-center gap-2">
        <input type="number" inputMode="numeric" min="1" value={unidades}
          onChange={e => setUnidades(e.target.value)} placeholder="Unidades"
          className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-sm" />
        <span className="flex-1 text-sm text-gray-600">{item ? formatCurrency(item.price) : ''}</span>
        <button type="button" onClick={adicionar} disabled={!item}
          className="cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
          Adicionar
        </button>
      </div>
    </div>
  )
}
