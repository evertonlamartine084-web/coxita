/**
 * Custo, margem e preço sugerido de um produto do cardápio.
 *
 * Esta é a única fórmula do sistema. O banco guarda só os números crus
 * (insumo comprado, quantidade na ficha, rendimento, perda, taxas) de
 * propósito: uma view no Postgres calculando o mesmo daria duas fórmulas para
 * discordarem no dia em que uma das duas mudasse.
 *
 * O caminho da conta, do saco de farinha ao preço na etiqueta:
 *
 *   insumo comprado ─> custo por kg        R$ 11,89 o kg de massa
 *   recheio         ─> custo por kg        R$ 114,38 de insumos ÷ 2,914 kg
 *                                          que sobram depois de cozinhar
 *   ficha do produto ─> custo bruto        12 g de massa + 4 g de recheio...
 *   perda            ─> custo real         + o que rasga e queima
 *   custo fixo       ─> custo por unidade   + rateio de aluguel, luz, gás
 *   margem + imposto + taxa do cartão ─> preço
 *
 * Recheio pode entrar em recheio (o de frango para pastel leva o de coxinha
 * dentro), então resolver o custo é recursivo.
 *
 * Margem aqui é sempre sobre a VENDA, não sobre o custo: 30% de margem em um
 * pastel de R$ 1,00 são R$ 0,30 de sobra. Markup, que é sobre o custo, aparece
 * separado -- confundir os dois é o erro clássico de precificação.
 */

/** Ordem em que os meios de pagamento aparecem no painel. */
export const MEIOS_DE_PAGAMENTO = [
  { chave: 'credito', rotulo: 'Crédito', campoTaxa: 'fee_credit' },
  { chave: 'debito', rotulo: 'Débito', campoTaxa: 'fee_debit' },
  { chave: 'pix', rotulo: 'Pix / dinheiro', campoTaxa: 'fee_pix' },
]

export const PARAMS_PADRAO = {
  default_margin: 30,
  rounding_step: 0,
  tax_percent: 0,
  fixed_cost_per_unit: 0,
  fee_credit: 0,
  fee_debit: 0,
  fee_pix: 0,
}

