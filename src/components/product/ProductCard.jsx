import { useState } from 'react'
import { HiPlus, HiShoppingCart, HiHeart, HiOutlineHeart } from 'react-icons/hi'
import { useCartStore } from '../../store/cartStore'
import { useFavoritesStore } from '../../store/favoritesStore'
import { formatCurrency } from '../../utils/format'
import { ehPacote, unidadeDoPacote, saborUnicoDoPacote } from '../../utils/pacote'
import { catalogText } from '../../utils/catalogText'
import { ESTILO_TOAST } from '../../utils/toastEstilo'
import FlavorPicker from './FlavorPicker'
import toast from 'react-hot-toast'

export default function ProductCard({ product }) {
  const addItem = useCartStore(s => s.addItem)
  const isFavorite = useFavoritesStore(s => s.isFavorite(product.id))
  const toggleFavorite = useFavoritesStore(s => s.toggleFavorite)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [montando, setMontando] = useState(false)

  const pacote = ehPacote(product)
  // "Cento de Pastel Sertanejo" nao tem sabor a escolher: abrir o seletor com
  // os cinco pasteis convidaria o cliente a montar algo que este produto nao
  // vende. Vai direto ao carrinho, com o sabor ja marcado -- a cozinha recebe
  // o pedido com o recheio escrito, como nos pacotes mistos.
  const saborUnico = saborUnicoDoPacote(product)
  const precisaMontar = pacote && !saborUnico

  const handleAdd = () => {
    if (precisaMontar) {
      setMontando(true)
      return
    }
    addItem(product, saborUnico)
    toast.success(`${product.name} adicionado!`, ESTILO_TOAST)
  }

  const confirmarSabores = (sabores, preco) => {
    addItem({ ...product, ...(preco ?? {}) }, sabores)
    setMontando(false)
    toast.success(`${product.name} adicionado!`, ESTILO_TOAST)
  }

  return (
    <article className="group bg-surface overflow-hidden border-[3px] border-brown shadow-[5px_5px_0_#5d2b04] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[3px_3px_0_#5d2b04] transition-[transform,box-shadow] duration-[--duration-fast] ease-[--ease-interaction]">
      {/* Image */}
      {/* Moldura. O creme vira passe-partout e a foto ganha a mesma borda marrom
          com sombra dura do card, em escala menor: repete a linguagem impressa e
          cria a leitura de retrato colado sobre o cartaz. Badge e coracao ficam
          dentro da moldura, senao flutuariam sobre o passe-partout. */}
      <div className="bg-cream p-1.5 pr-2 pb-2 sm:p-2.5 sm:pr-3 sm:pb-3">
      <div className="relative overflow-hidden border-2 border-brown bg-bg-warm shadow-[2px_2px_0_#5d2b04]">
        {product.image_url ? (
          <>
            {!imgLoaded && (
              <div className="absolute inset-0 w-full h-32 sm:h-56 bg-bg-warm animate-pulse flex items-center justify-center">
                <img width={512} height={512} src="/logo.png" alt="" className="w-16 h-16 opacity-20 object-contain" />
              </div>
            )}
            <img
              src={product.image_url}
              alt={catalogText(product.name)}
              className={`block w-full h-32 sm:h-56 object-cover transition-opacity duration-500 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
            />
          </>
        ) : (
          <div className="w-full h-32 sm:h-56 bg-bg-warm flex items-center justify-center">
            <img width={512} height={512} src="/logo.png" alt="" className="w-12 h-12 sm:w-20 sm:h-20 opacity-30 object-contain" />
          </div>
        )}

        {/* Category badge */}
        {product.categories && (
          <span className="absolute top-1.5 left-1.5 sm:top-3 sm:left-3 gingham-blue text-white text-[9px] sm:text-xs font-extrabold px-1.5 py-0.5 sm:px-2.5 sm:py-1 border-2 border-brown uppercase tracking-wide">
            {product.categories.name}
          </span>
        )}

        {/* Favorite button */}
        {/* O coracao e o unico lugar onde o overshoot se justifica: e uma
            reacao afetiva, nao um controle de navegacao. */}
        <button
          onClick={() => toggleFavorite(product.id)}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? `Remover ${catalogText(product.name)} dos favoritos` : `Favoritar ${catalogText(product.name)}`}
          className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 z-10 bg-secondary p-1 sm:p-2 border-2 border-brown hover:bg-brand active:scale-[0.86] transition-[background-color,transform] duration-[--duration-fast] ease-[--ease-interaction] cursor-pointer"
        >
          {/* A `key` remonta o span a cada troca, e o remount reinicia a
              animacao -- e o que faz o coracao "pulsar" ao favoritar. */}
          <span key={isFavorite ? 'cheio' : 'vazio'} className="block pop">
            {isFavorite ? (
              <HiHeart className="text-danger" size={18} />
            ) : (
              <HiOutlineHeart className="text-text-light" size={18} />
            )}
          </span>
        </button>

      </div>
      </div>

      {/* Content */}
      <div className="px-2.5 pb-3 sm:px-4 sm:pb-4">
        <h3 className="font-display font-extrabold uppercase text-base sm:text-2xl text-brown leading-tight sm:leading-none">{catalogText(product.name)}</h3>
        {product.description && (
          <p className="text-text-light text-xs sm:text-sm mt-1 sm:mt-1.5 line-clamp-2 leading-snug sm:leading-relaxed">{catalogText(product.description)}</p>
        )}

        <div className="flex items-end justify-between gap-1.5 mt-2.5 pt-2 sm:mt-4 sm:pt-3 border-t border-border/50">
          <div>
            <span className="text-[10px] sm:text-xs text-text-light block">
              {pacote ? `${product.pack_size} ${unidadeDoPacote(product)}` : 'a partir de'}
            </span>
            <span className="text-lg sm:text-2xl font-display font-extrabold text-primary whitespace-nowrap">
              {formatCurrency(product.price)}
            </span>
          </div>
          <button
            onClick={handleAdd}
            aria-label={precisaMontar ? `Montar ${catalogText(product.name)}` : `Adicionar ${catalogText(product.name)} ao carrinho`}
            className={`bg-primary text-white border-2 border-brown rounded-sm hover:bg-brown active:scale-[0.94] transition-[background-color,transform] duration-[--duration-fast] ease-[--ease-interaction] group/btn cursor-pointer ${
              precisaMontar ? 'px-2.5 py-2 sm:px-4 sm:py-3 font-display font-bold text-xs sm:text-sm' : 'p-2 sm:p-3'
            }`}
          >
            {precisaMontar ? (
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

      {precisaMontar && (
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
