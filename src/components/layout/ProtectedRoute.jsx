import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import Loading from '../ui/Loading'

export default function ProtectedRoute({ children }) {
  const { session, loading } = useAuthStore()

  if (loading) return <Loading />
  if (!session) return <Navigate to="/admin/login" replace />

  return children
}
