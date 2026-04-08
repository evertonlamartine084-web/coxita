import { useEffect, useState } from 'react'
import { getProducts } from '../../services/products'
import { getCategories } from '../../services/categories'
import ProductCard from '../../components/product/ProductCard'
import Loading from '../../components/ui/Loading'

export default function MenuPage() {
  const [products, setProducts] = useState([])
  const [categories, setCategoriesData] = useState([])
  const [activeCategory, setActiveCategory] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getProducts(), getCategories()])
      .then(([prods, cats]) => {
        setProducts(prods)
        setCategoriesData(cats)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = activeCategory === 'all'
    ? products
    : products.filter(p => p.categories?.slug === activeCategory)

  if (loading) return <Loading />

  return (
    <div className="min-h-screen">
      {/* Page header */}
      <div className="bg-gradient-to-b from-bg-warm to-bg pt-8 pb-6">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center gap-4 mb-6">
            <img src="/logo.png" alt="" className="w-12 h-12 object-contain" />
            <div>
              <h1 className="font-display text-3xl md:text-4xl font-extrabold text-text">Cardapio</h1>
              <p className="text-text-light text-sm mt-0.5">Escolha seus sabores favoritos</p>
            </div>
          </div>

          {/* Category filter pills */}
          <div className="flex gap-2 overflow-x-auto pb-2 px-1 scrollbar-hide">
            <CategoryPill
              active={activeCategory === 'all'}
              onClick={() => setActiveCategory('all')}
            >
              Todos
            </CategoryPill>
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
      className={`px-5 py-2.5 rounded-full whitespace-nowrap text-sm font-bold font-display transition-all duration-200 cursor-pointer ${
        active
          ? 'bg-primary text-white shadow-md shadow-primary/20 scale-105'
          : 'bg-white text-text-warm border-2 border-transparent hover:border-primary/30 hover:text-primary shadow-sm'
      }`}
    >
      {children}
    </button>
  )
}
