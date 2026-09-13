import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Identidade de uma linha do carrinho.
 *
 * Nao basta o id do produto: dois "Cento de Salgados" com sabores diferentes
 * sao linhas distintas, e somar as quantidades deles perderia a escolha do
 * cliente. A assinatura dos sabores entra na chave.
 */
export function chaveDaLinha(produto, sabores) {
  if (!sabores?.length) return String(produto.id)
  const assinatura = [...sabores]
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map(s => `${s.id}x${s.quantity}`)
    .join(',')
  return `${produto.id}|${assinatura}`
}

export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],
      deliveryFee: 0,

      /**
       * @param {object} product
       * @param {Array<{id, name, quantity}>|null} flavors sabores escolhidos,
       *        obrigatorio para produtos com pack_size.
       */
      addItem: (product, flavors = null) => {
        const sabores = flavors ?? product.flavors ?? null
        const lineId = chaveDaLinha(product, sabores)
        const items = get().items
        const existente = items.find(i => i.lineId === lineId)

        if (existente) {
          set({
            items: items.map(i =>
              i.lineId === lineId ? { ...i, quantity: i.quantity + 1 } : i
            ),
          })
        } else {
          set({ items: [...items, { ...product, flavors: sabores, lineId, quantity: 1 }] })
        }
      },

      removeItem: (lineId) => {
        set({ items: get().items.filter(i => i.lineId !== lineId) })
      },

      updateQuantity: (lineId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(lineId)
          return
        }
        set({
          items: get().items.map(i =>
            i.lineId === lineId ? { ...i, quantity } : i
          ),
        })
      },

      setDeliveryFee: (fee) => set({ deliveryFee: fee }),

      getSubtotal: () => {
        return get().items.reduce((sum, i) => sum + i.price * i.quantity, 0)
      },

      getTotal: () => {
        return get().getSubtotal() + get().deliveryFee
      },

      getItemCount: () => {
        return get().items.reduce((sum, i) => sum + i.quantity, 0)
      },

      /**
       * Confere o carrinho contra o catalogo que acabou de ser carregado.
       *
       * Cada linha guarda uma copia do produto -- preco incluido --, e essa
       * copia envelhece: quem tinha um meio cento no carrinho quando ele
       * custava R$ 15,79 no pix continuaria fechando por R$ 15,79 depois da
       * cozinha mudar a tabela. O preco que vale e o do banco, entao ele
       * sobrescreve o da copia; produto que saiu do cardapio some da lista.
       *
       * So grava quando algo de fato mudou: `set` a cada render remontaria o
       * carrinho inteiro sem necessidade.
       */
      sincronizarComCatalogo: (produtos) => {
        if (!produtos?.length) return
        const porId = new Map(produtos.map(p => [String(p.id), p]))
        let mudou = false

        const items = get().items.flatMap(item => {
          const atual = porId.get(String(item.id))
          if (!atual) { mudou = true; return [] }
          const preco = Number(atual.price)
          const aVista = atual.cash_price ?? null
          if (item.price === preco && (item.cash_price ?? null) === aVista) return [item]
          mudou = true
          return [{ ...item, price: preco, cash_price: aVista }]
        })

        if (mudou) set({ items })
      },

      clearCart: () => set({ items: [], deliveryFee: 0 }),
    }),
    {
      name: 'coxita-cart',
      version: 3,
      // O carrinho guarda uma copia do produto, preco incluido. Quando a tabela
      // de precos muda, essas copias envelhecem: um carrinho salvo continuaria
      // cobrando o valor antigo e sem o preco a vista, que nem existia no item.
      // Nao da para corrigir aqui (a migracao nao le o banco), entao o carrinho
      // e esvaziado -- e melhor o cliente montar de novo do que fechar pedido
      // por um preco que a cozinha nao pratica mais.
      //
      // A versao 2 resolvia outra coisa: carrinhos anteriores aos sabores nao
      // tinham lineId, e sem ele remover/alterar item nao achava a linha.
      migrate: (estado, versaoAnterior) => {
        if (versaoAnterior < 3) return { ...estado, items: [], deliveryFee: 0 }
        return estado
      },
    }
  )
)
