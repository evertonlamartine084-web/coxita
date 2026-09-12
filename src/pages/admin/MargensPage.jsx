import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  getInsumos, getFichas, getParams, salvarParams,
  deleteInsumo, insumoEstaEmUso,
} from '../../services/custos'
import {
  custoPorInsumo, calcularProduto, faixaDaMargem, ROTULO_DA_FAIXA, PARAMS_PADRAO,
} from '../../utils/margem'
import {
  formatCurrency, formatCurrencyFine, formatPercent, formatQuantidade,
} from '../../utils/format'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Loading from '../../components/ui/Loading'
import FichaProdutoModal from '../../components/admin/FichaProdutoModal'
import InsumoModal from '../../components/admin/InsumoModal'

/**
 * Onde o preço do cardápio deixa de ser chute.
 *
 * A tela responde uma pergunta por aba: quanto custa o que eu vendo
 * (Produtos), quanto custa o que eu compro (Insumos) e quanto tem que sobrar
 * (Preço). A conta inteira vive em src/utils/margem.js.
 */
export default function MargensPage() {
  const [insumos, setInsumos] = useState([])
  const [fichas, setFichas] = useState([])
  const [params, setParams] = useState(PARAMS_PADRAO)
  const [carregando, setCarregando] = useState(true)
  const [aba, setAba] = useState('produtos')
  const [produtoAberto, setProdutoAberto] = useState(null)
  const [insumoAberto, setInsumoAberto] = useState(null)

  // Recarrega sem voltar para o "Carregando...": depois de salvar uma ficha a
  // tela ja tem dados na mao, e piscar a pagina inteira esconde o numero que
  // o dono acabou de mudar.
  const carregar = async () => {
    try {
      const [i, f, p] = await Promise.all([getInsumos(), getFichas(), getParams()])
      setInsumos(i)
      setFichas(f)
      setParams(p)
    } catch (erro) {
      console.error(erro)
      toast.error('Erro ao carregar os custos.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { carregar() }, [])

  const custos = useMemo(() => custoPorInsumo(insumos), [insumos])
  const contas = useMemo(
    () => fichas.map(produto => ({ produto, conta: calcularProduto(produto, custos, params) })),
    [fichas, custos, params],
  )

  if (carregando) return <Loading />

  const comFicha = contas.filter(c => c.conta.temFicha)
  const emRisco = comFicha.filter(c => (c.conta.piorCaso?.margem ?? 0) < 20)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h1 className="text-2xl font-bold">Margens</h1>
        {aba === 'insumos' && (
          <Button size="sm" onClick={() => setInsumoAberto({})}>+ Novo item</Button>
        )}
      </div>
      <p className="text-sm text-text-light mb-6">
        Lance o que você pagou em cada coisa; o custo do produto e o preço saem da conta.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Cartao rotulo="Produtos com ficha" valor={`${comFicha.length} de ${fichas.length}`} />
        <Cartao
          rotulo="Margem desejada"
          valor={formatPercent(params.default_margin, 0)}
          detalhe={`imposto ${formatPercent(params.tax_percent, 2)}`}
        />
        <Cartao
          rotulo="Custo fixo por unidade"
          valor={formatCurrencyFine(params.fixed_cost_per_unit, 2)}
        />
        <Cartao
          rotulo="Margem apertada"
          valor={String(emRisco.length)}
          detalhe={emRisco.length ? 'abaixo de 20% no crédito' : 'nenhum produto'}
          alerta={emRisco.length > 0}
        />
      </div>

      <div className="flex gap-2 mb-4 border-b-2 border-border">
        {[
          { chave: 'produtos', rotulo: 'Produtos' },
          { chave: 'insumos', rotulo: 'Insumos e recheios' },
          { chave: 'preco', rotulo: 'Preço' },
        ].map(t => (
          <button
            key={t.chave}
            onClick={() => setAba(t.chave)}
            className={`px-4 py-2 -mb-0.5 border-b-4 font-display font-extrabold uppercase text-sm tracking-wide transition-colors ${
              aba === t.chave
                ? 'border-primary text-brown'
                : 'border-transparent text-text-light hover:text-brown'
            }`}
          >
            {t.rotulo}
          </button>
        ))}
      </div>

      {aba === 'produtos' && (
        <TabelaProdutos contas={contas} onAbrir={setProdutoAberto} />
      )}

      {aba === 'insumos' && (
        <PainelInsumos
          insumos={insumos}
          fichas={fichas}
          custos={custos}
          onEditar={setInsumoAberto}
          onRecarregar={carregar}
        />
      )}

      {aba === 'preco' && (
        <PainelPreco params={params} onSalvo={(novos) => { setParams(novos); carregar() }} />
      )}

      {produtoAberto && (
        <FichaProdutoModal
          produto={produtoAberto}
          insumos={insumos}
          custos={custos}
          params={params}
          onClose={() => setProdutoAberto(null)}
          onSalvo={carregar}
        />
      )}

      {insumoAberto && (
        <InsumoModal
          insumo={insumoAberto.id ? insumoAberto : null}
          insumos={insumos}
          onClose={() => setInsumoAberto(null)}
          onSalvo={carregar}
        />
      )}
    </div>
  )
}

function Cartao({ rotulo, valor, detalhe, alerta }) {
  return (
    <div className={`bg-white rounded-xl border-2 p-4 ${alerta ? 'border-danger/50' : 'border-gray-200'}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-text-light">{rotulo}</p>
      <p className={`text-xl font-bold mt-1 ${alerta ? 'text-danger' : ''}`}>{valor}</p>
      {detalhe && <p className="text-xs text-text-light mt-0.5">{detalhe}</p>}
    </div>
  )
}

function TabelaProdutos({ contas, onAbrir }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Produto</th>
              <th className="text-right px-4 py-3 font-medium">Preço</th>
              <th className="text-right px-4 py-3 font-medium">Custo</th>
              <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">Sobra no crédito</th>
              <th className="text-right px-4 py-3 font-medium">Margem</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {contas.map(({ produto, conta }) => {
              const faixa = ROTULO_DA_FAIXA[faixaDaMargem(conta.piorCaso?.margem)]
              return (
                <tr key={produto.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium">{produto.name}</p>
                    <p className="text-xs text-text-light">
                      {produto.categories?.name || 'Sem categoria'}
                      {conta.unidades > 1 && ` · pacote de ${conta.unidades}`}
                      {!produto.active && ' · inativo'}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(produto.price)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {conta.temFicha ? (
                      <>
                        {formatCurrency(conta.custoTotal)}
                        {conta.unidades > 1 && (
                          <span className="block text-xs text-text-light">
                            {formatCurrencyFine(conta.custoUnidade, 3)}/un
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-text-light">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">
                    {conta.temFicha ? formatCurrency(conta.piorCaso?.lucro ?? 0) : <span className="text-text-light">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${faixa.classe}`}>
                      {conta.temFicha ? formatPercent(conta.piorCaso?.margem) : faixa.texto}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onAbrir(produto)}
                      className="text-primary hover:underline text-sm font-semibold"
                    >
                      {conta.temFicha ? 'Ficha' : 'Montar ficha'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PainelInsumos({ insumos, fichas, custos, onEditar, onRecarregar }) {
  const comprados = insumos.filter(i => i.kind === 'insumo')
  const produzidos = insumos.filter(i => i.kind === 'recheio')

  const excluir = async (item) => {
    if (insumoEstaEmUso(item.id, insumos, fichas)) {
      toast.error(`${item.name} está em uso em alguma ficha. Tire de lá primeiro.`)
      return
    }
    if (!confirm(`Excluir ${item.name}?`)) return
    try {
      await deleteInsumo(item.id)
      toast.success('Item excluído!')
      onRecarregar()
    } catch (erro) {
      console.error(erro)
      toast.error('Erro ao excluir.')
    }
  }

  const Linha = ({ item, children }) => (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3">
        <p className="font-medium">{item.name}</p>
        {item.note && <p className="text-xs text-text-light">{item.note}</p>}
      </td>
      {children}
      <td className="px-4 py-3 text-right font-semibold tabular-nums">
        {formatCurrencyFine(custos.get(item.id) ?? 0, 4)}
        <span className="text-xs text-text-light font-normal">/{item.unit}</span>
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2 justify-end">
          <button onClick={() => onEditar(item)} className="text-primary hover:underline text-sm">Editar</button>
          <button onClick={() => excluir(item)} className="text-danger hover:underline text-sm">Excluir</button>
        </div>
      </td>
    </tr>
  )

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <header className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="font-display font-extrabold uppercase text-sm tracking-wide text-brown">
            Comprados
          </h2>
          <p className="text-xs text-text-light">O que veio da nota. Mudou o preço? Edite aqui e toda ficha se atualiza.</p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/50 border-b border-gray-200 text-xs uppercase tracking-wide text-text-light">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Insumo</th>
                <th className="text-right px-4 py-2 font-semibold">Paguei</th>
                <th className="text-right px-4 py-2 font-semibold">Veio</th>
                <th className="text-right px-4 py-2 font-semibold">Custo</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {comprados.map(item => (
                <Linha key={item.id} item={item}>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(item.pack_price)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-light">
                    {formatQuantidade(item.pack_quantity)} {item.unit}
                  </td>
                </Linha>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <header className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="font-display font-extrabold uppercase text-sm tracking-wide text-brown">
            Produzidos
          </h2>
          <p className="text-xs text-text-light">
            Recheios com receita própria. O custo por kg sai do lote dividido pelo que ele rende.
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/50 border-b border-gray-200 text-xs uppercase tracking-wide text-text-light">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Recheio</th>
                <th className="text-right px-4 py-2 font-semibold">Itens</th>
                <th className="text-right px-4 py-2 font-semibold">Rende</th>
                <th className="text-right px-4 py-2 font-semibold">Custo</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {produzidos.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-text-light">Nenhum recheio cadastrado.</td></tr>
              )}
              {produzidos.map(item => (
                <Linha key={item.id} item={item}>
                  <td className="px-4 py-3 text-right tabular-nums text-text-light">
                    {(item.supply_recipe_items ?? []).length}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-light">
                    {formatQuantidade(item.yield_quantity)} {item.unit}
                  </td>
                </Linha>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function PainelPreco({ params, onSalvo }) {
  const [form, setForm] = useState({
    default_margin: String(params.default_margin),
    tax_percent: String(params.tax_percent),
    fixed_cost_per_unit: String(params.fixed_cost_per_unit),
    fee_credit: String(params.fee_credit),
    fee_debit: String(params.fee_debit),
    fee_pix: String(params.fee_pix),
    rounding_step: String(params.rounding_step ?? 0),
  })
  const [salvando, setSalvando] = useState(false)

  const campos = [
    { chave: 'default_margin', label: 'Margem desejada (%)', ajuda: 'Vale para o produto que não tem margem própria.' },
    { chave: 'tax_percent', label: 'Imposto sobre a venda (%)', ajuda: 'O que sai de imposto em cada pedido.' },
    { chave: 'fixed_cost_per_unit', label: 'Custo fixo por unidade (R$)', ajuda: 'Aluguel, luz, gás e afins rateados por unidade vendida.' },
    { chave: 'fee_credit', label: 'Taxa do crédito (%)', ajuda: 'O que a maquininha desconta.' },
    { chave: 'fee_debit', label: 'Taxa do débito (%)' },
    { chave: 'fee_pix', label: 'Taxa do pix (%)', ajuda: 'Normalmente zero.' },
    { chave: 'rounding_step', label: 'Arredondar de quanto em quanto (R$)', ajuda: 'Sempre para cima: 0,05 transforma R$ 0,7413 em R$ 0,75. Zero desliga.' },
  ]

  const submeter = async (e) => {
    e.preventDefault()
    setSalvando(true)
    try {
      const salvos = await salvarParams(
        Object.fromEntries(campos.map(c => [c.chave, Number(form[c.chave]) || 0])),
      )
      toast.success('Parâmetros salvos!')
      onSalvo(salvos)
    } catch (erro) {
      console.error(erro)
      toast.error('Erro ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={submeter} className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 max-w-2xl">
      <p className="text-sm text-text-light mb-4">
        Estes números entram no preço de todo produto. Margem, imposto e taxa saem de dentro do
        preço, não por cima do custo — por isso o preço sugerido divide, em vez de multiplicar.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        {campos.map(campo => (
          <div key={campo.chave}>
            <Input
              label={campo.label}
              type="number" step="0.01" min="0"
              value={form[campo.chave]}
              onChange={(e) => setForm(f => ({ ...f, [campo.chave]: e.target.value }))}
            />
            {campo.ajuda && <p className="text-xs text-text-light mt-1">{campo.ajuda}</p>}
          </div>
        ))}
      </div>
      <Button type="submit" className="mt-6" disabled={salvando}>
        {salvando ? 'Salvando...' : 'Salvar parâmetros'}
      </Button>
    </form>
  )
}
