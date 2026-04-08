import { HiMinus, HiPlus, HiTrash } from 'react-icons/hi'
import { useCartStore } from '../../store/cartStore'
import { formatCurrency } from '../../utils/format'

export default function CartItem({ item }) {
  const { updateQuantity, removeItem } = useCartStore()

  return (
    <div className="flex gap-3 py-3 border-b border-border last:border-0">
      {item.image_url ? (
        <img src={item.image_url} alt={item.name} className="w-16 h-16 rounded-lg object-cover" />
      ) : (
        <div className="w-16 h-16 rounded-lg bg-orange-100 flex items-center justify-center text-2xl shrink-0">🍗</div>
      )}
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-sm truncate">{item.name}</h4>
        <p className="text-primary font-semibold text-sm">{formatCurrency(item.price)}</p>
        <div className="flex items-center gap-2 mt-1">
          <button
            onClick={() => updateQuantity(item.id, item.quantity - 1)}
            className="w-7 h-7 rounded-md border border-border flex items-center justify-center hover:bg-gray-100"
          >
            <HiMinus size={14} />
          </button>
          <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
          <button
            onClick={() => updateQuantity(item.id, item.quantity + 1)}
            className="w-7 h-7 rounded-md border border-border flex items-center justify-center hover:bg-gray-100"
          >
            <HiPlus size={14} />
          </button>
          <button
            onClick={() => removeItem(item.id)}
            className="ml-auto text-danger hover:text-red-700"
          >
            <HiTrash size={18} />
          </button>
        </div>
      </div>
      <div className="text-right shrink-0">
        <span className="font-semibold text-sm">{formatCurrency(item.price * item.quantity)}</span>
      </div>
    </div>
  )
}
