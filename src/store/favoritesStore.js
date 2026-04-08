import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useFavoritesStore = create(
  persist(
    (set, get) => ({
      favorites: [],

      toggleFavorite: (productId) => {
        const favs = get().favorites
        if (favs.includes(productId)) {
          set({ favorites: favs.filter(id => id !== productId) })
        } else {
          set({ favorites: [...favs, productId] })
        }
      },

      isFavorite: (productId) => {
        return get().favorites.includes(productId)
      },

      getFavoritesCount: () => {
        return get().favorites.length
      },
    }),
    {
      name: 'coxita-favorites',
    }
  )
)
