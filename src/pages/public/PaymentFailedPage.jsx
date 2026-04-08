import { useParams, Link } from 'react-router-dom'
import Button from '../../components/ui/Button'

export default function PaymentFailedPage() {
  const { orderNumber } = useParams()

  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <div className="text-6xl mb-4">❌</div>
      <h1 className="text-3xl font-bold mb-2">Pagamento não aprovado</h1>
      <p className="text-text-light mb-2">
        O pagamento do pedido <strong>#{orderNumber}</strong> não foi concluído.
      </p>
      <p className="text-text-light text-sm mb-6">
        Você pode tentar novamente ou escolher outro método de pagamento.
      </p>
      <div className="flex flex-col gap-3">
        <Link to="/carrinho">
          <Button className="w-full">Tentar Novamente</Button>
        </Link>
        <Link to="/">
          <Button variant="outline" className="w-full">Voltar ao Início</Button>
        </Link>
      </div>
    </div>
  )
}
