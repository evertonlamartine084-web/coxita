import { useEffect, useState } from 'react'
import { HiSearch, HiX, HiHeart } from 'react-icons/hi'
import { getProducts, peekProducts } from '../../services/products'
import { getCategories, peekCategories } from '../../services/categories'
import { useFavoritesStore } from '../../store/favoritesStore'
import ProductCard from '../../components/product/ProductCard'
import Loading from '../../components/ui/Loading'

export default function MenuPage() {
  const produtosEmCache = peekProducts()
  const categoriasEmCache = peekCategories()

  const [products, setProducts] = useState(() => produtosEmCache ?? [])
  const [categories, setCategoriesData] = useState(() => categoriasEmCache ?? [])
  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(!produtosEmCache || !categoriasEmCache)
  const favorites = useFavoritesStore(s => s.favorites)

  useEffect(() => {
    Promise.all([getProducts(), getCategories()])
      .then(([prods, cats]) => {
        setProducts(prods)
        setCategoriesData(cats)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = products.filter(p => {
    const matchCategory = activeCategory === 'all'
      ? true
      : activeCategory === 'favoritos'
        ? favorites.includes(p.id)
        : p.categories?.slug === activeCategory
    const q = search.toLowerCase().trim()
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)
    return matchCategory && matchSearch
  })

  if (loading) return <Loading />

  return (
    <div className="min-h-screen">
      {/* Page header */}
      <div className="bg-secondary dots-sun border-b-[6px] border-brown pt-8 pb-7">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center gap-4 mb-6">
            <img src="/logo.png" alt="" className="w-16 h-16 object-contain bg-cream rounded-full border-2 border-brown" />
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
          </div>
        </div>
      </div>

      {/* Products grid */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <img src="/logo.png" alt="" className="w-20 h-20 object-contain mx-auto mb-4 opacity-30" />
            <p className="text-text-light font-display text-lg">Nenhum produto nesta categoria.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(p => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    </div>
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
