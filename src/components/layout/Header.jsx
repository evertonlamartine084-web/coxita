import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { HiShoppingCart, HiMenu, HiX } from 'react-icons/hi'
import { useCartStore } from '../../store/cartStore'
import { prefetchRota } from '../../routes/importers'

// Comeca a baixar o chunk da rota assim que o usuario demonstra intencao.
function aoDemonstrarIntencao(rota) {
  return {
    onMouseEnter: () => prefetchRota(rota),
    onFocus: () => prefetchRota(rota),
    onTouchStart: () => prefetchRota(rota),
  }
}

export default function Header() {
  const itemCount = useCartStore(s => s.getItemCount())
  const [menuOpen, setMenuOpen] = useState(false)
  // Esc fecha o menu.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = e => { if (e.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  // Trava o scroll atras do menu aberto: rolar o fundo enquanto o painel
  // esta sobreposto desorienta.
  useEffect(() => {
    if (!menuOpen) return
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = anterior }
  }, [menuOpen])

  // O header fica solido com o menu aberto, senao o backdrop apareceria
  // atraves dele.
  return (
    <header className="sticky top-0 z-50 bg-cream border-b-4 border-festa">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center no-underline" aria-label="Coxelli — página inicial">
          <img src="/wordmark.png" alt="Coxelli" className="h-11 md:h-12 w-auto" />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-1">
          <NavLink to="/cardapio">
            Cardápio
          </NavLink>
          <NavLink to="/meus-pedidos">
            Meus pedidos
          </NavLink>
          <NavLink to="/acompanhar">
            Acompanhar
          </NavLink>

          <Link
            to="/carrinho"
            {...aoDemonstrarIntencao('/carrinho')}
            className="relative ml-3 flex items-center gap-2 px-4 py-2 bg-primary text-white border-2 border-brown font-display font-extrabold uppercase tracking-wide text-sm shadow-[3px_3px_0_#5d2b04] hover:bg-brown transition-colors duration-200"
          >
            <HiShoppingCart size={20} />
            <span>Pedir agora</span>
            {itemCount > 0 && (
                <span className="bg-secondary text-primary-dark text-xs font-extrabold rounded-full w-5 h-5 flex items-center justify-center -mr-1">
                  {itemCount}
                </span>
            )}
          </Link>
        </nav>

        {/* Mobile nav */}
        <div className="flex items-center gap-3 sm:hidden">
          <Link to="/carrinho" {...aoDemonstrarIntencao('/carrinho')} className="relative text-brown">
            <HiShoppingCart size={24} />
            {itemCount > 0 && (
              <span className="absolute -top-2 -right-2.5 bg-secondary text-primary-dark text-[10px] font-extrabold rounded-full w-5 h-5 flex items-center justify-center shadow-sm">
                {itemCount}
              </span>
            )}
          </Link>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="text-brown p-1"
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={menuOpen}
            aria-controls="menu-mobile"
          >
            {menuOpen ? <HiX size={24} /> : <HiMenu size={24} />}
          </button>
        </div>
      </div>

      {/* Backdrop, ancorado logo abaixo do header. Nao usar `fixed` aqui: o
          `backdrop-blur` do header cria um containing block, e um filho fixed
          se ancoraria no header (64px de altura) em vez da viewport. */}
      <div
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
        className={`sm:hidden absolute top-full inset-x-0 h-screen bg-brown/25 backdrop-blur-[2px] transition-opacity duration-[--duration-base] ease-[--ease-interaction] ${
          menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Menu mobile. `absolute` o tira do fluxo: o header nao muda de altura
          e a pagina abaixo nao e empurrada. */}
      <div
        id="menu-mobile"
        className={`sm:hidden absolute top-full inset-x-0 bg-cream border-t-4 border-festa shadow-lg transition-[opacity,transform] duration-[--duration-base] ease-[--ease-entrance] ${
          menuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
        }`}
      >
        <nav className="px-4 py-3 space-y-1">
          {[
            { to: '/', label: 'Início' },
            { to: '/cardapio', label: 'Cardápio' },
            { to: '/meus-pedidos', label: 'Meus pedidos' },
            { to: '/acompanhar', label: 'Acompanhar' },
            { to: '/carrinho', label: `Carrinho${itemCount > 0 ? ` (${itemCount})` : ''}` },
          ].map(item => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMenuOpen(false)}
              tabIndex={menuOpen ? 0 : -1}
              {...aoDemonstrarIntencao(item.to)}
              className="block px-2 py-3 border-b border-brown/15 text-brown font-display font-extrabold uppercase tracking-wide hover:text-primary no-underline transition-colors duration-[--duration-fast] ease-[--ease-interaction]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}

function NavLink({ to, children }) {
  const location = useLocation()
  const isActive = location.pathname === to

  return (
    <Link
      to={to}
      {...aoDemonstrarIntencao(to)}
      className={`px-3 py-2 border-b-2 font-display font-extrabold uppercase tracking-[0.04em] text-sm no-underline transition-colors duration-200 ${
        isActive
          ? 'border-primary text-primary'
          : 'border-transparent text-text-warm hover:text-primary'
      }`}
    >
      {children}
    </Link>
  )
}
