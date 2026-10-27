import { Fragment, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  getInsumos, getFichas, getParams, getSabores, getMixDeSabores, salvarParams,
  deleteInsumo, insumoEstaEmUso,
} from '../../services/custos'
import {
  custoPorInsumo, calcularProduto, calcularPorSabor, margemPelaVenda, faixaDaMargem, ROTULO_DA_FAIXA, PARAMS_PADRAO,
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
 *
 * O preço dos insumos anda sozinho: item de compra ligado a um insumo (tela de Compras) põe o
 * preço pago nele. Pacote de sabor à escolha mostra a margem do pior sabor, que é a que manda.
 */

/** Tamanhos na ordem da tabela; o que não é pacote (gourmet por unidade) fica no fim. */
const TAMANHOS = [200, 100, 50, 25]

/** Como a cozinha separa o que vende: o que sai frito, o que sai congelado e os finos. */
const TIPOS = [
  { chave: 'frito', rotulo: 'Fritos' },
  { chave: 'congelado', rotulo: 'Congelados' },
  { chave: 'gourmet', rotulo: 'Gourmet' },
]

function tipoDoProduto(produto) {
  const slug = produto.categories?.slug ?? ''
  if (slug === 'congelados') return 'congelado'
  if (slug.startsWith('gourmet')) return 'gourmet'
  return 'frito'
}

/** Janela de vendas que dá o peso de cada sabor na margem média. */
const DIAS_DO_MIX = 30

/** Preço de insumo mais velho que isto aparece marcado: provavelmente mudou. */
const DIAS_PRECO_VELHO = 45

function diasDoPreco(insumo) {
  if (!insumo.preco_em) return null
  return Math.floor((Date.now() - new Date(`${insumo.preco_em}T12:00:00`).getTime()) / 864e5)
}
export default function MargensPage() {
  const [insumos, setInsumos] = useState([])
  const [fichas, setFichas] = useState([])
  const [sabores, setSabores] = useState([])
  const [mix, setMix] = useState(new Map())
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
      const [i, f, p, sab, m] = await Promise.all([
        getInsumos(), getFichas(), getParams(), getSabores(), getMixDeSabores(DIAS_DO_MIX).catch(() => new Map()),
      ])
      setMix(m)
      setInsumos(i)
      setFichas(f)
      setParams(p)
      setSabores(sab)
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
    () => fichas.map(produto => {
      const porSabor = calcularPorSabor(produto, sabores, custos, params)
      // Com sabor à escolha, a linha do produto é a do pior sabor (calcularPorSabor ordena).
      const pior = porSabor.find(s => s.conta.temFicha)
      return {
        produto, porSabor, piorSabor: pior?.sabor,
        conta: pior ? pior.conta : calcularProduto(produto, custos, params),
        preco: pior ? pior.preco : Number(produto.price),
        pelaVenda: porSabor.length > 1 ? margemPelaVenda(porSabor, mix) : null,
      }
    }),
    [fichas, sabores, custos, params, mix],
  )
  const [verInativos, setVerInativos] = useState(false)
  const [tipo, setTipo] = useState('frito')

  if (carregando) return <Loading />

  // Refrigerante é revenda: o preço segue o de mercado e não tem ficha a acompanhar.
  const daCozinha = contas.filter(c => c.produto.categories?.slug !== 'bebidas')
  const noAr = daCozinha.filter(c => c.produto.active)
  const comFicha = noAr.filter(c => c.conta.temFicha)
  const emRisco = comFicha.filter(c => (c.conta.piorCaso?.margem ?? 0) < 20)
  const comprados = insumos.filter(i => i.kind === 'insumo' && i.active !== false)
  const precoVelho = comprados.filter(i => (diasDoPreco(i) ?? Infinity) > DIAS_PRECO_VELHO)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h1 className="text-2xl font-bold">Margens</h1>
        {aba === 'insumos' && (
          <Button size="sm" onClick={() => setInsumoAberto({})}>+ Novo item</Button>
        )}
      </div>
      <p className="text-sm text-text-light mb-6">
        O custo de cada insumo vem da última compra ligada a ele (tela de Compras); o custo do produto e o preço saem da conta.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Cartao rotulo="Produtos no ar com conta" valor={`${comFicha.length} de ${noAr.length}`} />
        <Cartao
          rotulo="Margem desejada"
          valor={formatPercent(params.default_margin, 0)}
          detalhe={`imposto ${formatPercent(params.tax_percent, 2)}`}
        />
        <Cartao
          rotulo="Insumos com preço velho"
          valor={String(precoVelho.length)}
          detalhe={`sem compra nos últimos ${DIAS_PRECO_VELHO} dias`}
          alerta={precoVelho.length > 0}
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
        <>
          <label className="mb-3 flex items-center gap-2 text-sm text-text-light">
            <input type="checkbox" checked={verInativos} onChange={(e) => setVerInativos(e.target.checked)} />
            Mostrar também os produtos fora do ar
          </label>
          <div className="mb-3 flex flex-wrap gap-2">
            {TIPOS.map(t => (
              <button
                key={t.chave}
                type="button"
                onClick={() => setTipo(t.chave)}
                className={`px-3 py-1.5 rounded-full border-2 text-sm font-semibold transition-colors ${
                  tipo === t.chave ? 'border-brown bg-brown text-white' : 'border-border text-text-light hover:text-brown'
                }`}
              >
                {t.rotulo}
              </button>
            ))}
          </div>
          <TabelaProdutos
            contas={(verInativos ? daCozinha : noAr).filter(c => tipoDoProduto(c.produto) === tipo)}
            mix={mix}
            onAbrir={setProdutoAberto}
          />
        </>
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
          sabores={sabores}
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

function TabelaProdutos({ contas, mix, onAbrir }) {
  const [aberto, setAberto] = useState(null)
  const grupos = [
    ...TAMANHOS.map(t => ({ titulo: `Pacotes de ${t}`, contas: contas.filter(c => Number(c.produto.pack_size) === t) })),
    { titulo: 'Por unidade', contas: contas.filter(c => !TAMANHOS.includes(Number(c.produto.pack_size))) },
  ].filter(g => g.contas.length)
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
              <th
                className="text-right px-4 py-3 font-medium"
                title={`Com sabor à escolha: média pelo que vendeu nos últimos ${DIAS_DO_MIX} dias e, embaixo, o pior sabor (cliente que leva tudo do mais caro)`}
              >
                Margem
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          {grupos.map(grupo => (
            <tbody key={grupo.titulo} className="divide-y divide-gray-100">
              <tr className="bg-gray-100">
                <th colSpan={6} className="text-left px-4 py-2 font-display font-extrabold uppercase text-xs tracking-wide text-brown">
                  {grupo.titulo}
                </th>
              </tr>
              {grupo.contas.map(({ produto, conta, porSabor, piorSabor, preco: precoDaLinha, pelaVenda }) => {
                const faixa = ROTULO_DA_FAIXA[faixaDaMargem(conta.piorCaso?.margem)]
                const variosSabores = porSabor.length > 1
                const expandido = aberto === produto.id
                return (
                  <Fragment key={produto.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium">{produto.name}</p>
                        <p className="text-xs text-text-light">
                          {produto.categories?.name || 'Sem categoria'}
                          {conta.unidades > 1 && ` · pacote de ${conta.unidades}`}
                          {!produto.active && ' · fora do ar'}
                        </p>
                        {variosSabores && (
                          <button
                            type="button"
                            onClick={() => setAberto(expandido ? null : produto.id)}
                            className="text-xs text-primary hover:underline"
                          >
                            {expandido ? 'esconder sabores' : `pior sabor: ${piorSabor?.name ?? '—'} · ver os ${porSabor.length}`}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(precoDaLinha)}</td>
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
                        {pelaVenda ? (
                          <>
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${ROTULO_DA_FAIXA[faixaDaMargem(pelaVenda.margem)].classe}`}
                              title={`Pelo que vendeu: ${pelaVenda.vendidos.toLocaleString('pt-BR')} unidades em ${DIAS_DO_MIX} dias`}
                            >
                              {formatPercent(pelaVenda.margem)} média
                            </span>
                            <span className="block mt-1.5 text-xs text-text-light whitespace-nowrap">
                              pior {formatPercent(conta.piorCaso?.margem)}
                            </span>
                          </>
                        ) : (
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${faixa.classe}`}>
                            {conta.temFicha ? formatPercent(conta.piorCaso?.margem) : faixa.texto}
                          </span>
                        )}
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
                    {expandido && porSabor.map(({ sabor, conta: c, preco }) => (
                      <tr key={sabor.id} className="bg-cream/40 text-xs">
                        <td className="pl-8 pr-4 py-2">
                          {sabor.name}
                          <span className="text-text-light"> · {(mix.get(sabor.id) ?? 0).toLocaleString('pt-BR')} vendidos em {DIAS_DO_MIX} dias</span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(preco)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {c.temFicha ? `${formatCurrency(c.custoTotal)} · ${formatCurrencyFine(c.custoUnidade, 3)}/un` : '—'}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums hidden sm:table-cell">
                          {c.temFicha ? formatCurrency(c.piorCaso?.lucro ?? 0) : '—'}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className={`px-2 py-0.5 rounded-full font-semibold ${ROTULO_DA_FAIXA[faixaDaMargem(c.piorCaso?.margem)].classe}`}>
                            {c.temFicha ? formatPercent(c.piorCaso?.margem) : 'Sem ficha'}
                          </span>
                        </td>
                        <td />
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  )
}

function PainelInsumos({ insumos, fichas, custos, onEditar, onRecarregar }) {
  const comprados = insumos.filter(i => i.kind === 'insumo')
  // Ficha de uma unidade de cada sabor (unidade "un") separada das massas e recheios em kg.
  const produzidos = insumos.filter(i => i.kind === 'recheio' && i.unit !== 'un')
  const porUnidade = insumos.filter(i => i.kind === 'recheio' && i.unit === 'un')

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
          <p className="text-xs text-text-light">
            O preço muda sozinho quando um item de compra ligado a ele é lançado (tela de Compras → abra a compra → “ligar”).
            Sem compra há mais de {DIAS_PRECO_VELHO} dias fica marcado: confira ou edite à mão.
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/50 border-b border-gray-200 text-xs uppercase tracking-wide text-text-light">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Insumo</th>
                <th className="text-right px-4 py-2 font-semibold">Paguei</th>
                <th className="text-right px-4 py-2 font-semibold">Veio</th>
                <th className="text-left px-4 py-2 font-semibold">Preço de</th>
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
                  <OrigemDoPreco item={item} />
                </Linha>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <header className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="font-display font-extrabold uppercase text-sm tracking-wide text-brown">
            Massas e recheios
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

      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <header className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="font-display font-extrabold uppercase text-sm tracking-wide text-brown">
            Ficha de cada sabor
          </h2>
          <p className="text-xs text-text-light">
            Uma unidade de cada sabor: massa, recheio e o resto, em kg. É daqui que sai o custo dos pacotes.
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/50 border-b border-gray-200 text-xs uppercase tracking-wide text-text-light">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Sabor</th>
                <th className="text-right px-4 py-2 font-semibold">Itens</th>
                <th className="text-right px-4 py-2 font-semibold" />
                <th className="text-right px-4 py-2 font-semibold">Custo</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {porUnidade.map(item => (
                <Linha key={item.id} item={item}>
                  <td className="px-4 py-3 text-right tabular-nums text-text-light">
                    {(item.supply_recipe_items ?? []).length}
                  </td>
                  <td />
                </Linha>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function OrigemDoPreco({ item }) {
  const dias = diasDoPreco(item)
  const velho = dias === null || dias > DIAS_PRECO_VELHO
  return (
    <td className="px-4 py-3 text-xs">
      <span className={velho ? 'font-semibold text-amber-800' : 'text-text-light'}>
        {item.preco_em ? new Date(`${item.preco_em}T12:00:00`).toLocaleDateString('pt-BR') : 'sem data'}
        {velho && ' · confira'}
      </span>
      {item.preco_origem && <span className="block text-text-light">{item.preco_origem}</span>}
    </td>
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
