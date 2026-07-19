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

      clearCart: () => set({ items: [], deliveryFee: 0 }),
    }),
    {
      name: 'coxita-cart',
      version: 2,
      // Carrinhos gravados antes dos sabores nao tem lineId. Sem esta
      // migracao, updateQuantity/removeItem nao achariam a linha e o carrinho
      // ficaria congelado para quem ja tinha itens salvos.
      migrate: (estado, versaoAnterior) => {
        if (versaoAnterior >= 2 || !estado?.items) return estado
        return {
          ...estado,
          items: estado.items.map(item => ({
            ...item,
            flavors: item.flavors ?? null,
            lineId: item.lineId ?? String(item.id),
          })),
        }
      },
    }
  )
)
