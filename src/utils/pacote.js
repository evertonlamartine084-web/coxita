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
        ? `Faltam ${falta} salgados para fechar o pacote.`
        : `Você passou ${-falta} salgados do pacote.`,
    }
  }

  return { valido: true, erro: null }
}
