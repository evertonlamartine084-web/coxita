import { formatCurrency, formatCurrencyFine } from '../../utils/format'

/**
 * Linhas de uma ficha técnica: item + quanto entra + quanto custa.
 *
 * Serve tanto para a ficha do produto (`campoItem` = supply_id) quanto para a
 * do recheio (`campoItem` = child_id) -- a mecânica é a mesma, e duplicar isso
 * em dois componentes garantiria que um deles ficasse para trás.
 *
 * O custo aparece por linha, ao lado da quantidade, porque é ali que a decisão
 * acontece: dá para ver na hora que 2 g de queijo pesam mais no pastel que
 * 12 g de massa.
 */
export default function EditorDeFicha({
  linhas,
  setLinhas,
  insumos,
  custos,
  campoItem = 'supply_id',
  excluirIds = [],
}) {
  const porId = new Map(insumos.map(i => [i.id, i]))
  const jaUsados = new Set(linhas.map(l => l[campoItem]).filter(Boolean))

  // O banco tem unique (pai, item): oferecer um item já escolhido só levaria
  // a um erro de gravação depois de o dono ter digitado a quantidade.
  const disponiveis = (linhaAtual) => insumos.filter(i =>
    !excluirIds.includes(i.id) &&
    (i.id === linhaAtual?.[campoItem] || !jaUsados.has(i.id)),
  )

  const alterar = (indice, patch) => {
    setLinhas(linhas.map((linha, i) => (i === indice ? { ...linha, ...patch } : linha)))
  }

  const remover = (indice) => setLinhas(linhas.filter((_, i) => i !== indice))
  const adicionar = () => setLinhas([...linhas, { [campoItem]: '', quantity: '' }])

  const custoDaLinha = (linha) => {
    const quantidade = Number(linha.quantity)
    if (!linha[campoItem] || !Number.isFinite(quantidade)) return 0
    return quantidade * (custos.get(linha[campoItem]) ?? 0)
  }

  const total = linhas.reduce((soma, linha) => soma + custoDaLinha(linha), 0)

  const insumosSimples = insumos.filter(i => i.kind === 'insumo')
  const recheios = insumos.filter(i => i.kind === 'recheio')

  return (
    <div className="border-2 border-border rounded-xl overflow-hidden">
      <div className="hidden sm:grid grid-cols-[1fr_7rem_5.5rem_2rem] gap-2 px-3 py-2 bg-gray-50 border-b border-border text-xs font-semibold uppercase tracking-wide text-text-light">
        <span>Item</span>
        <span>Quantidade</span>
        <span className="text-right">Custo</span>
        <span />
      </div>

      {linhas.length === 0 && (
        <p className="px-3 py-4 text-sm text-text-light text-center">
          Nenhum item na ficha ainda.
        </p>
      )}

      <div className="divide-y divide-gray-100">
        {linhas.map((linha, indice) => {
          const item = porId.get(linha[campoItem])
          const opcoes = disponiveis(linha)
          return (
            <div
              key={indice}
              className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_7rem_5.5rem_2rem] gap-2 px-3 py-2 items-center"
            >
              <select
                value={linha[campoItem] || ''}
                onChange={(e) => alterar(indice, { [campoItem]: e.target.value })}
                className="w-full px-2 py-2 border-2 border-border rounded-lg text-sm outline-none focus:border-primary bg-white"
              >
                <option value="">Escolha o item...</option>
                <optgroup label="Insumos">
                  {opcoes.filter(o => o.kind === 'insumo').map(o => (
                    <option key={o.id} value={o.id}>
                      {o.name} — {formatCurrencyFine(custos.get(o.id) ?? 0, 2)}/{o.unit}
                    </option>
                  ))}
                </optgroup>
                {recheios.length > 0 && (
                  <optgroup label="Recheios">
                    {opcoes.filter(o => o.kind === 'recheio').map(o => (
                      <option key={o.id} value={o.id}>
                        {o.name} — {formatCurrencyFine(custos.get(o.id) ?? 0, 2)}/{o.unit}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>

              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.000001"
                  min="0"
                  inputMode="decimal"
                  value={linha.quantity}
                  onChange={(e) => alterar(indice, { quantity: e.target.value })}
                  className="w-20 sm:w-full px-2 py-2 border-2 border-border rounded-lg text-sm outline-none focus:border-primary"
                />
                <span className="text-xs text-text-light w-8">{item?.unit || ''}</span>
              </div>

              <span className="text-sm font-medium text-right tabular-nums">
                {formatCurrencyFine(custoDaLinha(linha), 4)}
              </span>

              <button
                type="button"
                onClick={() => remover(indice)}
                aria-label="Remover item"
                className="text-danger hover:text-red-700 text-xl leading-none justify-self-end"
              >
                &times;
              </button>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t border-border">
        <button
          type="button"
          onClick={adicionar}
          disabled={insumosSimples.length + recheios.length === jaUsados.size}
          className="text-sm font-semibold text-primary hover:text-brown disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Adicionar item
        </button>
        <span className="text-sm">
          <span className="text-text-light mr-2">Custo bruto</span>
          <strong className="tabular-nums">{formatCurrency(total)}</strong>
        </span>
      </div>
    </div>
  )
}
