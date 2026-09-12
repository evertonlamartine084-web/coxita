import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { HiSearch, HiX, HiHeart } from 'react-icons/hi'
import { getProducts, peekProducts } from '../../services/products'
import { getCategories, peekCategories } from '../../services/categories'
import { getFlavors, peekFlavors } from '../../services/flavors'
import { useFavoritesStore } from '../../store/favoritesStore'
import { ehPacote, pacotesDoSabor } from '../../utils/pacote'
import { catalogText } from '../../utils/catalogText'
import ProductCard from '../../components/product/ProductCard'
import FlavorCard from '../../components/product/FlavorCard'
import FlavorToCart from '../../components/product/FlavorToCart'
import Loading from '../../components/ui/Loading'
import Seo from '../../components/ui/Seo'

export default function MenuPage() {
  const produtosEmCache = peekProducts()
  const categoriasEmCache = peekCategories()
  const saboresEmCache = peekFlavors()

  const [products, setProducts] = useState(() => produtosEmCache ?? [])
  const [categories, setCategoriesData] = useState(() => categoriasEmCache ?? [])
  const [flavors, setFlavors] = useState(() => saboresEmCache ?? [])
  // A home linka direto para ?aba=pasteis. Ler na inicializacao (e nao por
  // efeito) evita o flash de "Todos" antes de trocar.
  const [params] = useSearchParams()
  const [activeCategory, setActiveCategory] = useState(() => params.get('aba') || 'all')
  const [saborNoCarrinho, setSaborNoCarrinho] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(!produtosEmCache || !categoriasEmCache)
  const favorites = useFavoritesStore(s => s.favorites)

  useEffect(() => {
    Promise.all([getProducts(), getCategories(), getFlavors()])
      .then(([prods, cats, sabores]) => {
        setProducts(prods)
        setCategoriesData(cats)
        setFlavors(sabores)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // A aba de pasteis mostra os sabores com foto, nao os pacotes: quem escolhe
  // pastel escolhe pelo recheio. O preco vem do pacote, que a aba "Centos de
  // Pasteis" vende e que o cartao de sabor abre no clique.
  const pasteis = flavors.filter(f => f.group_slug === 'pasteis')

  const q = search.toLowerCase().trim()
  const pasteisFiltrados = pasteis.filter(f =>
    !q || f.name.toLowerCase().includes(q) || f.description?.toLowerCase().includes(q)
  )

  // Sabor so vai ao carrinho dentro de um pacote, entao sem pacote no cardapio
  // o botao nao aparece -- e melhor nao ter botao do que ter um que trava.
  const pacotes = products.filter(ehPacote)

  // Cardapio em Schema.org. O index.html ja declara a loja e aponta hasMenu para
  // ca; sem isto o Google sabe que existe um cardapio mas nao o que tem dentro.
  // Preco sai do proprio produto -- marcar valor diferente do exibido e o tipo de
  // divergencia que derruba rich result.
  const menuJsonLd = (() => {
    if (products.length === 0) return null

    const porCategoria = new Map()
    for (const p of products) {
      const nome = p.categories?.name || 'Outros'
      if (!porCategoria.has(nome)) porCategoria.set(nome, [])
      porCategoria.get(nome).push({
        '@type': 'MenuItem',
        name: catalogText(p.name),
        ...(p.description ? { description: catalogText(p.description) } : {}),
        ...(p.image_url ? { image: `https://coxelli.com.br${p.image_url}` } : {}),
        offers: {
          '@type': 'Offer',
          price: Number(p.price).toFixed(2),
          priceCurrency: 'BRL',
          availability: 'https://schema.org/InStock',
        },
      })
    }

    const secoes = [...porCategoria].map(([nome, itens]) => ({
      '@type': 'MenuSection',
      name: nome,
      hasMenuItem: itens,
    }))

    // Sabores nao tem preco proprio: entram como secao sem Offer, que e o jeito
    // certo de dizer "isto existe no cardapio, mas nao se compra avulso".
    if (pasteis.length > 0) {
      secoes.push({
        '@type': 'MenuSection',
        name: 'Pastéis',
        description: 'Sabores para montar os pacotes',
        hasMenuItem: pasteis.map(f => ({
          '@type': 'MenuItem',
          name: catalogText(f.name),
          ...(f.description ? { description: catalogText(f.description) } : {}),
          ...(f.image_url ? { image: `https://coxelli.com.br${f.image_url}` } : {}),
        })),
      })
    }

    return {
      '@context': 'https://schema.org',
      '@type': 'Menu',
      '@id': 'https://coxelli.com.br/cardapio#menu',
      name: 'Cardápio Coxelli',
      inLanguage: 'pt-BR',
      provider: { '@id': 'https://coxelli.com.br/#loja' },
      hasMenuSection: secoes,
    }
  })()

  const filtered = products.filter(p => {
    const matchCategory = activeCategory === 'all'
      ? true
      : activeCategory === 'favoritos'
        ? favorites.includes(p.id)
        : p.categories?.slug === activeCategory
    const busca = search.toLowerCase().trim()
    const matchSearch = !busca || p.name.toLowerCase().includes(busca) || p.description?.toLowerCase().includes(busca)
    return matchCategory && matchSearch
  })

  if (loading) return <Loading />

  return (
    <>
        <Seo
          titulo="Cardápio"
          descricao="Centos, meios centos e combos de salgados em Natal/RN. Escolha o tamanho e misture os sabores como quiser."
          caminho="/cardapio"
          dadosEstruturados={menuJsonLd}
        />
      <div className="min-h-screen">
        {/* Page header */}
        <div className="bg-secondary dots-sun border-b-[6px] border-brown pt-8 pb-7">
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex items-center gap-4 mb-6">
              <img width={512} height={512} src="/logo.png" alt="" className="w-16 h-16 object-contain bg-cream rounded-full border-2 border-brown" />
              <div>
                <h1 className="font-display text-5xl md:text-6xl font-black uppercase leading-none text-brown">Cardápio</h1>
                <p className="text-brown font-semibold text-base mt-0.5">Escolha o tamanho. Depois, misture os sabores.</p>
              </div>
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <HiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-text-light" size={18} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar no cardápio..."
                className="w-full pl-11 pr-10 py-3 border-[3px] border-brown rounded-sm outline-none focus:border-festa transition-colors font-body font-medium text-base bg-cream shadow-[3px_3px_0_#5d2b04]"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-light hover:text-text cursor-pointer"
                >
                  <HiX size={18} />
                </button>
              )}
            </div>

            {/* Category filter pills */}
            <div className="flex gap-2 overflow-x-auto pb-2 px-1 scrollbar-hide">
              <CategoryPill
                active={activeCategory === 'all'}
                onClick={() => setActiveCategory('all')}
              >
                Todos
              </CategoryPill>
              {favorites.length > 0 && (
                <CategoryPill
                  active={activeCategory === 'favoritos'}
                  onClick={() => setActiveCategory('favoritos')}
                >
                  <HiHeart className="inline -mt-0.5 mr-1" size={14} />
                  Favoritos
                </CategoryPill>
              )}
              {categories.map(cat => (
                <CategoryPill
                  key={cat.id}
                  active={activeCategory === cat.slug}
                  onClick={() => setActiveCategory(cat.slug)}
                >
                  {cat.name}
                </CategoryPill>
              ))}
              {/* Ultima pill: pastel nao e produto vendavel, e recheio de pacote.
                  Fica depois das categorias reais para nao sugerir que da pra
                  comprar avulso. */}
              {pasteis.length > 0 && (
                <CategoryPill
                  active={activeCategory === 'pasteis'}
                  onClick={() => setActiveCategory('pasteis')}
                >
                  Pastéis
                </CategoryPill>
              )}
            </div>
          </div>
        </div>

        {/* Products grid */}
        <div className="max-w-6xl mx-auto px-4 py-8">
          {activeCategory === 'pasteis' ? (
            pasteisFiltrados.length === 0 ? (
              <div className="text-center py-16">
                <img width={512} height={512} src="/logo.png" alt="" className="w-20 h-20 object-contain mx-auto mb-4 opacity-30" />
                <p className="text-text-light font-display text-lg">Nenhum pastel com esse nome.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
                {pasteisFiltrados.map(sabor => (
                  <FlavorCard
                    key={sabor.id}
                    sabor={sabor}
                    aoAdicionar={
                      pacotesDoSabor(sabor, pacotes).length > 0 ? setSaborNoCarrinho : undefined
                    }
                  />
                ))}
              </div>
            )
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <img width={512} height={512} src="/logo.png" alt="" className="w-20 h-20 object-contain mx-auto mb-4 opacity-30" />
              <p className="text-text-light font-display text-lg">Nenhum produto nesta categoria.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
              {filtered.map(p => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </div>

      {saborNoCarrinho && (
        <FlavorToCart
          sabor={saborNoCarrinho}
          pacotes={pacotesDoSabor(saborNoCarrinho, pacotes)}
          aoFechar={() => setSaborNoCarrinho(null)}
        />
      )}
    </>
  )
}

function CategoryPill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 whitespace-nowrap text-sm font-extrabold font-display uppercase tracking-wide border-2 border-brown transition-colors duration-200 cursor-pointer ${
        active
          ? 'gingham-blue text-white shadow-[3px_3px_0_#5d2b04]'
          : 'bg-cream text-brown hover:bg-brand'
      }`}
    >
      {children}
    </button>
  )
}
