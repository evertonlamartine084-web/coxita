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
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Cardápio</h1>

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto pb-4 mb-6 scrollbar-hide">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium transition-colors ${
            activeCategory === 'all'
              ? 'bg-primary text-white'
              : 'bg-white text-text border border-border hover:border-primary'
          }`}
        >
          Todos
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.slug)}
            className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium transition-colors ${
              activeCategory === cat.slug
                ? 'bg-primary text-white'
                : 'bg-white text-text border border-border hover:border-primary'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Products grid */}
      {filtered.length === 0 ? (
        <p className="text-text-light text-center py-12">Nenhum produto encontrado nesta categoria.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(p => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  )
}
