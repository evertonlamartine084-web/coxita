import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HiArrowRight, HiArrowLeft } from 'react-icons/hi'
import { useCartStore } from '../../store/cartStore'
import { getSettings, peekSettings } from '../../services/settings'
import { getProducts } from '../../services/products'
import { calcularDescontoAvista, rotuloDoDesconto } from '../../utils/descontoAvista'
import CartItem from '../../components/cart/CartItem'
import Button from '../../components/ui/Button'
import { formatCurrency } from '../../utils/format'
import Seo from '../../components/ui/Seo'

export default function CartPage() {
  const { items, getSubtotal, clearCart, sincronizarComCatalogo } = useCartStore()
  // Le do cache quando ele existe: o carrinho e a tela seguinte ao cardapio,
  // que ja carregou settings, e piscar o aviso de desconto seria pior que nao
  // mostrar.
  const [settings, setSettings] = useState(() => peekSettings() ?? {})

  useEffect(() => {
    let cancelado = false
    getSettings()
      .then(dados => { if (!cancelado) setSettings(dados) })
      .catch(() => {})
    // O carrinho pode ter sido montado antes de a cozinha mexer na tabela:
    // aqui ele volta a valer o preco do banco, antes de virar pedido.
    getProducts()
      .then(produtos => { if (!cancelado) sincronizarComCatalogo(produtos) })
      .catch(() => {})
    return () => { cancelado = true }
  }, [sincronizarComCatalogo])

  const descontoAvista = calcularDescontoAvista(items, 'pix', settings, getSubtotal())

  const rotuloAVista = rotuloDoDesconto(settings, items)

  if (items.length === 0) {
    return (
      <>
        <Seo titulo="Carrinho" caminho="/carrinho" noindex />
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <div className="relative inline-block mb-6">
            <div className="absolute inset-0 bg-primary/5 rounded-full scale-150" />
            <img width={512} height={512} src="/logo.png" alt="" className="relative w-24 h-24 object-contain mx-auto opacity-40" />
          </div>
          <h2 className="font-display text-3xl font-black uppercase mb-2 text-brown">Seu carrinho está vazio</h2>
          <p className="text-text-light mb-8 max-w-sm mx-auto">
            Que tal escolher umas coxinhas quentinhas e crocantes?
          </p>
          <Link to="/cardapio">
            <Button variant="festive" className="gap-2">
              Ver cardápio
              <HiArrowRight size={18} />
            </Button>
          </Link>
        </div>
      </>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <img width={512} height={512} src="/logo.png" alt="" className="w-8 h-8 object-contain" />
          <h1 className="font-display text-4xl font-black uppercase text-brown">Carrinho</h1>
        </div>
        <button
          onClick={clearCart}
          className="text-text-light text-sm hover:text-danger transition-colors font-medium cursor-pointer"
        >
          Limpar tudo
        </button>
      </div>

      {/* Items */}
      <div className="bg-surface border-2 border-brown/20 p-5 mb-5 shadow-[4px_4px_0_rgba(93,43,4,0.12)]">
        {items.map(item => (
          <CartItem key={item.lineId} item={item} />
        ))}
      </div>

      {/* Summary */}
      <div className="bg-surface border-2 border-brown/20 p-5 shadow-[4px_4px_0_rgba(93,43,4,0.12)]">
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-text-light text-sm">Subtotal</span>
          <span className="font-display font-extrabold text-xl text-text">{formatCurrency(getSubtotal())}</span>
        </div>
        {descontoAvista > 0 && (
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-accent text-sm font-semibold">
              No pix ou dinheiro{rotuloAVista ? ` (${rotuloAVista} off)` : ''}
            </span>
            <span className="font-display font-extrabold text-lg text-accent">
              {formatCurrency(getSubtotal() - descontoAvista)}
            </span>
          </div>
        )}
        <p className="text-text-light text-xs mb-5">Taxa de entrega calculada no checkout</p>

        <Link to="/checkout" className="block">
          <Button className="w-full gap-2" size="lg" variant="festive">
            Finalizar pedido
            <HiArrowRight size={18} />
          </Button>
        </Link>

        <Link to="/cardapio" className="block mt-3">
          <Button variant="ghost" className="w-full gap-2 text-sm">
            <HiArrowLeft size={16} />
            Continuar comprando
          </Button>
        </Link>
      </div>
    </div>
  )
}
