import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useLoyaltyStore = create(
  persist(
    (set, get) => ({
      totalItems: 0,
      redeemed: 0,

      addItems: (count) => {
        set({ totalItems: get().totalItems + count })
      },

      getProgress: (goal) => {
        if (!goal || goal <= 0) return { current: 0, goal: 0, canRedeem: false }
        const earned = get().totalItems - (get().redeemed * goal)
        return {
          current: earned % goal,
          goal,
          canRedeem: earned >= goal,
          totalEarned: Math.floor(earned / goal),
        }
      },

      redeem: (goal) => {
        set({ redeemed: get().redeemed + 1 })
      },
    }),
    {
      name: 'coxita-loyalty',
    }
  )
)
