import { Fragment, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  getInsumos, getFichas, getParams, getSabores, getVendasDeSabores, getHistoricoDePrecos, mixDosSabores, salvarParams,
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
import {
  historicoPorInsumo, compararPreco, lojaDaOrigem, custosHojeEAntes, consumoPelasVendas, usadoEm,
} from '../../utils/precosDosInsumos'
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
  const [vendas, setVendas] = useState([])
  const [historico, setHistorico] = useState([])
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
      const [i, f, p, sab, m, h] = await Promise.all([
        getInsumos(), getFichas(), getParams(), getSabores(), getVendasDeSabores(DIAS_DO_MIX).catch(() => []),
        getHistoricoDePrecos().catch(() => []),
      ])
      setVendas(m)
      setHistorico(h)
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
  const mix = useMemo(() => mixDosSabores(vendas), [vendas])
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
          sabores={sabores}
          vendas={vendas}
          historico={historico}
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

function PainelInsumos({ insumos, fichas, sabores, vendas, historico, custos, onEditar, onRecarregar }) {
  const [aberto, setAberto] = useState(null)
  const porInsumo = useMemo(() => historicoPorInsumo(historico), [historico])
  const consumo = useMemo(() => consumoPelasVendas(vendas, fichas, sabores, insumos), [vendas, fichas, sabores, insumos])
  const custos30 = useMemo(() => custosHojeEAntes(insumos, porInsumo, 30), [insumos, porInsumo])
  const mix = useMemo(() => mixDosSabores(vendas), [vendas])

  // Comprados, do que mais pesa no custo do mês para o que menos pesa.
  const comprados = insumos
    .filter(i => i.kind === 'insumo')
    .map(i => {
      const comparacao = compararPreco(i, porInsumo.get(i.id) ?? [])
      const quantidade = consumo.get(i.id) ?? 0
      return { item: i, comparacao, quantidade, peso: quantidade * (comparacao.hoje ?? 0) }
    })
    .sort((x, y) => y.peso - x.peso || x.item.name.localeCompare(y.item.name))
  const pesoTotal = comprados.reduce((soma, c) => soma + c.peso, 0)

  const produzidos = insumos.filter(i => i.kind === 'recheio' && i.unit !== 'un')
  const porUnidade = insumos
    .filter(i => i.kind === 'recheio' && i.unit === 'un')
    .map(i => ({ item: i, sabor: sabores.find(s => s.supply_id === i.id) }))

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

  const variacaoDoCusto = (id) => {
    const hoje = custos30.hoje.get(id) ?? 0
    const antes = custos30.antes.get(id) ?? 0
    return antes > 0 ? (hoje / antes - 1) * 100 : null
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <header className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="font-display font-extrabold uppercase text-sm tracking-wide text-brown">
            Comprados
          </h2>
          <p className="text-xs text-text-light">
            Do que mais pesa no custo para o que menos pesa, pelo que saiu nos últimos {DIAS_DO_MIX} dias. O preço de hoje
            muda sozinho com a compra ligada ao insumo (Compras → abra a compra → “ligar”). Toque no insumo para ver o histórico.
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/50 border-b border-gray-200 text-xs uppercase tracking-wide text-text-light">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Insumo</th>
                <th className="text-right px-4 py-2 font-semibold">Hoje</th>
                <th className="text-right px-4 py-2 font-semibold">Antes</th>
                <th className="text-right px-4 py-2 font-semibold">Variação</th>
                <th className="text-right px-4 py-2 font-semibold">Mais barato em 90 dias</th>
                <th className="text-right px-4 py-2 font-semibold">Peso no mês</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {comprados.map(({ item, comparacao: c, quantidade, peso }) => {
                const expandido = aberto === item.id
                const dias = diasDoPreco(item)
                const velho = dias === null || dias > DIAS_PRECO_VELHO
                return (
                  <Fragment key={item.id}>
                    <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setAberto(expandido ? null : item.id)}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{item.name}</p>
                        {item.note && <p className="text-xs text-text-light max-w-xs">{item.note}</p>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className="font-semibold tabular-nums">{c.hoje ? formatCurrency(c.hoje) : '—'}</span>
                        <span className="text-xs text-text-light">/{item.unit}</span>
                        <span className={`block text-xs ${velho ? 'font-semibold text-amber-800' : 'text-text-light'}`}>
                          {quandoEOnde(item.preco_em, lojaDaOrigem(item.preco_origem), !item.preco_origem?.startsWith('Compra'))}
                          {velho && ' · confira'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {c.antes ? (
                          <>
                            <span className="tabular-nums">{formatCurrency(c.antes.preco)}</span>
                            <span className="block text-xs text-text-light">
                              {quandoEOnde(c.antes.em, c.antes.loja, c.antes.origem === 'planilha')}
                            </span>
                          </>
                        ) : <span className="text-text-light">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Variacao valor={c.variacao} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {c.maisBarato && !c.maisBarato.atual ? (
                          <>
                            <span className="tabular-nums">{formatCurrency(c.maisBarato.preco)}</span>
                            <span className="block text-xs text-text-light">
                              {quandoEOnde(c.maisBarato.em, c.maisBarato.loja, c.maisBarato.origem === 'planilha')}
                            </span>
                            {c.acimaDoMaisBarato > 1 && (
                              <span className="block text-xs font-semibold text-danger">hoje {formatPercent(c.acimaDoMaisBarato, 0)} acima</span>
                            )}
                          </>
                        ) : c.maisBarato ? (
                          <span className="text-xs font-semibold text-green-700">é o de hoje</span>
                        ) : <span className="text-text-light">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {peso > 0 ? (
                          <>
                            <span className="font-semibold tabular-nums">{formatCurrency(peso)}</span>
                            <span className="block text-xs text-text-light">
                              {formatQuantidade(quantidade)} {item.unit} · {formatPercent((peso / pesoTotal) * 100, 0)}
                            </span>
                          </>
                        ) : <span className="text-xs text-text-light">não saiu</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); onEditar(item) }}
                          className="text-primary hover:underline text-sm"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                    {expandido && (
                      <tr className="bg-cream/40">
                        <td colSpan={7} className="px-4 py-3">
                          <HistoricoDoInsumo item={item} lista={porInsumo.get(item.id) ?? []} />
                          <button onClick={() => excluir(item)} className="mt-2 text-xs text-danger hover:underline">
                            Excluir {item.name}
                          </button>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
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
            Receita da cozinha: o custo por kg sai do lote dividido pelo que ele rende, com o preço de hoje de cada insumo.
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/50 border-b border-gray-200 text-xs uppercase tracking-wide text-text-light">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Receita</th>
                <th className="text-right px-4 py-2 font-semibold">Custo hoje</th>
                <th className="text-right px-4 py-2 font-semibold">Em 30 dias</th>
                <th className="text-left px-4 py-2 font-semibold">Vai em</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {produzidos.map(item => {
                const usos = usadoEm(item.id, insumos, sabores)
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-text-light">
                        {(item.supply_recipe_items ?? []).length} itens · rende {formatQuantidade(item.yield_quantity)} {item.unit}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className="font-semibold tabular-nums">{formatCurrency(custos.get(item.id) ?? 0)}</span>
                      <span className="text-xs text-text-light">/{item.unit}</span>
                    </td>
                    <td className="px-4 py-3 text-right"><Variacao valor={variacaoDoCusto(item.id)} /></td>
                    <td className="px-4 py-3 text-xs text-text-light max-w-xs">
                      {usos.length ? usos.join(', ') : 'nenhum sabor'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => onEditar(item)} className="text-primary hover:underline text-sm">Editar</button>
                    </td>
                  </tr>
                )
              })}
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
                <th className="text-right px-4 py-2 font-semibold">Custo por unidade</th>
                <th className="text-right px-4 py-2 font-semibold">Em 30 dias</th>
                <th className="text-right px-4 py-2 font-semibold">Vendidos em {DIAS_DO_MIX} dias</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {porUnidade.map(({ item, sabor }) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium">{sabor?.name ?? item.name}</p>
                    {sabor && !sabor.active && <p className="text-xs text-text-light">fora do cardápio</p>}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {formatCurrencyFine(custos.get(item.id) ?? 0, 3)}
                  </td>
                  <td className="px-4 py-3 text-right"><Variacao valor={variacaoDoCusto(item.id)} /></td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-light">
                    {sabor ? (mix.get(sabor.id) ?? 0).toLocaleString('pt-BR') : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => onEditar(item)} className="text-primary hover:underline text-sm">Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** "21/10 · Eloi Chaves", ou "out · planilha" para o que veio da planilha (sem dia nem loja). */
function quandoEOnde(em, loja, daPlanilha) {
  if (!em) return 'sem data'
  const [, mes, dia] = em.split('-')
  if (daPlanilha) return `${MESES_CURTOS[Number(mes) - 1]} · planilha`
  return `${dia}/${mes}${loja ? ` · ${loja}` : ''}`
}

/** ▲ vermelho quando subiu, ▼ verde quando caiu; abaixo de 1% não conta. */
function Variacao({ valor }) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return <span className="text-text-light">—</span>
  if (Math.abs(valor) < 1) return <span className="text-xs text-text-light">igual</span>
  const subiu = valor > 0
  return (
    <span className={`text-xs font-semibold whitespace-nowrap ${subiu ? 'text-danger' : 'text-green-700'}`}>
      {subiu ? '▲' : '▼'} {formatPercent(Math.abs(valor), 0)}
    </span>
  )
}

function HistoricoDoInsumo({ item, lista }) {
  if (!lista.length) {
    return <p className="text-xs text-text-light">Nenhuma compra registrada ainda. Ligue o item na tela de Compras quando ele vier num cupom.</p>
  }
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-text-light mb-1">Preços pagos</p>
      <ul className="text-xs space-y-0.5">
        {lista.map(h => (
          <li key={h.id} className="flex flex-wrap gap-x-2">
            <span className="w-24 text-text-light">{quandoEOnde(h.em, h.loja, h.origem === 'planilha')}</span>
            <span className="w-24 font-semibold tabular-nums">{formatCurrency(h.preco)}/{item.unit}</span>
            <span className="text-text-light">
              {h.descricao}{h.vezes > 1 ? ` (média de ${h.vezes} compras)` : ''}
            </span>
          </li>
        ))}
      </ul>
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
    {
      chave: 'fixed_cost_per_unit',
      label: 'Custo fixo por unidade (R$)',
      ajuda: 'Recalculado sozinho todo dia 1: despesas fixas da planilha de insumos ÷ unidades vendidas. Mudar aqui vale até lá.',
    },
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
            {campo.chave === 'fixed_cost_per_unit' && params.custo_fixo_conta && (
              <ContaDoCustoFixo conta={params.custo_fixo_conta} />
            )}
          </div>
        ))}
      </div>
      <Button type="submit" className="mt-6" disabled={salvando}>
        {salvando ? 'Salvando...' : 'Salvar parâmetros'}
      </Button>
    </form>
  )
}

/** De onde saiu o custo fixo por unidade: a última conta do rateio (pricing_params.custo_fixo_conta). */
function ContaDoCustoFixo({ conta }) {
  const meses = conta.detalhe?.meses ?? []
  return (
    <div className="mt-2 rounded-lg bg-cream border border-border px-3 py-2 text-xs text-text-light">
      <p>
        {formatCurrency(conta.despesas_mes)} de despesas fixas por mês ÷{' '}
        {Number(conta.unidades).toLocaleString('pt-BR')} unidades vendidas ({conta.mes_das_unidades})
        {conta.por_unidade != null && <> = <strong className="text-brown">{formatCurrencyFine(conta.por_unidade, 4)}</strong> por unidade</>}
        {conta.mantido && ' — pouca venda no mês, ficou o valor anterior'}
      </p>
      {meses.map(m => (
        <p key={m.aba} className="mt-1">
          {m.aba}: {m.itens.map(i => `${i.nome} ${formatCurrency(i.valor)}`).join(' · ')}
        </p>
      ))}
      <p className="mt-1">Conta de {new Date(conta.em).toLocaleDateString('pt-BR')}.</p>
    </div>
  )
}
