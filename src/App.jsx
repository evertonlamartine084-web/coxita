import { useEffect, lazy, Suspense, Component } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { onAuthStateChange } from './services/auth'
import { useAuthStore } from './store/authStore'
import PublicLayout from './components/layout/PublicLayout'
import AdminLayout from './components/layout/AdminLayout'
import ProtectedRoute from './components/layout/ProtectedRoute'
import Loading from './components/ui/Loading'
import SeloAmbiente from './components/ui/SeloAmbiente'
import { importarPagina } from './routes/importers'
import { LISTA_OCASIOES } from './content/ocasioes'
import { BAIRROS } from './content/bairros'

/**
 * Recarrega uma vez so.
 *
 * Depois de um deploy, o HTML novo pode pedir um chunk que o cache ainda nao
 * tem -- recarregar resolve. Mas se o erro nao for esse (um bug de render, por
 * exemplo), recarregar de novo da no mesmo erro, e a pagina entra em loop de
 * refresh: a tela pisca sem parar e nao da nem para ler a mensagem.
 *
 * A marca fica na aba (sessionStorage), entao o proximo deploy volta a poder
 * recarregar uma vez.
 */
const MARCA_DE_RELOAD = 'coxelli:recarregou-por-erro'

function recarregarUmaVez() {
  try {
    const quando = Number(sessionStorage.getItem(MARCA_DE_RELOAD) || 0)
    if (Date.now() - quando < 60_000) return false
    sessionStorage.setItem(MARCA_DE_RELOAD, String(Date.now()))
  } catch {
    // aba anonima com storage bloqueado: recarrega e torce
  }
  window.location.reload()
  return true
}

function lazyWithRetry(importFn) {
  return lazy(() =>
    importFn().catch((erro) => {
      if (recarregarUmaVez()) return new Promise(() => {})
      throw erro
    })
  )
}

class ErrorBoundary extends Component {
  state = { hasError: false, recarregando: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(erro) {
    console.error('Erro de render:', erro)
    const recarregou = recarregarUmaVez()
    if (recarregou) this.setState({ recarregando: true })
  }
  render() {
    if (this.state.hasError && this.state.recarregando) return <Loading />
    if (this.state.hasError) {
      // Ja recarregou uma vez e o erro continua: mostra a saida em vez de
      // piscar a tela para sempre.
      return (
        <div className="min-h-screen flex items-center justify-center p-6 text-center">
          <div>
            <p className="font-semibold text-lg">Algo quebrou nesta tela.</p>
            <p className="text-sm text-gray-500 mt-1 mb-4">
              Recarregar não resolveu. O erro está no console do navegador.
            </p>
            <button
              onClick={() => {
                try { sessionStorage.removeItem(MARCA_DE_RELOAD) } catch { /* vazio */ }
                window.location.href = '/'
              }}
              className="border-2 border-brown px-4 py-2 font-semibold"
            >
              Voltar ao início
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// Lazy load pages. Os importers vivem em routes/importers.js para que o
// prefetch do Header aqueca exatamente estes mesmos chunks.
const HomePage = lazyWithRetry(importarPagina.home)
const MenuPage = lazyWithRetry(importarPagina.cardapio)
const FlavorsIndexPage = lazyWithRetry(importarPagina.sabores)
const FlavorPage = lazyWithRetry(importarPagina.sabor)
const OccasionPage = lazyWithRetry(importarPagina.ocasiao)
const BairrosIndexPage = lazyWithRetry(importarPagina.bairros)
const BairroPage = lazyWithRetry(importarPagina.bairro)
const CartPage = lazyWithRetry(importarPagina.carrinho)
const CheckoutPage = lazyWithRetry(importarPagina.checkout)
const OrderConfirmationPage = lazyWithRetry(importarPagina.pedidoConfirmado)
const PaymentFailedPage = lazyWithRetry(importarPagina.pagamentoFalhou)
const OrderTrackingPage = lazyWithRetry(importarPagina.acompanhar)
const OrderHistoryPage = lazyWithRetry(importarPagina.meusPedidos)
const LoginPage = lazyWithRetry(importarPagina.login)
const DashboardPage = lazyWithRetry(importarPagina.dashboard)
const OrdersPage = lazyWithRetry(importarPagina.pedidos)
const CustomersPage = lazyWithRetry(importarPagina.clientes)
const BlingCallbackPage = lazyWithRetry(importarPagina.blingCallback)
const ProductsPage = lazyWithRetry(importarPagina.produtos)
const MargensPage = lazyWithRetry(importarPagina.margens)
const PrecosPage = lazyWithRetry(importarPagina.precos)
const EstoquePage = lazyWithRetry(importarPagina.estoque)
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
      <SeloAmbiente />
      <ErrorBoundary>
      <Suspense fallback={<Loading />}>
        <Routes>
          {/* Public */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/cardapio" element={<MenuPage />} />
            {/* Paginas de conteudo. Existem para busca: o cardapio vende para
                quem ja decidiu, estas respondem a quem ainda esta escolhendo.

                As ocasioes saem de `content/ocasioes.js` em vez de uma rota
                parametrizada: o React Router nao casa parametro no meio de um
                segmento, entao `/salgados-para-:ocasiao` nunca bateria com
                `/salgados-para-festa`. O map mantem a fonte unica -- cadastrar
                ocasiao la publica a rota aqui. */}
            <Route path="/salgados" element={<FlavorsIndexPage />} />
            <Route path="/salgados/:slug" element={<FlavorPage />} />
            {LISTA_OCASIOES.map(ocasiao => (
              <Route key={ocasiao.slug} path={`/${ocasiao.slug}`} element={<OccasionPage />} />
            ))}
            {/* Bairros. O indice vem antes das 36 para que `/salgados-em-natal`
                nunca seja lido como o bairro "natal", que nao existe. */}
            <Route path="/salgados-em-natal" element={<BairrosIndexPage />} />
            {BAIRROS.map(bairro => (
              <Route key={bairro.slug} path={`/salgados-em-${bairro.slug}`} element={<BairroPage />} />
            ))}
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
            <Route path="clientes" element={<CustomersPage />} />
            <Route path="bling/callback" element={<BlingCallbackPage />} />
            <Route path="produtos" element={<ProductsPage />} />
            <Route path="margens" element={<MargensPage />} />
            <Route path="precos" element={<PrecosPage />} />
            <Route path="estoque" element={<EstoquePage />} />
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
