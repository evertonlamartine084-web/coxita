import { useState } from 'react'
import { HiPlus, HiShoppingCart, HiHeart, HiOutlineHeart } from 'react-icons/hi'
import { useCartStore } from '../../store/cartStore'
import { useFavoritesStore } from '../../store/favoritesStore'
import { formatCurrency } from '../../utils/format'
import { ehPacote } from '../../utils/pacote'
import { catalogText } from '../../utils/catalogText'
import FlavorPicker from './FlavorPicker'
import toast from 'react-hot-toast'

const ESTILO_TOAST = {
  icon: null,
  style: {
    background: '#3D2410',
    color: '#fff',
    borderRadius: '1rem',
    fontFamily: "'Barlow', Arial, sans-serif",
    fontWeight: 600,
  },
}

export default function ProductCard({ product }) {
  const addItem = useCartStore(s => s.addItem)
  const isFavorite = useFavoritesStore(s => s.isFavorite(product.id))
  const toggleFavorite = useFavoritesStore(s => s.toggleFavorite)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [montando, setMontando] = useState(false)

  const pacote = ehPacote(product)

  const handleAdd = () => {
    // Pacote nao pode ir ao carrinho sem sabores: abre o seletor.
    if (pacote) {
      setMontando(true)
      return
    }
    addItem(product)
    toast.success(`${product.name} adicionado!`, ESTILO_TOAST)
  }

  const confirmarSabores = (sabores) => {
    addItem(product, sabores)
    setMontando(false)
    toast.success(`${product.name} adicionado!`, ESTILO_TOAST)
  }

  return (
    <article className="group bg-surface overflow-hidden border-[3px] border-brown shadow-[5px_5px_0_#5d2b04] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[3px_3px_0_#5d2b04] transition-[transform,box-shadow] duration-[--duration-fast] ease-[--ease-interaction]">
      {/* Image */}
      <div className="relative overflow-hidden">
        {product.image_url ? (
          <>
            {!imgLoaded && (
              <div className="absolute inset-0 w-full h-56 bg-bg-warm animate-pulse flex items-center justify-center">
                <img src="/logo.png" alt="" className="w-16 h-16 opacity-20 object-contain" />
              </div>
            )}
            <img
              src={product.image_url}
              alt={catalogText(product.name)}
              className={`w-full h-56 object-cover transition-opacity duration-500 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
            />
          </>
        ) : (
          <div className="w-full h-56 bg-bg-warm flex items-center justify-center">
            <img src="/logo.png" alt="" className="w-20 h-20 opacity-30 object-contain" />
          </div>
        )}

        {/* Category badge */}
        {product.categories && (
          <span className="absolute top-3 left-3 gingham-blue text-white text-xs font-extrabold px-2.5 py-1 border-2 border-brown uppercase tracking-wide">
            {product.categories.name}
          </span>
        )}

        {/* Favorite button */}
        <button
          onClick={() => toggleFavorite(product.id)}
          className="absolute top-3 right-3 z-10 bg-secondary p-2 border-2 border-brown hover:bg-brand transition-colors duration-[--duration-fast] ease-[--ease-interaction] cursor-pointer"
        >
          {isFavorite ? (
            <HiHeart className="text-danger" size={18} />
          ) : (
            <HiOutlineHeart className="text-text-light" size={18} />
          )}
        </button>

      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-display font-extrabold uppercase text-2xl text-brown leading-none">{catalogText(product.name)}</h3>
        {product.description && (
          <p className="text-text-light text-sm mt-1.5 line-clamp-2 leading-relaxed">{catalogText(product.description)}</p>
        )}

        <div className="flex items-end justify-between mt-4 pt-3 border-t border-border/50">
          <div>
            <span className="text-xs text-text-light block">
              {pacote ? `${product.pack_size} salgados` : 'a partir de'}
            </span>
            <span className="text-2xl font-display font-extrabold text-primary">
              {formatCurrency(product.price)}
            </span>
          </div>
          <button
            onClick={handleAdd}
            aria-label={pacote ? `Montar ${catalogText(product.name)}` : `Adicionar ${catalogText(product.name)} ao carrinho`}
            className={`bg-primary text-white border-2 border-brown rounded-sm hover:bg-brown active:scale-[0.98] transition-[background-color,transform] duration-[--duration-fast] ease-[--ease-interaction] group/btn cursor-pointer ${
              pacote ? 'px-4 py-3 font-display font-bold text-sm' : 'p-3'
            }`}
          >
            {pacote ? (
              'Montar'
            ) : (
              <>
                <HiPlus size={20} className="group-hover/btn:hidden" />
                <HiShoppingCart size={20} className="hidden group-hover/btn:block" />
              </>
            )}
          </button>
        </div>
      </div>

      {pacote && (
        <FlavorPicker
          product={product}
          aberto={montando}
          aoFechar={() => setMontando(false)}
          aoConfirmar={confirmarSabores}
        />
      )}
    </article>
  )
}
