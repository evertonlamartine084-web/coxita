import { Link } from 'react-router-dom'
import { HiArrowRight, HiArrowLeft } from 'react-icons/hi'
import { useCartStore } from '../../store/cartStore'
import CartItem from '../../components/cart/CartItem'
import Button from '../../components/ui/Button'
import { formatCurrency } from '../../utils/format'

export default function CartPage() {
  const { items, getSubtotal, clearCart } = useCartStore()

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="relative inline-block mb-6">
          <div className="absolute inset-0 bg-primary/5 rounded-full scale-150" />
          <img src="/logo.png" alt="" className="relative w-24 h-24 object-contain mx-auto opacity-40" />
        </div>
        <h2 className="font-display text-2xl font-bold mb-2 text-text">Seu carrinho esta vazio</h2>
        <p className="text-text-light mb-8 max-w-sm mx-auto">
          Que tal escolher umas coxinhas quentinhas e crocantes?
        </p>
        <Link to="/cardapio">
          <Button variant="festive" className="gap-2">
            Ver cardapio
            <HiArrowRight size={18} />
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="" className="w-8 h-8 object-contain" />
          <h1 className="font-display text-2xl font-extrabold text-text">Carrinho</h1>
        </div>
        <button
          onClick={clearCart}
          className="text-text-light text-sm hover:text-danger transition-colors font-medium cursor-pointer"
        >
          Limpar tudo
        </button>
      </div>

      {/* Items */}
      <div className="bg-surface card-organic border border-border/60 p-5 mb-5 shadow-sm">
        {items.map(item => (
          <CartItem key={item.id} item={item} />
        ))}
      </div>

      {/* Summary */}
      <div className="bg-surface card-organic border border-border/60 p-5 shadow-sm">
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-text-light text-sm">Subtotal</span>
          <span className="font-display font-extrabold text-xl text-text">{formatCurrency(getSubtotal())}</span>
        </div>
        <p className="text-text-light text-xs mb-5">Taxa de entrega calculada no checkout</p>

        <Link to="/checkout" className="block">
          <Button className="w-full gap-2" size="lg" variant="festive">
            Finalizar pedido
            <HiArrowRight size={18} />
          </Button>
        </Link>

        <Link to="/cardapio" className="block mt-3">
          <Button variant="ghost" className="w-full gap-2 text-sm">
            <HiArrowLeft size={16} />
            Continuar comprando
          </Button>
        </Link>
      </div>
    </div>
  )
}
