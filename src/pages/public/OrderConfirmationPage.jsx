import { useParams, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Button from '../../components/ui/Button'
import { formatCurrency, PAYMENT_LABELS } from '../../utils/format'
import toast from 'react-hot-toast'

export default function OrderConfirmationPage() {
  const { orderNumber } = useParams()
  const [order, setOrder] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const saved = sessionStorage.getItem('lastOrder')
    if (saved) {
      setOrder(JSON.parse(saved))
    }
  }, [])



  const handleCopyPix = () => {
    const pixKey = order?.settings?.pix_key
    if (pixKey) {
      navigator.clipboard.writeText(pixKey)
      setCopied(true)
      toast.success('Chave Pix copiada!')
      setTimeout(() => setCopied(false), 3000)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-3xl font-bold mb-2">Pedido Confirmado!</h1>
        <p className="text-text-light">Seu pedido foi recebido com sucesso.</p>
        <div className="bg-surface rounded-xl border border-border p-6 my-6">
          <p className="text-sm text-text-light">Número do pedido</p>
          <p className="text-4xl font-bold text-primary mt-1">#{orderNumber}</p>
        </div>
      </div>

      {/* Pagamento Pix */}
      {order?.payment_method === 'pix' && order?.settings?.pix_key && (
        <div className="bg-green-50 rounded-xl border-2 border-green-300 p-5 mb-6">
          <div className="text-center mb-3">
            <span className="text-3xl">📱</span>
            <h2 className="text-lg font-bold text-green-800 mt-1">Pagamento via Pix</h2>
            <p className="text-sm text-green-700">Faça o pagamento para confirmar seu pedido</p>
          </div>

          <div className="bg-white rounded-lg p-4 mb-3">
            <p className="text-xs text-text-light mb-1">Chave Pix</p>
            <p className="font-mono text-sm font-semibold break-all">{order.settings.pix_key}</p>
            {order.settings.pix_name && (
              <p className="text-xs text-text-light mt-1">Nome: {order.settings.pix_name}</p>
            )}
          </div>

          <div className="bg-white rounded-lg p-4 mb-3 text-center">
            <p className="text-xs text-text-light mb-1">Valor a pagar</p>
            <p className="text-2xl font-bold text-green-700">{formatCurrency(order.total)}</p>
          </div>

          <button
            onClick={handleCopyPix}
            className={`w-full py-3 rounded-lg font-semibold transition-colors ${
              copied
                ? 'bg-green-600 text-white'
                : 'bg-green-500 text-white hover:bg-green-600'
            }`}
          >
            {copied ? '✓ Chave Copiada!' : '📋 Copiar Chave Pix'}
          </button>
        </div>
      )}

      {/* Pagamento Dinheiro */}
      {order?.payment_method === 'dinheiro' && (
        <div className="bg-yellow-50 rounded-xl border-2 border-yellow-300 p-5 mb-6 text-center">
          <span className="text-3xl">💵</span>
          <h2 className="text-lg font-bold text-yellow-800 mt-1">Pagamento em Dinheiro</h2>
          <p className="text-sm text-yellow-700 mt-1">
            Tenha {formatCurrency(order.total)} em mãos na hora da entrega.
          </p>
          {order.change_for && (
            <p className="text-sm text-yellow-700 mt-1">
              Troco para: {formatCurrency(order.change_for)}
            </p>
          )}
        </div>
      )}

      {/* Pagamento Cartão */}
      {(order?.payment_method === 'credito' || order?.payment_method === 'debito') && (
        <div className="bg-blue-50 rounded-xl border-2 border-blue-300 p-5 mb-6 text-center">
          <span className="text-3xl">💳</span>
          <h2 className="text-lg font-bold text-blue-800 mt-1">
            Pagamento no {PAYMENT_LABELS[order.payment_method]}
          </h2>
          <p className="text-sm text-blue-700 mt-1">
            O pagamento de {formatCurrency(order.total)} será feito na entrega/retirada.
          </p>
        </div>
      )}

      <Link to="/" className="block mt-6">
        <Button variant="outline" className="w-full">Voltar ao Início</Button>
      </Link>
    </div>
  )
}
