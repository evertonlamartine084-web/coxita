import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { onAuthStateChange } from './services/auth'
import { useAuthStore } from './store/authStore'
import PublicLayout from './components/layout/PublicLayout'
import AdminLayout from './components/layout/AdminLayout'
import ProtectedRoute from './components/layout/ProtectedRoute'
import Loading from './components/ui/Loading'

// Lazy load pages
const HomePage = lazy(() => import('./pages/public/HomePage'))
const MenuPage = lazy(() => import('./pages/public/MenuPage'))
const CartPage = lazy(() => import('./pages/public/CartPage'))
const CheckoutPage = lazy(() => import('./pages/public/CheckoutPage'))
const OrderConfirmationPage = lazy(() => import('./pages/public/OrderConfirmationPage'))
const PaymentFailedPage = lazy(() => import('./pages/public/PaymentFailedPage'))
const OrderTrackingPage = lazy(() => import('./pages/public/OrderTrackingPage'))
const LoginPage = lazy(() => import('./pages/admin/LoginPage'))
const DashboardPage = lazy(() => import('./pages/admin/DashboardPage'))
const OrdersPage = lazy(() => import('./pages/admin/OrdersPage'))
const ProductsPage = lazy(() => import('./pages/admin/ProductsPage'))
const CategoriesPage = lazy(() => import('./pages/admin/CategoriesPage'))
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage'))
const ReviewsPage = lazy(() => import('./pages/admin/ReviewsPage'))

export default function App() {
  const setSession = useAuthStore(s => s.setSession)

  useEffect(() => {
    const { data: { subscription } } = onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  return (
    <BrowserRouter>
      <Toaster position="top-center" toastOptions={{ duration: 2000 }} />
      <Suspense fallback={<Loading />}>
        <Routes>
          {/* Public */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/cardapio" element={<MenuPage />} />
            <Route path="/carrinho" element={<CartPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/pedido-confirmado/:orderNumber" element={<OrderConfirmationPage />} />
            <Route path="/pagamento-falhou/:orderNumber" element={<PaymentFailedPage />} />
            <Route path="/acompanhar" element={<OrderTrackingPage />} />
            <Route path="/acompanhar/:orderNumber" element={<OrderTrackingPage />} />
          </Route>

          {/* Admin */}
          <Route path="/admin/login" element={<LoginPage />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="pedidos" element={<OrdersPage />} />
            <Route path="produtos" element={<ProductsPage />} />
            <Route path="categorias" element={<CategoriesPage />} />
            <Route path="avaliacoes" element={<ReviewsPage />} />
            <Route path="configuracoes" element={<SettingsPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
