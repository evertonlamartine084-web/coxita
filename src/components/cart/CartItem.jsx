import { HiMinus, HiPlus, HiTrash } from 'react-icons/hi'
import { useCartStore } from '../../store/cartStore'
import { formatCurrency } from '../../utils/format'

export default function CartItem({ item }) {
  const { updateQuantity, removeItem } = useCartStore()

  return (
    <div className="flex gap-4 py-4 border-b border-border/50 last:border-0 group">
      {item.image_url ? (
        <img
          src={item.image_url}
          alt={item.name}
          className="w-18 h-18 rounded-xl object-cover shadow-sm"
        />
      ) : (
        <div className="w-18 h-18 rounded-xl bg-gradient-to-br from-orange-100 to-orange-50 flex items-center justify-center shrink-0">
          <img src="/logo.png" alt="" className="w-10 h-10 opacity-30 object-contain" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <h4 className="font-display font-bold text-base truncate text-text">{item.name}</h4>
        <p className="text-primary font-bold text-sm mt-0.5">{formatCurrency(item.price)} un.</p>

        <div className="flex items-center gap-2 mt-2">
          <div className="flex items-center bg-stone-100 rounded-xl overflow-hidden">
            <button
              onClick={() => updateQuantity(item.id, item.quantity - 1)}
              className="w-8 h-8 flex items-center justify-center hover:bg-stone-200 transition-colors text-text-light cursor-pointer"
            >
              <HiMinus size={14} />
            </button>
            <span className="text-sm font-bold w-8 text-center font-display">{item.quantity}</span>
            <button
              onClick={() => updateQuantity(item.id, item.quantity + 1)}
              className="w-8 h-8 flex items-center justify-center hover:bg-stone-200 transition-colors text-text-light cursor-pointer"
            >
              <HiPlus size={14} />
            </button>
          </div>

          <button
            onClick={() => removeItem(item.id)}
            className="ml-auto text-stone-300 hover:text-danger transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
            title="Remover item"
          >
            <HiTrash size={18} />
          </button>
        </div>
      </div>

      <div className="text-right shrink-0 self-center">
        <span className="font-display font-extrabold text-lg text-text">
          {formatCurrency(item.price * item.quantity)}
        </span>
      </div>
    </div>
  )
}
