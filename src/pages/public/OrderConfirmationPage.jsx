import { useParams, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Button from '../../components/ui/Button'
import { formatCurrency, PAYMENT_LABELS } from '../../utils/format'
import { buildOrderMessage, sendWhatsAppMessage } from '../../utils/whatsapp'
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

  const handleSendWhatsApp = () => {
    if (!order) return
    const message = buildOrderMessage(order, order.items)
    const phone = order.settings?.whatsapp
    if (phone) {
      sendWhatsAppMessage(phone, message)
    } else {
      toast.error('WhatsApp da loja não configurado.')
    }
  }

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

      {/* Enviar pro WhatsApp */}
      <button
        onClick={handleSendWhatsApp}
        className="w-full py-4 rounded-xl font-semibold text-white text-lg mb-4 flex items-center justify-center gap-3"
        style={{ backgroundColor: '#25D366' }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        Enviar Pedido via WhatsApp
      </button>

      <p className="text-text-light text-xs text-center mb-6">
        Envie o resumo do pedido pelo WhatsApp para agilizar o preparo!
      </p>

      <Link to="/" className="block">
        <Button variant="outline" className="w-full">Voltar ao Início</Button>
      </Link>
    </div>
  )
}
