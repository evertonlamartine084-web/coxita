import { useParams, Link } from 'react-router-dom'
import Button from '../../components/ui/Button'

export default function OrderConfirmationPage() {
  const { orderNumber } = useParams()

  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <div className="text-6xl mb-4">✅</div>
      <h1 className="text-3xl font-bold mb-2">Pedido Confirmado!</h1>
      <p className="text-text-light mb-2">Seu pedido foi recebido com sucesso.</p>
      <div className="bg-surface rounded-xl border border-border p-6 my-6">
        <p className="text-sm text-text-light">Número do pedido</p>
        <p className="text-4xl font-bold text-primary mt-1">#{orderNumber}</p>
      </div>
      <p className="text-text-light text-sm mb-6">
        Acompanhe seu pedido pelo WhatsApp informando o número acima.
      </p>
      <Link to="/">
        <Button>Voltar ao Início</Button>
      </Link>
    </div>
  )
}
