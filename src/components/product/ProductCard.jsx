import { useState } from 'react'
import { HiPlus, HiShoppingCart } from 'react-icons/hi'
import { useCartStore } from '../../store/cartStore'
import { formatCurrency } from '../../utils/format'
import toast from 'react-hot-toast'

function getOptimizedUrl(url, width = 400) {
  if (!url) return url
  // Supabase Storage image transformation
  if (url.includes('supabase.co/storage')) {
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}width=${width}&quality=75`
  }
  return url
}

export default function ProductCard({ product }) {
  const addItem = useCartStore(s => s.addItem)
  const [imgLoaded, setImgLoaded] = useState(false)

  const handleAdd = () => {
    addItem(product)
    toast.success(`${product.name} adicionado!`, {
      icon: null,
      style: {
        background: '#292524',
        color: '#fff',
        borderRadius: '1rem',
        fontFamily: "'Baloo 2', cursive",
        fontWeight: 600,
      },
    })
  }

  return (
    <div className="group bg-surface card-organic overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 card-shine border border-border/60">
      {/* Image */}
      <div className="relative overflow-hidden">
        {product.image_url ? (
          <>
            {!imgLoaded && (
              <div className="absolute inset-0 w-full h-52 bg-gradient-to-br from-orange-100 to-orange-50 animate-pulse flex items-center justify-center">
                <img src="/logo.png" alt="" className="w-16 h-16 opacity-20 object-contain" />
              </div>
            )}
            <img
              src={getOptimizedUrl(product.image_url)}
              alt={product.name}
              className={`w-full h-52 object-cover group-hover:scale-105 transition-all duration-500 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
            />
          </>
        ) : (
          <div className="w-full h-52 bg-gradient-to-br from-orange-100 to-orange-50 flex items-center justify-center">
            <img src="/logo.png" alt="" className="w-20 h-20 opacity-30 object-contain" />
          </div>
        )}

        {/* Category badge */}
        {product.categories && (
          <span className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm text-primary text-xs font-bold px-3 py-1 rounded-full shadow-sm uppercase tracking-wide">
            {product.categories.name}
          </span>
        )}

        {/* Quick add overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-display font-bold text-lg text-text leading-tight">{product.name}</h3>
        {product.description && (
          <p className="text-text-light text-sm mt-1.5 line-clamp-2 leading-relaxed">{product.description}</p>
        )}

        <div className="flex items-end justify-between mt-4 pt-3 border-t border-border/50">
          <div>
            <span className="text-xs text-text-light block">a partir de</span>
            <span className="text-2xl font-display font-extrabold text-primary">
              {formatCurrency(product.price)}
            </span>
          </div>
          <button
            onClick={handleAdd}
            className="bg-primary text-white p-3 rounded-xl hover:bg-primary-dark transition-all duration-200 hover:scale-105 active:scale-95 shadow-md hover:shadow-lg group/btn cursor-pointer"
          >
            <HiPlus size={20} className="group-hover/btn:hidden" />
            <HiShoppingCart size={20} className="hidden group-hover/btn:block" />
          </button>
        </div>
      </div>
    </div>
  )
}
