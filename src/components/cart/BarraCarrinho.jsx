import { Link, useLocation } from 'react-router-dom'
import { HiShoppingBag, HiArrowRight, HiPlus } from 'react-icons/hi'
import { useCartStore } from '../../store/cartStore'
import { formatCurrency } from '../../utils/format'

// telas em que a barra atrapalha: o próprio carrinho, o checkout e o depois do pedido
const ESCONDER_EM = ['/carrinho', '/checkout', '/pedido-confirmado', '/pagamento-falhou', '/acompanhar', '/meus-pedidos']

/**
 * Resumo do carrinho fixo no pé da tela: aparece com o primeiro item e acompanha o cliente
 * enquanto ele monta o pedido, sem precisar abrir o carrinho para ver quanto já deu.
 *
 * Unidades contam o pacote inteiro (um cento = 100 un), porque é assim que o cliente pensa
 * no tamanho do pedido; bebida e item avulso contam 1.
 */
export default function BarraCarrinho() {
  const { pathname } = useLocation()
  const items = useCartStore(s => s.items)

  if (items.length === 0 || ESCONDER_EM.some(p => pathname.startsWith(p))) return null

  const total = items.reduce((s, i) => s + i.price * i.quantity, 0)
  const unidades = items.reduce((s, i) => s + i.quantity * (i.pack_size > 0 ? i.pack_size : 1), 0)
  const linhas = items.length
  const noCardapio = pathname.startsWith('/cardapio')

  return (
    <>
      {/* ocupa o lugar da barra no fim da página, para ela não cobrir o rodapé */}
      <div aria-hidden="true" className="h-24" />
      <div
        role="region"
        aria-label="Resumo do pedido"
        className="barra-carrinho fixed inset-x-0 bottom-0 z-40 border-t-2 border-brown bg-cream/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:gap-4">
          <Link to="/carrinho" className="flex min-w-0 flex-1 items-center gap-3 no-underline" aria-label="Ver carrinho">
            <span className="relative flex size-12 shrink-0 items-center justify-center rounded-md border-2 border-brown bg-white text-brown">
              <HiShoppingBag size={22} />
              <span className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                {linhas}
              </span>
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm text-text-light">
                {linhas} {linhas === 1 ? 'item' : 'itens'} • {unidades} un
              </span>
              {/* muda de chave a cada novo total: o pulinho mostra que o item entrou */}
              <span key={total} className="pop block font-display text-2xl font-black text-primary">
                {formatCurrency(total)}
              </span>
            </span>
          </Link>

          {!noCardapio && (
            <Link
              to="/cardapio"
              className="hidden items-center gap-2 rounded-sm border-2 border-brown px-4 py-2.5 font-display text-sm font-extrabold uppercase tracking-[0.04em] text-brown no-underline transition-colors hover:bg-brown hover:text-white sm:inline-flex"
            >
              <HiPlus size={16} /> Adicionar mais
            </Link>
          )}
          <Link
            to="/checkout"
            className="inline-flex shrink-0 items-center gap-2 rounded-sm border-2 border-brown bg-brown px-4 py-2.5 font-display text-sm font-extrabold uppercase tracking-[0.04em] text-white no-underline shadow-[4px_4px_0_#ffcd5e] transition-colors hover:border-primary hover:bg-primary sm:px-5"
          >
            Finalizar pedido <HiArrowRight size={16} />
          </Link>
        </div>
      </div>
    </>
  )
}
