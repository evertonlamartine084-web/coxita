/**
 * Regras de montagem dos pacotes de salgados.
 *
 * O cliente escolhe os sabores de 25 em 25 e a soma tem que bater exatamente
 * com o tamanho do pacote. Um cento aceita ate 4 sabores; 75, ate 3; e assim
 * por diante.
 *
 * A mesma checagem existe no banco (constraint em order_item_flavors), porque
 * validacao de front nao e garantia de nada.
 */

export const PASSO_SABOR = 25

export function ehPacote(produto) {
  return Number.isInteger(produto?.pack_size) && produto.pack_size > 0
}

/**
 * Quantidade real de um sabor no pedido.
 *
 * `sabor.quantity` e sempre POR PACOTE. Se o cliente pediu 2 centos de 100
 * coxinhas, a cozinha frita 200 -- e essa distincao precisa aparecer em toda
 * tela que a cozinha le, senao o pedido sai pela metade.
 */
export function totalDoSabor(quantidadePorPacote, quantidadeDePacotes) {
  return quantidadePorPacote * quantidadeDePacotes
}

/**
 * Sabores que este pacote aceita.
 *
 * `flavor_group` nulo aceita tudo -- e o que os pacotes antigos fazem, de
 * quando existia so um grupo de sabor. Sem este filtro, o cento de pasteis
 * ofereceria coxinha na lista de sabores e o cliente nao teria como saber que
 * aquilo nao devia estar ali.
 */
export function saboresDoPacote(produto, sabores) {
  const grupo = produto?.flavor_group
  if (!grupo) return sabores ?? []
  return (sabores ?? []).filter(s => s.group_slug === grupo)
}

/**
 * Pacote de um sabor so: nao ha o que montar, o pacote inteiro e daquele
 * recheio. E o modelo dos pasteis, onde cada sabor tem preco proprio.
 */
export function ehPacoteDeSaborUnico(produto) {
  return ehPacote(produto) && Boolean(produto?.fixed_flavor_id)
}

/**
 * O sabor de um pacote de sabor unico, no formato que o carrinho espera.
 *
 * Devolve null quando o produto veio sem o sabor embutido -- ai quem chama
 * trata como pacote misto, que e o comportamento antigo, em vez de gravar um
 * pedido sem sabor nenhum.
 */
export function saborUnicoDoPacote(produto) {
  if (!ehPacoteDeSaborUnico(produto)) return null
  const nome = produto.sabor_fixo?.name
  if (!nome) return null
  return [{ id: produto.fixed_flavor_id, name: nome, quantity: produto.pack_size }]
}

/** A aba deste produto vende o pacote em si, e nao o recheio. */
export function vendePeloPacote(produto) {
  return Boolean(produto?.categories?.vende_pelo_pacote)
}

/**
 * Pacotes que aceitam este sabor.
 *
 * Fica de fora a aba que vende pelo pacote: congelado e outro produto -- o
 * cliente leva cru para fritar em casa --, e oferecer "meio cento congelado"
 * no meio dos tamanhos de uma coxinha frita mistura duas compras diferentes.
 * Quem quer congelado vai na aba de congelados.
 */
export function pacotesDoSabor(sabor, pacotes) {
  const candidatos = (pacotes ?? []).filter(p => {
    if (vendePeloPacote(p)) return false
    // Pacote de sabor unico serve a um sabor so, e nao ao grupo inteiro.
    if (p.fixed_flavor_id) return p.fixed_flavor_id === sabor?.id
    return !p.flavor_group || p.flavor_group === sabor?.group_slug
  })

  // O sabor de onde o cliente partiu manda no tipo de pacote: quem clica num
  // pastel quer os pacotes de pastel, e nao o cento de salgados -- que aceita
  // qualquer recheio e por isso entrava na lista de todo mundo. O pacote
  // generico so aparece quando o grupo nao tem pacote proprio, que e o caso da
  // coxinha e dos outros salgados.
  const doGrupo = candidatos.filter(
    p => p.flavor_group === sabor?.group_slug || p.fixed_flavor_id === sabor?.id
  )
  return doGrupo.length > 0 ? doGrupo : candidatos
}

/**
 * Como chamar o que vem dentro do pacote, no plural.
 *
 * Um pacote de pastel dizendo "100 salgados" nao esta errado tecnicamente,
 * mas le como texto que ninguem revisou -- e e justamente na tela onde o
 * cliente decide gastar R$ 76.
 */
const NOME_DA_UNIDADE = {
  salgados: 'salgados',
  pasteis: 'pastéis',
}

export function unidadeDoPacote(produto) {
  return NOME_DA_UNIDADE[produto?.flavor_group] ?? 'salgados'
}

/** Quantos sabores diferentes cabem, no maximo. */
export function maxSabores(packSize) {
  return Math.floor(packSize / PASSO_SABOR)
}

/** Soma das unidades escolhidas. */
export function totalEscolhido(sabores) {
  return (sabores ?? []).reduce((soma, s) => soma + s.quantity, 0)
}

/** Quanto ainda falta escolher. Negativo nao acontece se a UI travar o +. */
export function restante(packSize, sabores) {
  return packSize - totalEscolhido(sabores)
}

/**
 * @returns {{valido: boolean, erro: string|null}}
 */
export function validarComposicao(produto, sabores) {
  if (!ehPacote(produto)) {
    return { valido: true, erro: null }
  }

  const escolhidos = (sabores ?? []).filter(s => s.quantity > 0)

  if (escolhidos.length === 0) {
    return { valido: false, erro: 'Escolha os sabores do seu pacote.' }
  }

  const foraDoPasso = escolhidos.find(s => s.quantity % PASSO_SABOR !== 0)
  if (foraDoPasso) {
    return {
      valido: false,
      erro: `Os sabores sao escolhidos de ${PASSO_SABOR} em ${PASSO_SABOR}.`,
    }
  }

  const total = totalEscolhido(escolhidos)
  if (total !== produto.pack_size) {
    const falta = produto.pack_size - total
    return {
      valido: false,
      erro: falta > 0
        ? `Faltam ${falta} ${unidadeDoPacote(produto)} para fechar o pacote.`
        : `Você passou ${-falta} ${unidadeDoPacote(produto)} do pacote.`,
    }
  }

  return { valido: true, erro: null }
}
