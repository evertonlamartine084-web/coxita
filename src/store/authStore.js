import { create } from 'zustand'

export const useAuthStore = create((set) => ({
  session: null,
  loading: true,
  setSession: (session) => set({ session, loading: false }),
  setLoading: (loading) => set({ loading }),
}))
