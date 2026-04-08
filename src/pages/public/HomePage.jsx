import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HiClock, HiLocationMarker, HiPhone, HiArrowRight } from 'react-icons/hi'
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
    <div className="overflow-hidden">
      {/* ============ HERO ============ */}
      <section className="relative bg-gradient-to-br from-primary via-primary-dark to-stone-900 text-white overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute top-10 -left-20 w-64 h-64 bg-secondary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 -right-20 w-80 h-80 bg-primary-light/20 rounded-full blur-3xl" />

        {/* Xadrez pattern overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `repeating-linear-gradient(45deg, white 0px, white 1px, transparent 1px, transparent 20px),
            repeating-linear-gradient(-45deg, white 0px, white 1px, transparent 1px, transparent 20px)`
        }} />

        <div className="max-w-6xl mx-auto px-4 py-16 md:py-28 relative z-10">
          <div className="flex flex-col md:flex-row items-center gap-8 md:gap-16">
            {/* Text */}
            <div className="flex-1 text-center md:text-left">
              <div className="inline-block mb-4">
                <span className="stamp text-secondary text-sm border-secondary/60">
                  Feita na hora!
                </span>
              </div>
              <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-extrabold leading-tight mb-5">
                A coxinha que<br />
                <span className="text-secondary">derrete na boca</span>
              </h1>
              <p className="text-white/70 text-lg md:text-xl mb-8 max-w-lg font-body leading-relaxed">
                Crocante por fora, cremosa por dentro. Receita artesanal com ingredientes selecionados a dedo.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
                <Link to="/cardapio">
                  <Button variant="secondary" size="lg" className="w-full sm:w-auto gap-2">
                    Ver Cardapio
                    <HiArrowRight size={18} />
                  </Button>
                </Link>
              </div>
            </div>

            {/* Mascote */}
            <div className="flex-shrink-0">
              <div className="relative">
                <div className="absolute inset-0 bg-secondary/20 rounded-full blur-2xl scale-90" />
                <img
                  src="/logo.png"
                  alt="Coxita mascote"
                  className="relative w-48 h-48 md:w-72 md:h-72 object-contain animate-float drop-shadow-2xl"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Wave bottom */}
        <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full block -mb-px">
          <path d="M0 20 Q360 60 720 30 Q1080 0 1440 20 L1440 60 L0 60Z" fill="#fffbf5" />
        </svg>
      </section>

      {/* ============ DESTAQUES ============ */}
      {featured.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 py-14">
          <ProductCarousel products={featured} title="Destaques da casa" />
          <div className="text-center mt-10">
            <Link to="/cardapio">
              <Button variant="outline" className="gap-2">
                Ver cardapio completo
                <HiArrowRight size={16} />
              </Button>
            </Link>
          </div>
        </section>
      )}

      {/* ============ TODOS OS PRODUTOS ============ */}
      {allProducts.length > 0 && (
        <section className="bg-xadrez py-14">
          <div className="max-w-6xl mx-auto px-4">
            <ProductCarousel products={allProducts} title="Nossos sabores" />
          </div>
        </section>
      )}

      {/* ============ CTA / PROMOS ============ */}
      <section className="relative py-16 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-secondary/20 via-secondary/10 to-primary/10" />
        <div className="max-w-6xl mx-auto px-4 relative z-10">
          <div className="bg-white card-organic shadow-xl p-8 md:p-12 flex flex-col md:flex-row items-center gap-8 border-festive">
            <img
              src="/logo.png"
              alt="Coxita"
              className="w-24 h-24 md:w-32 md:h-32 object-contain hover-wobble"
            />
            <div className="text-center md:text-left flex-1">
              <h2 className="font-display text-2xl md:text-3xl font-extrabold text-text mb-2">
                Combos com preco especial!
              </h2>
              <p className="text-text-light text-base md:text-lg mb-5 max-w-md">
                Junta a galera e pede o combo familia. Mais coxinhas, mais alegria, menos grana!
              </p>
              <Link to="/cardapio">
                <Button variant="festive" className="gap-2">
                  Conferir combos
                  <HiArrowRight size={16} />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============ INFO CARDS ============ */}
      <section className="max-w-6xl mx-auto px-4 py-14">
        <h2 className="font-display text-2xl md:text-3xl font-extrabold text-center mb-10">
          <span className="underline-hand">Como funciona</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <InfoCard
            icon={<HiClock size={28} />}
            title="Horarios"
            text={settings.opening_hours || 'Seg-Dom: 11h-22h'}
            color="primary"
          />
          <InfoCard
            icon={<HiLocationMarker size={28} />}
            title="Localizacao"
            text={settings.address || 'Consulte pelo WhatsApp'}
            color="accent"
          />
          <InfoCard
            icon={<HiPhone size={28} />}
            title="Contato"
            text={settings.whatsapp || 'Consulte nossas redes'}
            color="festa"
            link={settings.whatsapp ? `https://wa.me/55${settings.whatsapp.replace(/\D/g, '')}` : null}
          />
        </div>
      </section>
    </div>
  )
}

function InfoCard({ icon, title, text, color, link }) {
  const colorMap = {
    primary: 'bg-primary/10 text-primary',
    accent: 'bg-accent/10 text-accent',
    festa: 'bg-festa/10 text-festa',
  }

  const content = (
    <div className="bg-surface card-organic p-6 shadow-sm border border-border/60 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 text-center group h-full">
      <div className={`w-14 h-14 rounded-2xl ${colorMap[color]} flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform`}>
        {icon}
      </div>
      <h3 className="font-display font-bold text-lg mb-2">{title}</h3>
      <p className="text-text-light text-sm leading-relaxed">{text}</p>
    </div>
  )

  if (link) {
    return <a href={link} target="_blank" rel="noopener noreferrer" className="no-underline">{content}</a>
  }
  return content
}
