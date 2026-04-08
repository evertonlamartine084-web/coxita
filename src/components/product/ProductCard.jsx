import { HiPlus } from 'react-icons/hi'
import { useCartStore } from '../../store/cartStore'
import { formatCurrency } from '../../utils/format'
import toast from 'react-hot-toast'

export default function ProductCard({ product }) {
  const addItem = useCartStore(s => s.addItem)

  const handleAdd = () => {
    addItem(product)
    toast.success(`${product.name} adicionado!`)
  }

  return (
    <div className="bg-surface rounded-xl shadow-sm overflow-hidden border border-border hover:shadow-md transition-shadow">
      {product.image_url ? (
        <img
          src={product.image_url}
          alt={product.name}
          className="w-full h-48 object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-48 bg-orange-100 flex items-center justify-center text-5xl">
          🍗
        </div>
      )}
      <div className="p-4">
        {product.categories && (
          <span className="text-xs text-primary font-medium uppercase">
            {product.categories.name}
          </span>
        )}
        <h3 className="font-semibold text-lg mt-1">{product.name}</h3>
        {product.description && (
          <p className="text-text-light text-sm mt-1 line-clamp-2">{product.description}</p>
        )}
        <div className="flex items-center justify-between mt-3">
          <span className="text-xl font-bold text-primary">
            {formatCurrency(product.price)}
          </span>
          <button
            onClick={handleAdd}
            className="bg-primary text-white p-2 rounded-lg hover:bg-primary-dark transition-colors"
          >
            <HiPlus size={20} />
          </button>
        </div>
      </div>
    </div>
  )
}
