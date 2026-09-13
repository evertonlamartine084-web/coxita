/**
 * Ponto unico de import dinamico das paginas.
 *
 * O App monta as rotas a partir daqui e o Header aquece o mesmo modulo no
 * hover. Se as duas listas vivessem separadas, renomear um arquivo quebraria o
 * prefetch em silencio -- ele continuaria "funcionando", so que baixando nada.
 */

export const importarPagina = {
  home: () => import('../pages/public/HomePage'),
  cardapio: () => import('../pages/public/MenuPage'),
  sabores: () => import('../pages/public/FlavorsIndexPage'),
  sabor: () => import('../pages/public/FlavorPage'),
  ocasiao: () => import('../pages/public/OccasionPage'),
  bairros: () => import('../pages/public/BairrosIndexPage'),
  bairro: () => import('../pages/public/BairroPage'),
  carrinho: () => import('../pages/public/CartPage'),
  checkout: () => import('../pages/public/CheckoutPage'),
  pedidoConfirmado: () => import('../pages/public/OrderConfirmationPage'),
  pagamentoFalhou: () => import('../pages/public/PaymentFailedPage'),
  acompanhar: () => import('../pages/public/OrderTrackingPage'),
  meusPedidos: () => import('../pages/public/OrderHistoryPage'),
  login: () => import('../pages/admin/LoginPage'),
  dashboard: () => import('../pages/admin/DashboardPage'),
  pedidos: () => import('../pages/admin/OrdersPage'),
  clientes: () => import('../pages/admin/CustomersPage'),
  blingCallback: () => import('../pages/admin/BlingCallbackPage'),
  produtos: () => import('../pages/admin/ProductsPage'),
  margens: () => import('../pages/admin/MargensPage'),
  precos: () => import('../pages/admin/PrecosPage'),
  categorias: () => import('../pages/admin/CategoriesPage'),
  configuracoes: () => import('../pages/admin/SettingsPage'),
  avaliacoes: () => import('../pages/admin/ReviewsPage'),
  cupons: () => import('../pages/admin/CouponsPage'),
}

const paginaPorRota = {
  '/': 'home',
  '/cardapio': 'cardapio',
  '/salgados': 'sabores',
  '/salgados-em-natal': 'bairros',
  '/carrinho': 'carrinho',
  '/checkout': 'checkout',
  '/meus-pedidos': 'meusPedidos',
  '/acompanhar': 'acompanhar',
}

const jaPedidas = new Set()

/**
 * Comeca a baixar o chunk da rota antes do clique (hover, foco ou toque).
 * Sem isso, o download so comeca depois do clique e a tela fica no
 * "Carregando..." pelo tempo do round-trip.
 */
export function prefetchRota(rota) {
  const chave = paginaPorRota[rota]
  if (!chave || jaPedidas.has(chave)) return
  jaPedidas.add(chave)
  // Falha de rede aqui e irrelevante: a navegacao real tentara de novo.
  importarPagina[chave]().catch(() => jaPedidas.delete(chave))
}
