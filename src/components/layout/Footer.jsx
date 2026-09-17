import { Link } from 'react-router-dom'
import { HiHeart } from 'react-icons/hi'
import { LISTA_OCASIOES } from '../../content/ocasioes'

const LINK =
  'block text-white/70 hover:text-white no-underline text-sm transition-colors duration-[--duration-fast] ease-[--ease-interaction]'

export default function Footer() {
  return (
    <footer className="mt-auto">
      <div className="h-5 gingham-blue border-y-2 border-brown" aria-hidden="true" />
      <div className="bg-brown pt-12 pb-8">
        <div className="max-w-6xl mx-auto px-4">
          {/* Top section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
            {/* Brand */}
            <div className="text-center sm:text-left">
              <div className="mb-4">
                <img width={800} height={315} src="/wordmark.png" alt="Coxelli" className="h-14 w-auto mx-auto md:mx-0" />
                <p className="text-secondary text-sm font-semibold mt-3">Salgado bom, feito por gente.</p>
              </div>
              <p className="text-white/70 text-sm leading-relaxed max-w-xs mx-auto md:mx-0">
                Receita caprichada, recheio de verdade e o tempero que a gente conhece desde casa.
              </p>
            </div>

            {/* Links. As paginas de sabor e de ocasiao entram aqui de proposito:
                link no rodape existe em todas as telas, e e o que impede que
                elas dependam so do sitemap para serem encontradas. */}
            <div className="text-center sm:text-left">
              <h3 className="font-display text-2xl font-extrabold uppercase text-secondary mb-3">Navegue</h3>
              <div className="space-y-2">
                {[
                  ['/', 'Início'],
                  ['/cardapio', 'Cardápio'],
                  ['/salgados', 'Todos os sabores'],
                  ['/salgados-em-natal', 'Bairros de Natal'],
                  ['/carrinho', 'Carrinho'],
                ].map(([para, texto]) => (
                  <Link key={para} to={para} className={LINK}>
                    {texto}
                  </Link>
                ))}
              </div>
            </div>

            {/* Ocasioes */}
            <div className="text-center sm:text-left">
              <h3 className="font-display text-2xl font-extrabold uppercase text-secondary mb-3">Vai ter festa?</h3>
              <div className="space-y-2">
                {LISTA_OCASIOES.map(ocasiao => (
                  <Link key={ocasiao.slug} to={`/${ocasiao.slug}`} className={LINK}>
                    {ocasiao.h1}
                  </Link>
                ))}
              </div>
            </div>

            {/* Horarios */}
            <div className="text-center sm:text-left lg:text-right">
              <h3 className="font-display text-2xl font-extrabold uppercase text-secondary mb-3">Funcionamento</h3>
              <div className="space-y-1.5 text-sm text-white/70">
                <p>Todos os dias: 9h - 21h</p>
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
            <p className="mt-1.5 text-center text-xs text-white/50">
              CNPJ: 68.484.975/0001-76
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
