import { Link } from 'react-router-dom'
import { HiHeart } from 'react-icons/hi'

export default function Footer() {
  return (
    <footer className="mt-auto">
      <div className="h-5 gingham-blue border-y-2 border-brown" aria-hidden="true" />
      <div className="bg-brown pt-12 pb-8">
        <div className="max-w-6xl mx-auto px-4">
          {/* Top section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            {/* Brand */}
            <div className="text-center md:text-left">
              <div className="mb-4">
                <img src="/wordmark.png" alt="Coxelli" className="h-14 w-auto mx-auto md:mx-0" />
                <p className="text-secondary text-sm font-semibold mt-3">Salgado bom, feito por gente.</p>
              </div>
              <p className="text-white/70 text-sm leading-relaxed max-w-xs mx-auto md:mx-0">
                Receita caprichada, recheio de verdade e o tempero que a gente conhece desde casa.
              </p>
            </div>

            {/* Links */}
            <div className="text-center">
              <h3 className="font-display text-2xl font-extrabold uppercase text-secondary mb-3">Navegue</h3>
              <div className="space-y-2">
                <Link to="/" className="block text-white/70 hover:text-white no-underline text-sm transition-colors duration-[--duration-fast] ease-[--ease-interaction]">
                  Início
                </Link>
                <Link to="/cardapio" className="block text-white/70 hover:text-white no-underline text-sm transition-colors duration-[--duration-fast] ease-[--ease-interaction]">
                  Cardápio
                </Link>
                <Link to="/carrinho" className="block text-white/70 hover:text-white no-underline text-sm transition-colors duration-[--duration-fast] ease-[--ease-interaction]">
                  Carrinho
                </Link>
              </div>
            </div>

            {/* Horarios */}
            <div className="text-center md:text-right">
              <h3 className="font-display text-2xl font-extrabold uppercase text-secondary mb-3">Funcionamento</h3>
              <div className="space-y-1.5 text-sm text-white/70">
                <p>Seg a Sex: 11h - 22h</p>
                <p>Sábado: 11h - 23h</p>
                <p>Domingo: 16h - 22h</p>
              </div>
            </div>
          </div>

          {/* Divider with pattern */}
          <div className="border-t border-white/15 pt-6">
            <p className="text-center text-white/60 text-xs flex items-center justify-center gap-1">
              &copy; {new Date().getFullYear()} Coxelli. Feito com
              <HiHeart className="text-brand inline w-3.5 h-3.5" />
              no Nordeste.
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
