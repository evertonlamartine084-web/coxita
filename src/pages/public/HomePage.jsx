import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getFeaturedProducts, getProducts } from '../../services/products'
import { getSettings } from '../../services/settings'
import ProductCarousel from '../../components/product/ProductCarousel'
import Button from '../../components/ui/Button'
import Loading from '../../components/ui/Loading'

export default function HomePage() {
  const [featured, setFeatured] = useState([])
  const [allProducts, setAllProducts] = useState([])
  const [settings, setSettingsData] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [feat, all, setts] = await Promise.all([
          getFeaturedProducts().catch(() => []),
          getProducts().catch(() => []),
          getSettings().catch(() => ({})),
        ])
        setFeatured(feat)
        setAllProducts(all)
        setSettingsData(setts)
      } catch (err) {
        console.error('Erro ao carregar dados:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <Loading />

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-primary to-primary-dark text-white py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <img src="/logo.png" alt="Coxita mascote" className="w-32 h-32 md:w-40 md:h-40 object-contain mx-auto mb-6 drop-shadow-lg" />
          <h1 className="text-4xl md:text-6xl font-bold mb-4">
            As melhores coxinhas<br />da cidade!
          </h1>
          <p className="text-lg md:text-xl text-white/80 mb-8 max-w-2xl mx-auto">
            Crocantes por fora, cremosas por dentro. Feitas com amor e ingredientes selecionados.
          </p>
          <Link to="/cardapio">
            <Button variant="secondary" size="lg">
              Pedir Agora
            </Button>
          </Link>
        </div>
      </section>

      {/* Featured Carousel */}
      {featured.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 py-12">
          <ProductCarousel products={featured} title="⭐ Destaques" />
          <div className="text-center mt-8">
            <Link to="/cardapio">
              <Button variant="outline">Ver Cardápio Completo</Button>
            </Link>
          </div>
        </section>
      )}

      {/* All Products Carousel */}
      {allProducts.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 py-12">
          <ProductCarousel products={allProducts} title="🍗 Nossos Produtos" />
        </section>
      )}

      {/* Promos */}
      <section className="bg-secondary/20 py-12">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">🔥 Promoções</h2>
          <p className="text-text-light mb-6">Confira nossos combos com preços especiais!</p>
          <Link to="/cardapio">
            <Button>Ver Combos</Button>
          </Link>
        </div>
      </section>

      {/* Info */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
          <div className="bg-surface p-6 rounded-xl shadow-sm border border-border">
            <div className="text-3xl mb-3">🕐</div>
            <h3 className="font-semibold mb-1">Horários</h3>
            <p className="text-text-light text-sm">{settings.opening_hours || 'Seg-Dom: 11h-22h'}</p>
          </div>
          <div className="bg-surface p-6 rounded-xl shadow-sm border border-border">
            <div className="text-3xl mb-3">📍</div>
            <h3 className="font-semibold mb-1">Localização</h3>
            <p className="text-text-light text-sm">{settings.address || 'Consulte pelo WhatsApp'}</p>
          </div>
          <div className="bg-surface p-6 rounded-xl shadow-sm border border-border">
            <div className="text-3xl mb-3">📱</div>
            <h3 className="font-semibold mb-1">Contato</h3>
            <p className="text-text-light text-sm">
              {settings.whatsapp ? (
                <a href={`https://wa.me/55${settings.whatsapp.replace(/\D/g, '')}`} className="text-primary hover:underline">
                  WhatsApp: {settings.whatsapp}
                </a>
              ) : 'Consulte nossas redes'}
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
