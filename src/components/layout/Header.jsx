import { Link } from 'react-router-dom'
import { HiShoppingCart } from 'react-icons/hi'
import { useCartStore } from '../../store/cartStore'

export default function Header() {
  const itemCount = useCartStore(s => s.getItemCount())

  return (
    <header className="bg-primary text-white sticky top-0 z-40 shadow-md">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 no-underline text-white">
          <img src="/logo.png" alt="Coxita" className="w-9 h-9 object-contain" />
          <span className="text-2xl font-bold">Coxita</span>
        </Link>

        <nav className="flex items-center gap-6">
          <Link to="/cardapio" className="text-white/90 hover:text-white no-underline font-medium hidden sm:block">
            Cardápio
          </Link>
          <Link to="/carrinho" className="relative text-white no-underline">
            <HiShoppingCart size={26} />
            {itemCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-secondary text-gray-900 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {itemCount}
              </span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  )
}
