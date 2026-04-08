import { useParams, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { HiClipboardCopy, HiCheck, HiHome } from 'react-icons/hi'
import { getOrderByNumber } from '../../services/orders'
import { getSettings } from '../../services/settings'
import Button from '../../components/ui/Button'
import Loading from '../../components/ui/Loading'
import { formatCurrency, PAYMENT_LABELS } from '../../utils/format'
import toast from 'react-hot-toast'

export default function OrderConfirmationPage() {
  const { orderNumber } = useParams()
  const [order, setOrder] = useState(null)
  const [settings, setSettingsData] = useState({})
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getOrderByNumber(parseInt(orderNumber)),
      getSettings(),
    ])
      .then(([orderData, settingsData]) => {
        setOrder(orderData)
        setSettingsData(settingsData)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [orderNumber])

  const handleCopyPix = () => {
    const pixKey = settings?.pix_key
    if (pixKey) {
      navigator.clipboard.writeText(pixKey)
      setCopied(true)
      toast.success('Chave Pix copiada!')
      setTimeout(() => setCopied(false), 3000)
    }
  }

  if (loading) return <Loading />

  return (
    <div className="min-h-screen bg-gradient-to-b from-bg-warm to-bg">
      <div className="max-w-lg mx-auto px-4 py-10">
        {/* Success header */}
        <div className="text-center mb-8">
          <div className="relative inline-block mb-5">
            <div className="absolute inset-0 bg-accent/10 rounded-full scale-[2] animate-ping opacity-30" />
            <div className="relative w-20 h-20 bg-accent/10 rounded-full flex items-center justify-center mx-auto">
              <img src="/logo.png" alt="" className="w-14 h-14 object-contain" />
            </div>
          </div>

          <h1 className="font-display text-3xl font-extrabold text-text mb-2">Pedido confirmado!</h1>
          <p className="text-text-light">Seu pedido foi recebido com sucesso</p>

          <div className="bg-surface card-organic border-2 border-dashed border-secondary p-6 my-6 shadow-sm">
            <p className="text-xs text-text-light uppercase tracking-wider font-semibold">Numero do pedido</p>
            <p className="font-display text-4xl font-extrabold text-primary mt-1">#{orderNumber}</p>
          </div>
        </div>

        {/* Pagamento Pix */}
        {order?.payment_method === 'pix' && settings?.pix_key && (
          <div className="bg-accent/5 card-organic border-2 border-accent/30 p-6 mb-6">
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-accent/10 rounded-2xl flex items-center justify-center mx-auto mb-2">
                <HiClipboardCopy className="text-accent" size={24} />
              </div>
              <h2 className="font-display text-lg font-bold text-accent">Pagamento via Pix</h2>
              <p className="text-sm text-accent/70 mt-0.5">Faca o pagamento para confirmar</p>
            </div>

            <div className="bg-white rounded-xl p-4 mb-3 shadow-sm">
              <p className="text-xs text-text-light mb-1 font-semibold uppercase tracking-wide">Chave Pix</p>
              <p className="font-mono text-sm font-bold break-all text-text">{settings.pix_key}</p>
              {settings.pix_name && (
                <p className="text-xs text-text-light mt-1.5">Nome: {settings.pix_name}</p>
              )}
            </div>

            <div className="bg-white rounded-xl p-4 mb-4 text-center shadow-sm">
              <p className="text-xs text-text-light mb-1 font-semibold uppercase tracking-wide">Valor a pagar</p>
              <p className="font-display text-3xl font-extrabold text-accent">{formatCurrency(order.total)}</p>
            </div>

            <button
              onClick={handleCopyPix}
              className={`w-full py-3.5 rounded-xl font-bold font-display flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer ${
                copied
                  ? 'bg-accent text-white'
                  : 'bg-accent/90 text-white hover:bg-accent hover:shadow-lg'
              }`}
            >
              {copied ? (
                <>
                  <HiCheck size={20} />
                  Chave copiada!
                </>
              ) : (
                <>
                  <HiClipboardCopy size={20} />
                  Copiar chave Pix
                </>
              )}
            </button>
          </div>
        )}

        {/* Pagamento Dinheiro */}
        {order?.payment_method === 'dinheiro' && (
          <div className="bg-secondary/10 card-organic border-2 border-secondary/40 p-6 mb-6 text-center">
            <div className="w-12 h-12 bg-secondary/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <span className="font-display font-bold text-lg text-primary-dark">R$</span>
            </div>
            <h2 className="font-display text-lg font-bold text-primary-dark">Pagamento em dinheiro</h2>
            <p className="text-sm text-text-warm mt-2">
              Tenha <strong>{formatCurrency(order.total)}</strong> em maos na hora da entrega.
            </p>
            {order.change_for && (
              <p className="text-sm text-text-warm mt-1">
                Troco para: <strong>{formatCurrency(order.change_for)}</strong>
              </p>
            )}
          </div>
        )}

        {/* Pagamento Cartao */}
        {(order?.payment_method === 'credito' || order?.payment_method === 'debito') && (
          <div className="bg-festa/5 card-organic border-2 border-festa/30 p-6 mb-6 text-center">
            <div className="w-12 h-12 bg-festa/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <HiCheck className="text-festa" size={24} />
            </div>
            <h2 className="font-display text-lg font-bold text-festa">
              Pagamento no {PAYMENT_LABELS[order.payment_method]}
            </h2>
            <p className="text-sm text-text-warm mt-2">
              O pagamento de <strong>{formatCurrency(order.total)}</strong> sera feito na entrega/retirada.
            </p>
          </div>
        )}

        <Link to={`/acompanhar/${orderNumber}`} className="block mt-8">
          <Button className="w-full gap-2" variant="festive">
            <HiCheck size={18} />
            Acompanhar pedido
          </Button>
        </Link>

        <Link to="/" className="block mt-3">
          <Button variant="outline" className="w-full gap-2">
            <HiHome size={18} />
            Voltar ao inicio
          </Button>
        </Link>
      </div>
    </div>
  )
}
