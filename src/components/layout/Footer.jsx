import { Link } from 'react-router-dom'
import { HiHeart } from 'react-icons/hi'

export default function Footer() {
  return (
    <footer className="mt-auto relative">
      {/* Wave top */}
      <div className="bg-bg">
        <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full block">
          <path d="M0 40 Q360 0 720 40 Q1080 80 1440 40 L1440 80 L0 80Z" fill="#292524" />
        </svg>
      </div>

      <div className="bg-stone-800 pt-6 pb-8">
        <div className="max-w-6xl mx-auto px-4">
          {/* Top section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            {/* Brand */}
            <div className="text-center md:text-left">
              <div className="flex items-center gap-3 justify-center md:justify-start mb-3">
                <img src="/logo.png" alt="Coxita" className="w-14 h-14 object-contain drop-shadow-lg" />
                <div>
                  <p className="font-display text-2xl font-bold text-white">Coxita</p>
                  <p className="text-stone-400 text-xs tracking-wider uppercase">Coxinhas artesanais</p>
                </div>
              </div>
              <p className="text-stone-400 text-sm leading-relaxed max-w-xs mx-auto md:mx-0">
                Crocantes por fora, cremosas por dentro. Feitas com amor e os melhores ingredientes.
              </p>
            </div>

            {/* Links */}
            <div className="text-center">
              <h3 className="font-display text-lg font-bold text-secondary mb-3">Navegue</h3>
              <div className="space-y-2">
                <Link to="/" className="block text-stone-300 hover:text-white no-underline text-sm transition-colors">
                  Inicio
                </Link>
                <Link to="/cardapio" className="block text-stone-300 hover:text-white no-underline text-sm transition-colors">
                  Cardapio
                </Link>
                <Link to="/carrinho" className="block text-stone-300 hover:text-white no-underline text-sm transition-colors">
                  Carrinho
                </Link>
              </div>
            </div>

            {/* Horarios */}
            <div className="text-center md:text-right">
              <h3 className="font-display text-lg font-bold text-secondary mb-3">Funcionamento</h3>
              <div className="space-y-1.5 text-sm text-stone-300">
                <p>Seg a Sex: 11h - 22h</p>
                <p>Sabado: 11h - 23h</p>
                <p>Domingo: 16h - 22h</p>
              </div>
            </div>
          </div>

          {/* Divider with pattern */}
          <div className="border-t border-stone-700 border-dashed pt-4">
            <p className="text-center text-stone-500 text-xs flex items-center justify-center gap-1">
              &copy; {new Date().getFullYear()} Coxita. Feito com
              <HiHeart className="text-primary inline w-3.5 h-3.5" />
              no Brasil.
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
