import { useEffect, useRef, useState } from 'react'
import { HiChevronLeft, HiChevronRight } from 'react-icons/hi'
import { catalogText } from '../../utils/catalogText'

/**
 * Vitrine dos sabores disponiveis.
 *
 * Diferente do ProductCarousel: sabor nao tem preco nem botao de compra --
 * ele so existe dentro de um pacote. Aqui a funcao e apetite e informacao.
 */
export default function FlavorShowcase({ flavors, title }) {
  const scrollRef = useRef(null)
  const [podeEsquerda, setPodeEsquerda] = useState(false)
  const [podeDireita, setPodeDireita] = useState(true)

  const checar = () => {
    const el = scrollRef.current
    if (!el) return
    setPodeEsquerda(el.scrollLeft > 10)
    setPodeDireita(el.scrollLeft < el.scrollWidth - el.clientWidth - 10)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', checar, { passive: true })
    checar()
    return () => el.removeEventListener('scroll', checar)
  }, [flavors])

  const rolar = (direcao) => {
    scrollRef.current?.scrollBy({ left: direcao === 'esquerda' ? -260 : 260, behavior: 'smooth' })
  }

  if (!flavors?.length) return null

  return (
    <div className="relative">
      {title && (
        // mb-6: a regua do `underline-hand` fica abaixo da linha de base do
        // titulo e cruzaria o subtitulo com espacamento menor.
        <h2 className="font-display text-5xl md:text-6xl font-black uppercase leading-none text-cream text-left mb-5">
          <span className="underline-hand">{title}</span>
        </h2>
      )}
      <p className="text-white text-left text-lg font-medium mb-8 max-w-lg">
        Misture como quiser. Você escolhe os sabores na hora de montar o pacote.
      </p>

      <div className="relative group">
        {podeEsquerda && (
          <button
            onClick={() => rolar('esquerda')}
            aria-label="Ver sabores anteriores"
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-secondary border-2 border-brown p-2.5 text-brown hover:bg-brand transition-colors opacity-0 group-hover:opacity-100 -translate-x-3 cursor-pointer"
          >
            <HiChevronLeft size={22} />
          </button>
        )}

        <ul
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto scroll-smooth snap-x pb-4 px-1 scrollbar-hide list-none m-0"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {flavors.map(sabor => (
            <li key={sabor.id} className="snap-start shrink-0 w-[190px] sm:w-[210px]">
              <CartaoSabor sabor={sabor} />
            </li>
          ))}
        </ul>

        {podeDireita && (
          <button
            onClick={() => rolar('direita')}
            aria-label="Ver mais sabores"
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-secondary border-2 border-brown p-2.5 text-brown hover:bg-brand transition-colors opacity-0 group-hover:opacity-100 translate-x-3 cursor-pointer"
          >
            <HiChevronRight size={22} />
          </button>
        )}
      </div>
    </div>
  )
}

function CartaoSabor({ sabor }) {
  const [carregou, setCarregou] = useState(false)

  return (
    <div className="bg-cream overflow-hidden border-[3px] border-brown h-full shadow-[4px_4px_0_#5d2b04]">
      <div className="relative bg-bg-warm">
        {sabor.image_url ? (
          <>
            {!carregou && <div className="absolute inset-0 h-36 animate-pulse bg-bg-warm" />}
            <img
              src={sabor.image_url}
              alt={catalogText(sabor.name)}
              loading="lazy"
              onLoad={() => setCarregou(true)}
              className={`w-full h-36 object-cover transition-opacity duration-500 ${carregou ? 'opacity-100' : 'opacity-0'}`}
            />
          </>
        ) : (
          <div className="w-full h-36 flex items-center justify-center">
            <img src="/logo.png" alt="" className="w-14 h-14 opacity-25 object-contain" />
          </div>
        )}
      </div>

      <div className="p-3.5">
        <h3 className="font-display font-extrabold uppercase text-lg text-brown leading-tight">{catalogText(sabor.name)}</h3>
        {sabor.description && (
          <p className="text-text-light text-xs mt-1 leading-relaxed line-clamp-2">{catalogText(sabor.description)}</p>
        )}
      </div>
    </div>
  )
}
