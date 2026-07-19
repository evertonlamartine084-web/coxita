import { useParams, Link } from 'react-router-dom'
import { HiArrowLeft, HiRefresh } from 'react-icons/hi'
import Button from '../../components/ui/Button'

export default function PaymentFailedPage() {
  const { orderNumber } = useParams()

  return (
    <div className="min-h-[70vh] bg-cream dots-paper flex items-center">
      <div className="max-w-xl mx-auto px-4 py-14 text-center">
        <div className="w-24 h-24 mx-auto mb-6 bg-surface border-4 border-brown shadow-[5px_5px_0_#f28c28] flex items-center justify-center">
          <span className="font-display text-6xl font-black text-danger leading-none">!</span>
        </div>
        <p className="font-display text-xs font-extrabold uppercase tracking-[0.14em] text-festa mb-1">Pedido #{orderNumber}</p>
        <h1 className="font-display text-4xl md:text-5xl font-black uppercase text-brown mb-3">Pagamento não aprovado</h1>
        <p className="text-text-warm text-lg mb-2">
          A cobrança não foi concluída, mas seu carrinho continua salvo.
        </p>
        <p className="text-text-light mb-8">
          Tente novamente ou escolha outro método de pagamento no fechamento do pedido.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/carrinho">
            <Button className="w-full gap-2">
              <HiRefresh size={18} />
              Voltar ao carrinho
            </Button>
          </Link>
          <Link to="/">
            <Button variant="outline" className="w-full gap-2">
              <HiArrowLeft size={18} />
              Voltar ao início
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
