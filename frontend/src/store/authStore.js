import { create } from 'zustand'
import api from '../services/api'

const useAuthStore = create((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),

  login: async (email, password) => {
    const { token, user } = await api.post('/auth/login', { email, password })
    localStorage.setItem('token', token)
    set({ token, user, isAuthenticated: true })
    return user
  },

  logout: () => {
    localStorage.removeItem('token')
    set({ token: null, user: null, isAuthenticated: false })
  },

  fetchMe: async () => {
    try {
      const { user } = await api.get('/auth/me')
      set({ user })
      return user
    } catch (err) {
      if (err instanceof Error) return // fallo de red, no cerrar sesión
      localStorage.removeItem('token')
      set({ token: null, user: null, isAuthenticated: false })
    }
  },
}))

export default useAuthStore
