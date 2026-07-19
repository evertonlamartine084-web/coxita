import { useEffect, lazy, Suspense, Component } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { onAuthStateChange } from './services/auth'
import { useAuthStore } from './store/authStore'
import PublicLayout from './components/layout/PublicLayout'
import AdminLayout from './components/layout/AdminLayout'
import ProtectedRoute from './components/layout/ProtectedRoute'
import Loading from './components/ui/Loading'
import { importarPagina } from './routes/importers'

// Retry lazy import on chunk load failure (common after new deploys)
function lazyWithRetry(importFn) {
  return lazy(() =>
    importFn().catch(() => {
      // Chunk failed to load - reload page to get fresh assets
      window.location.reload()
      return new Promise(() => {}) // keep suspense alive while reloading
    })
  )
}

// Error boundary to catch render errors from stale chunks
class ErrorBoundary extends Component {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch() {
    // Force reload to get fresh chunks
    window.location.reload()
  }
  render() {
    if (this.state.hasError) return <Loading />
    return this.props.children
  }
}

// Lazy load pages. Os importers vivem em routes/importers.js para que o
// prefetch do Header aqueca exatamente estes mesmos chunks.
const HomePage = lazyWithRetry(importarPagina.home)
const MenuPage = lazyWithRetry(importarPagina.cardapio)
const CartPage = lazyWithRetry(importarPagina.carrinho)
const CheckoutPage = lazyWithRetry(importarPagina.checkout)
const OrderConfirmationPage = lazyWithRetry(importarPagina.pedidoConfirmado)
const PaymentFailedPage = lazyWithRetry(importarPagina.pagamentoFalhou)
const OrderTrackingPage = lazyWithRetry(importarPagina.acompanhar)
const OrderHistoryPage = lazyWithRetry(importarPagina.meusPedidos)
const LoginPage = lazyWithRetry(importarPagina.login)
const DashboardPage = lazyWithRetry(importarPagina.dashboard)
const OrdersPage = lazyWithRetry(importarPagina.pedidos)
const ProductsPage = lazyWithRetry(importarPagina.produtos)
const CategoriesPage = lazyWithRetry(importarPagina.categorias)
const SettingsPage = lazyWithRetry(importarPagina.configuracoes)
const ReviewsPage = lazyWithRetry(importarPagina.avaliacoes)
const CouponsPage = lazyWithRetry(importarPagina.cupons)

export default function App() {
  const setSession = useAuthStore(s => s.setSession)

  useEffect(() => {
    const { data: { subscription } } = onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [setSession])

  return (
    <BrowserRouter>
      <Toaster position="top-center" toastOptions={{ duration: 2000 }} />
      <ErrorBoundary>
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
            <Route path="/meus-pedidos" element={<OrderHistoryPage />} />
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
            <Route path="cupons" element={<CouponsPage />} />
            <Route path="avaliacoes" element={<ReviewsPage />} />
            <Route path="configuracoes" element={<SettingsPage />} />
          </Route>
        </Routes>
      </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
