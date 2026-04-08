import { Link } from 'react-router-dom'
import { useCartStore } from '../../store/cartStore'
import CartItem from '../../components/cart/CartItem'
import Button from '../../components/ui/Button'
import { formatCurrency } from '../../utils/format'

export default function CartPage() {
  const { items, getSubtotal, clearCart } = useCartStore()

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="text-6xl mb-4">🛒</div>
        <h2 className="text-2xl font-bold mb-2">Seu carrinho está vazio</h2>
        <p className="text-text-light mb-6">Adicione deliciosas coxinhas ao seu pedido!</p>
        <Link to="/cardapio">
          <Button>Ver Cardápio</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Carrinho</h1>
        <button onClick={clearCart} className="text-danger text-sm hover:underline">
          Limpar carrinho
        </button>
      </div>

      <div className="bg-surface rounded-xl border border-border p-4 mb-6">
        {items.map(item => (
          <CartItem key={item.id} item={item} />
        ))}
      </div>

      <div className="bg-surface rounded-xl border border-border p-4">
        <div className="flex justify-between text-lg font-semibold">
          <span>Subtotal</span>
          <span>{formatCurrency(getSubtotal())}</span>
        </div>
        <p className="text-text-light text-sm mt-1">Taxa de entrega calculada no checkout</p>

        <Link to="/checkout" className="block mt-4">
          <Button className="w-full" size="lg">
            Finalizar Pedido
          </Button>
        </Link>
        <Link to="/cardapio" className="block mt-2">
          <Button variant="ghost" className="w-full">
            Continuar Comprando
          </Button>
        </Link>
      </div>
    </div>
  )
}
