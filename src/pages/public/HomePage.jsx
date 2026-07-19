import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { HiClock, HiLocationMarker, HiPhone, HiArrowRight, HiRefresh } from 'react-icons/hi'
import LoyaltyCard from '../../components/loyalty/LoyaltyCard'
import { getFeaturedProducts, getProducts, peekProducts } from '../../services/products'
import { getFlavors, peekFlavors } from '../../services/flavors'
import { getSettings, peekSettings } from '../../services/settings'
import FlavorShowcase from '../../components/product/FlavorShowcase'
import { useCartStore } from '../../store/cartStore'
import ProductCarousel from '../../components/product/ProductCarousel'
import Button from '../../components/ui/Button'
import Loading from '../../components/ui/Loading'
import Reveal from '../../components/ui/Reveal'
import toast from 'react-hot-toast'

export default function HomePage() {
  // Semeia o estado com o que ja esta em cache: voltar para a home nao pisca
  // "Carregando...", renderiza direto.
  const produtosEmCache = peekProducts()
  const settingsEmCache = peekSettings()

  const saboresEmCache = peekFlavors()

  const [featured, setFeatured] = useState(() => produtosEmCache?.filter(p => p.featured) ?? [])
  const [allProducts, setAllProducts] = useState(() => produtosEmCache ?? [])
  const [flavors, setFlavors] = useState(() => saboresEmCache ?? [])
  const [settings, setSettingsData] = useState(() => settingsEmCache ?? {})
  const [loading, setLoading] = useState(!produtosEmCache || !settingsEmCache)
  const addItem = useCartStore(s => s.addItem)
  const navigate = useNavigate()
  const lastOrderItems = JSON.parse(localStorage.getItem('coxita-last-order-items') || 'null')

  const handleRepeatOrder = () => {
    lastOrderItems.forEach(item => addItem(item))
    toast.success('Itens adicionados ao carrinho!')
    navigate('/carrinho')
  }

  useEffect(() => {
    async function load() {
      try {
        const [feat, all, sabores, setts] = await Promise.all([
          getFeaturedProducts().catch(() => []),
          getProducts().catch(() => []),
          getFlavors().catch(() => []),
          getSettings().catch(() => ({})),
        ])
        setFeatured(feat)
        setAllProducts(all)
        setFlavors(sabores)
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

  const bannerActive = ['sim', 'true', '1', 'on', 'yes'].includes((settings.banner_active || '').toLowerCase().trim()) && settings.banner_text
  const heroProduct = featured.find(product => product.image_url) || allProducts.find(product => product.image_url)

  return (
    <div className="overflow-hidden">
      {/* ============ BANNER PROMO ============ */}
      {bannerActive && (
        <div className="bg-secondary">
          {settings.banner_link ? (
            <Link to={settings.banner_link} className="block text-center py-3 px-4 no-underline">
              <p className="font-display font-bold text-text text-sm md:text-base">
                {settings.banner_emoji && <span className="mr-2">{settings.banner_emoji}</span>}
                {settings.banner_text}
                {settings.banner_emoji && <span className="ml-2">{settings.banner_emoji}</span>}
              </p>
            </Link>
          ) : (
            <div className="text-center py-3 px-4">
              <p className="font-display font-bold text-text text-sm md:text-base">
                {settings.banner_emoji && <span className="mr-2">{settings.banner_emoji}</span>}
                {settings.banner_text}
                {settings.banner_emoji && <span className="ml-2">{settings.banner_emoji}</span>}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ============ HERO ============ */}
      <section className="bg-brand dots-sun border-b-[6px] border-brown">
        <div className="max-w-6xl mx-auto px-4 py-12 md:py-16">
          <div className="grid md:grid-cols-12 items-center gap-12 md:gap-16">
            <div className="md:col-span-7">
              <Reveal as="p" className="inline-block gingham-blue text-white border-2 border-brown px-3 py-1.5 font-display font-extrabold text-sm uppercase tracking-[0.1em] mb-6 shadow-[3px_3px_0_#5d2b04]">
                Sabor que é do Nordeste
              </Reveal>
              <Reveal as="h1" delay={50} className="font-display text-6xl sm:text-7xl md:text-[5.5rem] font-black uppercase leading-[0.82] tracking-[-0.035em] mb-7 text-brown">
                Salgado de festa.
                <br />
                <span className="text-cream [-webkit-text-stroke:2px_#5d2b04]">Recheio de verdade.</span>
              </Reveal>

              <Reveal as="p" delay={100} className="text-brown text-xl md:text-2xl font-semibold mb-8 max-w-xl leading-snug">
                Monte seu cento, misture os sabores e receba tudo pronto pra servir. Sem economia no recheio.
              </Reveal>

              <Reveal delay={150} className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <Link to="/cardapio">
                  <Button size="lg" className="w-full sm:w-auto gap-2">
                    Montar meu cento
                    <HiArrowRight size={18} />
                  </Button>
                </Link>
                {lastOrderItems && (
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full sm:w-auto gap-2"
                    onClick={handleRepeatOrder}
                  >
                    <HiRefresh size={18} />
                    Repetir pedido
                  </Button>
                )}
              </Reveal>
            </div>

            <Reveal delay={100} className="md:col-span-5 relative py-5 pr-3">
              <div className="absolute inset-0 gingham-blue border-4 border-brown translate-x-3 translate-y-3" aria-hidden="true" />
              <div className="relative aspect-square overflow-hidden bg-brown border-[6px] border-cream outline outline-[3px] outline-brown">
                {heroProduct ? (
                  <img
                    src={heroProduct.image_url}
                    alt={heroProduct.name}
                    fetchPriority="high"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <img
                    src="/hero-logo.png"
                    alt="Coxelli"
                    width={900}
                    height={839}
                    fetchPriority="high"
                    className="w-full h-full object-contain p-6 bg-cream"
                  />
                )}
              </div>
              <img src="/logo.png" alt="" aria-hidden="true" className="absolute -top-7 -right-3 md:-right-8 w-24 md:w-32 h-auto bg-cream rounded-full border-4 border-brown rotate-3" />
              <div className="absolute -bottom-1 -left-3 bg-secondary text-brown px-4 py-2 font-display font-extrabold uppercase tracking-wide text-lg -rotate-2 border-2 border-brown shadow-[3px_3px_0_#5d2b04]">
                Frito e entregue no capricho
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ============ DESTAQUES ============ */}
      {featured.length > 0 && (
        <section className="bg-cream">
          <div className="max-w-6xl mx-auto px-4 py-14 md:py-18">
          <p className="font-display font-extrabold uppercase tracking-[0.12em] text-festa mb-2">O povo já escolheu</p>
          <Reveal>
            <ProductCarousel products={featured} title="Os centos que mais saem" />
          </Reveal>
          <Reveal delay={80} className="mt-8">
            <Link to="/cardapio">
              <Button variant="ghost" className="gap-2 px-0">
                Ver o cardápio inteiro
                <HiArrowRight size={16} />
              </Button>
            </Link>
          </Reveal>
          </div>
        </section>
      )}

      {/* ============ NOSSOS SABORES ============ */}
      {/* Os sabores que vao dentro dos pacotes -- a mesma lista do seletor. */}
      {flavors.length > 0 && (
        <section className="gingham-blue py-14 md:py-18 border-y-[6px] border-brown">
          <div className="max-w-6xl mx-auto px-4">
            <Reveal>
              <FlavorShowcase flavors={flavors} title="Nossos sabores" />
            </Reveal>
          </div>
        </section>
      )}

      {/* ============ CTA / COMBOS ============ */}
      <section className="bg-secondary dots-sun border-b-[6px] border-brown">
        <Reveal className="max-w-6xl mx-auto px-4 py-12 md:py-16 grid md:grid-cols-[1fr_auto] items-center gap-8">
          <div>
            <p className="font-display font-extrabold text-sm uppercase tracking-[0.12em] text-primary mb-2">Vai ter gente em casa?</p>
            <h2 className="font-display text-5xl md:text-6xl font-black uppercase leading-none text-brown mb-3">
              Tem pacote pra mesa toda.
            </h2>
            <p className="text-brown text-lg md:text-xl font-medium max-w-2xl leading-relaxed">
              De 25 a 100 salgados. Você escolhe o tamanho, divide os sabores e a gente prepara.
            </p>
          </div>
          <div>
            <Link to="/cardapio">
              <Button className="gap-2 whitespace-nowrap">
                Ver todos os pacotes
                <HiArrowRight size={16} />
              </Button>
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ============ FIDELIDADE ============ */}
      {settings.loyalty_goal && (
        <section className="max-w-md mx-auto px-4 pt-14">
          <Reveal>
            <LoyaltyCard goal={settings.loyalty_goal} />
          </Reveal>
        </section>
      )}

      {/* ============ INFO CARDS ============ */}
      <section className="max-w-6xl mx-auto px-4 py-14 md:py-18">
        <Reveal as="h2" className="font-display text-4xl md:text-5xl font-black uppercase tracking-tight mb-8">
          <span className="underline-hand">Antes de fechar o pedido</span>
        </Reveal>
        <div className="grid grid-cols-1 md:grid-cols-3 border-y border-brown/20">
          {[
            {
              icon: <HiClock size={26} />,
              title: 'Horários',
              text: settings.opening_hours || 'Seg-Dom: 11h-22h',
              color: 'primary',
            },
            {
              icon: <HiLocationMarker size={26} />,
              title: 'Localização',
              text: settings.address || 'Consulte pelo WhatsApp',
              color: 'accent',
            },
            {
              icon: <HiPhone size={26} />,
              title: 'Contato',
              text: settings.whatsapp || 'Consulte nossas redes',
              color: 'festa',
              link: settings.whatsapp ? `https://wa.me/55${settings.whatsapp.replace(/\D/g, '')}` : null,
            },
          ].map((card, i) => (
            <Reveal key={card.title} delay={i * 60} className="h-full md:[&:not(:last-child)]:border-r md:[&:not(:last-child)]:border-brown/20">
              <InfoCard {...card} />
            </Reveal>
          ))}
        </div>
      </section>
    </div>
  )
}

function InfoCard({ icon, title, text, color, link }) {
  const colorMap = {
    primary: 'text-primary',
    accent: 'text-accent',
    festa: 'text-festa',
  }

  const content = (
    <div className="py-7 md:px-8 h-full flex items-start gap-4">
      <div className={`${colorMap[color]} flex items-center justify-center mt-0.5 flex-shrink-0`}>
        {icon}
      </div>
      <div>
        <h3 className="font-display font-bold text-xl mb-1">{title}</h3>
        <p className="text-text-light text-base leading-relaxed">{text}</p>
      </div>
    </div>
  )

  if (link) {
    return (
      <a href={link} target="_blank" rel="noopener noreferrer" className="no-underline block h-full">
        {content}
      </a>
    )
  }
  return content
}
