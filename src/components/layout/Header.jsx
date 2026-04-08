import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { HiShoppingCart, HiMenu, HiX } from 'react-icons/hi'
import { useCartStore } from '../../store/cartStore'

export default function Header() {
  const itemCount = useCartStore(s => s.getItemCount())
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => { setMenuOpen(false) }, [location])

  return (
    <header className={`sticky top-0 z-50 transition-all duration-300 ${
      scrolled
        ? 'bg-white/95 backdrop-blur-md shadow-lg border-b border-border'
        : 'bg-transparent'
    }`}>
      {/* Bandeirinhas decorativas no topo */}
      <div className="h-1.5 bg-gradient-to-r from-primary via-secondary to-accent" />

      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 no-underline group">
          <img
            src="/logo.png"
            alt="Coxita"
            className="w-10 h-10 object-contain group-hover:scale-110 transition-transform duration-200 drop-shadow-md"
          />
          <div>
            <span className={`font-display text-2xl font-bold tracking-tight transition-colors ${
              scrolled ? 'text-primary' : 'text-primary'
            }`}>
              Coxita
            </span>
            <span className="hidden sm:block text-[10px] font-body text-text-light -mt-1 tracking-wide">
              Coxinhas artesanais
            </span>
          </div>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-1">
          <NavLink to="/cardapio" scrolled={scrolled}>
            Cardapio
          </NavLink>
          <NavLink to="/acompanhar" scrolled={scrolled}>
            Meu pedido
          </NavLink>

          <Link
            to="/carrinho"
            className={`relative ml-2 flex items-center gap-1.5 px-4 py-2 rounded-full font-semibold text-sm transition-all duration-200 ${
              itemCount > 0
                ? 'bg-primary text-white shadow-md hover:shadow-lg hover:scale-105'
                : scrolled
                  ? 'text-text-warm hover:text-primary hover:bg-primary/5'
                  : 'text-text-warm hover:text-primary'
            }`}
          >
            <HiShoppingCart size={20} />
            {itemCount > 0 && (
              <>
                <span className="text-sm">Carrinho</span>
                <span className="bg-secondary text-primary-dark text-xs font-extrabold rounded-full w-5 h-5 flex items-center justify-center -mr-1">
                  {itemCount}
                </span>
              </>
            )}
          </Link>
        </nav>

        {/* Mobile nav */}
        <div className="flex items-center gap-3 sm:hidden">
          <Link to="/carrinho" className="relative text-primary">
            <HiShoppingCart size={24} />
            {itemCount > 0 && (
              <span className="absolute -top-2 -right-2.5 bg-secondary text-primary-dark text-[10px] font-extrabold rounded-full w-5 h-5 flex items-center justify-center shadow-sm">
                {itemCount}
              </span>
            )}
          </Link>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="text-primary p-1"
          >
            {menuOpen ? <HiX size={24} /> : <HiMenu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="sm:hidden bg-white border-t border-border shadow-lg">
          <div className="px-4 py-3 space-y-1">
            <Link to="/" className="block px-4 py-3 rounded-xl text-text font-semibold hover:bg-bg-warm no-underline">
              Inicio
            </Link>
            <Link to="/cardapio" className="block px-4 py-3 rounded-xl text-text font-semibold hover:bg-bg-warm no-underline">
              Cardapio
            </Link>
            <Link to="/acompanhar" className="block px-4 py-3 rounded-xl text-text font-semibold hover:bg-bg-warm no-underline">
              Meu pedido
            </Link>
            <Link to="/carrinho" className="block px-4 py-3 rounded-xl text-text font-semibold hover:bg-bg-warm no-underline">
              Carrinho {itemCount > 0 && `(${itemCount})`}
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}

function NavLink({ to, children, scrolled }) {
  const location = useLocation()
  const isActive = location.pathname === to

  return (
    <Link
      to={to}
      className={`px-4 py-2 rounded-full text-sm font-semibold no-underline transition-all duration-200 ${
        isActive
          ? 'bg-primary/10 text-primary'
          : scrolled
            ? 'text-text-warm hover:text-primary hover:bg-primary/5'
            : 'text-text-warm hover:text-primary'
      }`}
    >
      {children}
    </Link>
  )
}