function numero(valor, fallback = 0) {
  const n = Number(valor)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Custo por unidade de cada insumo e recheio, por id.
 *
 * @param insumos lista de supplies, cada recheio com sua ficha em
 *                `supply_recipe_items` ([{ child_id, quantity }])
 * @returns Map<id, custo por unidade>
 */
export function custoPorInsumo(insumos = []) {
  const porId = new Map(insumos.map(i => [i.id, i]))
  const resolvido = new Map()

  // `visitando` protege contra recheio que se referencia em círculo. O banco
  // barra o caso óbvio (parent = child), mas não um ciclo de três saltos --
  // e sem esta guarda a tela travaria em recursão infinita em vez de mostrar
  // um número errado, que é pior.
  function custo(id, visitando) {
    if (resolvido.has(id)) return resolvido.get(id)

    const item = porId.get(id)
    if (!item) return 0
    if (visitando.has(id)) return 0

    let valor = 0
    if (item.kind === 'recheio') {
      const rende = numero(item.yield_quantity)
      if (rende > 0) {
        visitando.add(id)
        const gasto = (item.supply_recipe_items ?? []).reduce(
          (soma, linha) => soma + numero(linha.quantity) * custo(linha.child_id, visitando),
          0,
        )
        visitando.delete(id)
        valor = gasto / rende
      }
    } else {
      const rende = numero(item.pack_quantity)
      if (rende > 0) valor = numero(item.pack_price) / rende
    }

    resolvido.set(id, valor)
    return valor
  }

  for (const insumo of insumos) custo(insumo.id, new Set())
  return resolvido
}

/** Soma das linhas de uma ficha. `custos` é o Map de custoPorInsumo. */
export function custoDaFicha(linhas = [], custos = new Map()) {
  return linhas.reduce((soma, linha) => {
    const id = linha.supply_id ?? linha.child_id
    const quantidade = numero(linha.quantity)
    if (quantidade <= 0) return soma
    return soma + quantidade * (custos.get(id) ?? 0)
  }, 0)
}

/**
 * Arredonda o preço para o próximo múltiplo do passo, SEMPRE para cima.
 *
 * Para cima e não "para o mais próximo": arredondar R$ 0,7413 para R$ 0,70
 * entregaria 26% de margem onde se pediu 30% -- ou seja, o arredondamento
 * comeria justamente o que esta tela existe para proteger. Para cima, a sobra
 * é sua.
 *
 * A conta vai em centavos e com uma folga de 1e-6 porque nenhum dos dois lados
 * é exato em ponto flutuante: sem a folga, `Math.ceil(0.75 / 0.05)` chega a
 * devolver 16 em vez de 15 e empurra um preço já redondo para o degrau
 * seguinte. E os centavos NÃO podem ser arredondados antes do teto -- fazer
 * `Math.round(70.40)` = 70 dava R$ 0,70 para um preço exato de R$ 0,7040, ou
 * seja, 29,6% de margem onde se pediu 30%: exatamente o erro que arredondar
 * para cima existe para evitar.
 */
export function arredondarPreco(valor, passo) {
  const passoNum = numero(passo)
  if (!Number.isFinite(numero(valor)) || passoNum <= 0) return valor
  const degrau = Math.round(passoNum * 100)
  if (degrau <= 0) return valor
  const centavos = numero(valor) * 100
  return (Math.ceil((centavos - 1e-6) / degrau) * degrau) / 100
}

/**
 * Preço que entrega a margem desejada, já pagando imposto e taxa.
 *
 * Os três percentuais saem do MESMO preço, então entram todos no
 * denominador -- somar "custo + 30%" por cima daria margem menor que 30%,
 * porque o imposto ainda tem que sair de dentro do preço encontrado.
 */
export function precoParaMargem(custo, margem, descontos = 0) {
  const total = numero(margem) + numero(descontos)
  if (total < 0 || total >= 100) return null
  return custo / (1 - total / 100)
}

/**
 * Custo e margem do produto inteiro.
 *
 * @param produto {price, pack_size, recipe_yield, waste_percent, target_margin}
 *                com a ficha em `product_recipe_items`
 * @param custos  Map de custoPorInsumo
 * @param params  linha de pricing_params
 */
export function calcularProduto(produto, custos = new Map(), params = PARAMS_PADRAO) {
  const preco = numero(produto?.price)
  const rendimento = Math.max(numero(produto?.recipe_yield, 1), 1)
  const perda = Math.min(Math.max(numero(produto?.waste_percent), 0), 99.99)
  const unidades = numero(produto?.pack_size) > 0 ? numero(produto.pack_size) : 1

  const imposto = numero(params?.tax_percent)
  const custoFixoUnidade = numero(params?.fixed_cost_per_unit)
  const margemAlvo = produto?.target_margin === null || produto?.target_margin === undefined
    ? numero(params?.default_margin)
    : numero(produto.target_margin)

  const linhas = produto?.product_recipe_items ?? []
  const custoFicha = custoDaFicha(linhas, custos)
  const temFicha = custoFicha > 0

  const custoInsumoUnidade = (custoFicha / rendimento) * (1 + perda / 100)
  const custoUnidade = custoInsumoUnidade + custoFixoUnidade
  const custoTotal = custoUnidade * unidades

  const lucroBruto = preco - custoTotal

  const porMeio = MEIOS_DE_PAGAMENTO.map(meio => {
    const taxa = numero(params?.[meio.campoTaxa])
    const descontos = imposto + taxa
    // Imposto e taxa incidem sobre o que o cliente paga, não sobre o custo.
    const lucro = preco - custoTotal - (preco * descontos) / 100
    const exato = temFicha ? precoParaMargem(custoTotal, margemAlvo, descontos) : null
    const arredondado = exato === null ? null : arredondarPreco(exato, params?.rounding_step)
    // Arredondar para cima sobe a margem um tiquinho; e essa, a do numero que
    // vai na etiqueta, e a margem que o dono precisa ver.
    const lucroArredondado = arredondado === null
      ? null
      : arredondado - custoTotal - (arredondado * descontos) / 100

    return {
      ...meio,
      taxa,
      lucro,
      // Sem ficha, o unico custo conhecido e o fixo -- e uma margem calculada
      // so com ele sairia otima justamente no produto do qual nao se sabe
      // nada. Null vira "sem ficha" na tela, que e a verdade.
      margem: temFicha && preco > 0 ? (lucro / preco) * 100 : null,
      precoExato: exato,
      precoSugerido: arredondado,
      margemSugerida: arredondado > 0 ? (lucroArredondado / arredondado) * 100 : null,
    }
  })

  // O pior caso manda na leitura da tabela: se a margem se sustenta no
  // crédito, se sustenta em qualquer forma de pagamento.
  const piorCaso = porMeio.reduce(
    (pior, meio) => (pior === null || (meio.margem ?? 0) < (pior.margem ?? 0) ? meio : pior),
    null,
  )

  return {
    temFicha,
    custoFicha,
    custoInsumoUnidade,
    custoFixoUnidade,
    custoUnidade,
    unidades,
    custoTotal,
    margemAlvo,
    lucroBruto,
    margemBruta: temFicha && preco > 0 ? (lucroBruto / preco) * 100 : null,
    markup: temFicha && custoTotal > 0 ? (preco / custoTotal - 1) * 100 : null,
    porMeio,
    piorCaso,
  }
}

/**
 * Como ler a margem de olho. Os cortes vêm de salgado de festa: abaixo de 20%
 * o pedido não paga imprevisto (gás que acaba, entrega refeita), e acima de
 * 45% é margem confortável para o ramo.
 */
export function faixaDaMargem(margem) {
  if (margem === null || margem === undefined || !Number.isFinite(margem)) return 'semFicha'
  if (margem < 0) return 'prejuizo'
  if (margem < 20) return 'aperto'
  if (margem < 45) return 'ok'
  return 'boa'
}

export const ROTULO_DA_FAIXA = {
  semFicha: { texto: 'Sem ficha', classe: 'bg-gray-100 text-gray-600' },
  prejuizo: { texto: 'Prejuízo', classe: 'bg-red-100 text-red-800' },
  aperto: { texto: 'Apertada', classe: 'bg-yellow-100 text-yellow-800' },
  ok: { texto: 'Saudável', classe: 'bg-blue-100 text-blue-800' },
  boa: { texto: 'Boa', classe: 'bg-green-100 text-green-800' },
}
