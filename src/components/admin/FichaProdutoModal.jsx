import { useState } from 'react'
import toast from 'react-hot-toast'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import EditorDeFicha from './EditorDeFicha'
import { salvarFichaDoProduto, salvarProduto } from '../../services/custos'
import { calcularProduto, calcularPorSabor, faixaDaMargem, ROTULO_DA_FAIXA } from '../../utils/margem'
import { formatCurrency, formatCurrencyFine, formatPercent } from '../../utils/format'

/**
 * Ficha técnica de um produto, com o preço saindo da conta enquanto se digita.
 *
 * A tela recalcula a cada tecla de propósito: precificação é tentativa e erro
 * ("e se eu puser 2 g menos de queijo?"), e ter que salvar para ver o
 * resultado mataria o experimento.
 */
export default function FichaProdutoModal({ produto, sabores = [], insumos, custos, params, onClose, onSalvo }) {
  const [linhas, setLinhas] = useState(() =>
    (produto.product_recipe_items ?? []).map(l => ({
      supply_id: l.supply_id,
      quantity: String(l.quantity),
    })),
  )
  const [rendimento, setRendimento] = useState(String(produto.recipe_yield ?? 1))
  const [perda, setPerda] = useState(String(produto.waste_percent ?? 0))
  const [margemAlvo, setMargemAlvo] = useState(
    produto.target_margin === null || produto.target_margin === undefined
      ? ''
      : String(produto.target_margin),
  )
  const [embalagem, setEmbalagem] = useState(String(produto.custo_embalagem ?? 0))
  // Vazio = usa o custo fixo geral das configurações.
  const [custoFixo, setCustoFixo] = useState(
    produto.custo_fixo_unidade === null || produto.custo_fixo_unidade === undefined ? '' : String(produto.custo_fixo_unidade),
  )
  const [salvando, setSalvando] = useState(false)

  // O que a conta vê é o formulário, não o banco.
  const emEdicao = {
    ...produto,
    recipe_yield: Number(rendimento) || 1,
    waste_percent: Number(perda) || 0,
    target_margin: margemAlvo === '' ? null : Number(margemAlvo),
    custo_embalagem: Number(embalagem) || 0,
    custo_fixo_unidade: custoFixo === '' ? null : Number(custoFixo),
    product_recipe_items: linhas.map(l => ({ supply_id: l.supply_id, quantity: Number(l.quantity) })),
  }
  // Pacote de sabor à escolha: a conta de cima é a do pior sabor; a tabela por sabor fica embaixo.
  const porSabor = calcularPorSabor(emEdicao, sabores, custos, params)
  const conta = porSabor.find(s => s.conta.temFicha)?.conta ?? calcularProduto(emEdicao, custos, params)
  const faixa = ROTULO_DA_FAIXA[faixaDaMargem(conta.piorCaso?.margem)]

  const salvar = async (patchExtra = {}) => {
    setSalvando(true)
    try {
      await salvarFichaDoProduto(produto.id, linhas)
      await salvarProduto(produto.id, {
        recipe_yield: Number(rendimento) || 1,
        waste_percent: Number(perda) || 0,
        target_margin: margemAlvo === '' ? null : Number(margemAlvo),
        custo_embalagem: Number(embalagem) || 0,
        custo_fixo_unidade: custoFixo === '' ? null : Number(custoFixo),
        ...patchExtra,
      })
      toast.success('Ficha salva!')
      onSalvo()
      onClose()
    } catch (erro) {
      console.error(erro)
      toast.error('Erro ao salvar a ficha.')
    } finally {
      setSalvando(false)
    }
  }

  const usarPreco = (valor) => {
    if (!Number.isFinite(valor)) return
    salvar({ price: Number(valor.toFixed(2)) })
  }

  return (
    <Modal isOpen onClose={onClose} title={`Ficha — ${produto.name}`} size="2xl">
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="block text-xs font-semibold text-text-light uppercase tracking-wide mb-1">
              A ficha rende
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number" min="1" step="1" value={rendimento}
                onChange={(e) => setRendimento(e.target.value)}
                className="w-full px-3 py-2 border-2 border-border rounded-lg text-sm outline-none focus:border-primary"
              />
              <span className="text-xs text-text-light whitespace-nowrap">un.</span>
            </div>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-text-light uppercase tracking-wide mb-1">
              Perda
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number" min="0" max="99" step="0.5" value={perda}
                onChange={(e) => setPerda(e.target.value)}
                className="w-full px-3 py-2 border-2 border-border rounded-lg text-sm outline-none focus:border-primary"
              />
              <span className="text-xs text-text-light">%</span>
            </div>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-text-light uppercase tracking-wide mb-1">
              Margem desejada
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number" min="0" max="99" step="1" value={margemAlvo}
                onChange={(e) => setMargemAlvo(e.target.value)}
                placeholder={String(params.default_margin)}
                className="w-full px-3 py-2 border-2 border-border rounded-lg text-sm outline-none focus:border-primary"
              />
              <span className="text-xs text-text-light">%</span>
            </div>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-semibold text-text-light uppercase tracking-wide mb-1">
              Embalagem por pacote
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-light">R$</span>
              <input
                type="number" min="0" step="0.01" value={embalagem}
                onChange={(e) => setEmbalagem(e.target.value)}
                className="w-full px-3 py-2 border-2 border-border rounded-lg text-sm outline-none focus:border-primary"
              />
            </div>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-text-light uppercase tracking-wide mb-1">
              Custo fixo por unidade
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-light">R$</span>
              <input
                type="number" min="0" step="0.01" value={custoFixo}
                onChange={(e) => setCustoFixo(e.target.value)}
                placeholder={`${params.fixed_cost_per_unit} (geral)`}
                className="w-full px-3 py-2 border-2 border-border rounded-lg text-sm outline-none focus:border-primary"
              />
            </div>
          </label>
        </div>

        {porSabor.length > 0 && (
          <p className="text-xs text-text-light">
            O cliente escolhe o sabor, então o custo vem da ficha de cada um (Margens → Insumos e recheios → Ficha de
            cada sabor). Aqui só entra o que o pacote leva além do sabor.
          </p>
        )}

        <EditorDeFicha
          linhas={linhas}
          setLinhas={setLinhas}
          insumos={insumos}
          custos={custos}
          campoItem="supply_id"
        />

        {/* Da ficha ao preço, na ordem em que a conta acontece. */}
        <div className="bg-cream border-2 border-border rounded-xl p-4 space-y-2 text-sm">
          <Linha
            rotulo={`Custo bruto ${conta.unidades > 1 ? 'por unidade' : ''}`}
            valor={formatCurrencyFine(conta.custoInsumoUnidade, 4)}
            detalhe={Number(rendimento) > 1 ? `ficha ${formatCurrency(conta.custoFicha)} ÷ ${rendimento}` : null}
          />
          <Linha
            rotulo="Custo fixo rateado"
            valor={formatCurrencyFine(conta.custoFixoUnidade, 4)}
            detalhe={custoFixo === '' ? 'aluguel, luz, gás — vem das configurações' : 'aluguel, luz, gás — o deste produto'}
          />
          <Linha
            rotulo="Custo por unidade"
            valor={formatCurrencyFine(conta.custoUnidade, 4)}
            forte
          />
          {conta.custoEmbalagem > 0 && (
            <Linha rotulo="Embalagem do pacote" valor={formatCurrency(conta.custoEmbalagem)} />
          )}
          {conta.unidades > 1 && (
            <Linha
              rotulo={`Custo do pacote (${conta.unidades} un.)${porSabor.length > 1 ? ' — pior sabor' : ''}`}
              valor={formatCurrency(conta.custoTotal)}
              forte
            />
          )}
          <div className="border-t border-border pt-2 flex items-center justify-between">
            <span className="text-text-light">Preço de venda hoje</span>
            <span className="flex items-center gap-2">
              <strong className="tabular-nums">{formatCurrency(produto.price)}</strong>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${faixa.classe}`}>
                {faixa.texto}
              </span>
            </span>
          </div>
        </div>

        {porSabor.length > 0 ? (
          <PorSabor porSabor={porSabor} />
        ) : (
          <div>
            <p className="text-xs font-semibold text-text-light uppercase tracking-wide mb-2">
              Com {formatPercent(conta.margemAlvo, 0)} de margem, imposto de {formatPercent(params.tax_percent, 2)} e a taxa de cada meio
              {Number(params.rounding_step) > 0 &&
                `, arredondado para cima de ${formatCurrency(params.rounding_step)} em ${formatCurrency(params.rounding_step)}`}
            </p>
            <div className="border-2 border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-text-light">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Recebendo em</th>
                    <th className="text-right px-3 py-2 font-semibold">Taxa</th>
                    <th className="text-right px-3 py-2 font-semibold">Preço sugerido</th>
                    <th className="text-right px-3 py-2 font-semibold">Margem no preço de hoje</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {conta.porMeio.map(meio => {
                    const faixaMeio = ROTULO_DA_FAIXA[faixaDaMargem(meio.margem)]
                    return (
                      <tr key={meio.chave}>
                        <td className="px-3 py-2">{meio.rotulo}</td>
                        <td className="px-3 py-2 text-right text-text-light tabular-nums">
                          {formatPercent(meio.taxa, 2)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">
                          {meio.precoSugerido === null ? '—' : formatCurrency(meio.precoSugerido)}
                          {meio.precoSugerido !== null && Number(params.rounding_step) > 0 && (
                            <span className="block text-xs font-normal text-text-light">
                              exato {formatCurrencyFine(meio.precoExato, 4)} · dá {formatPercent(meio.margemSugerida)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${faixaMeio.classe}`}>
                            {formatPercent(meio.margem)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {meio.precoSugerido !== null && (
                            <button
                              type="button"
                              onClick={() => usarPreco(meio.precoSugerido)}
                              disabled={salvando}
                              className="text-xs font-semibold text-primary hover:text-brown disabled:opacity-40"
                            >
                              usar
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-text-light mt-2">
              O preço do crédito é o que garante a margem em qualquer forma de pagamento —
              no pix você recebe a mais em vez de a menos.
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <Button type="button" onClick={() => salvar()} disabled={salvando} className="flex-1">
            {salvando ? 'Salvando...' : 'Salvar ficha'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function Linha({ rotulo, valor, detalhe, forte }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={forte ? 'font-semibold' : 'text-text-light'}>
        {rotulo}
        {detalhe && <span className="block text-xs text-text-light font-normal">{detalhe}</span>}
      </span>
      <span className={`tabular-nums ${forte ? 'font-bold' : ''}`}>{valor}</span>
    </div>
  )
}

function PorSabor({ porSabor }) {
  return (
    <div>
      <p className="text-xs font-semibold text-text-light uppercase tracking-wide mb-2">
        Por sabor, recebendo no crédito
      </p>
      <div className="border-2 border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-text-light">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">Sabor</th>
              <th className="text-right px-3 py-2 font-semibold">Preço</th>
              <th className="text-right px-3 py-2 font-semibold">Custo do pacote</th>
              <th className="text-right px-3 py-2 font-semibold">Margem</th>
              <th className="text-right px-3 py-2 font-semibold">Preço para a margem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {porSabor.map(({ sabor, conta, preco }) => {
              const credito = conta.porMeio.find(m => m.chave === 'credito')
              return (
                <tr key={sabor.id}>
                  <td className="px-3 py-2">{sabor.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(preco)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{conta.temFicha ? formatCurrency(conta.custoTotal) : '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ROTULO_DA_FAIXA[faixaDaMargem(credito?.margem)].classe}`}>
                      {conta.temFicha ? formatPercent(credito?.margem) : 'Sem ficha'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {credito?.precoSugerido == null ? '—' : formatCurrency(credito.precoSugerido)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-text-light mt-2">
        O preço muda na tela de Produtos. O do crédito é o que segura a margem em qualquer forma de pagamento.
      </p>
    </div>
  )
}
