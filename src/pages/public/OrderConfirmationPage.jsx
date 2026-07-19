import { useParams, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { HiClipboardCopy, HiCheck, HiHome } from 'react-icons/hi'
import { getOrderByNumber } from '../../services/orders'
import { getSettings } from '../../services/settings'
import Button from '../../components/ui/Button'
import Loading from '../../components/ui/Loading'
import ShareButtons from '../../components/share/ShareButtons'
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
    <div className="min-h-screen bg-cream dots-paper">
      <div className="max-w-xl mx-auto px-4 py-10 md:py-14">
        {/* Success header */}
        <div className="text-center mb-8">
          <div className="relative inline-block mb-5">
            <div className="relative w-24 h-24 bg-secondary rounded-full border-4 border-brown flex items-center justify-center mx-auto shadow-[5px_5px_0_#3f6bb5]">
              <HiCheck className="text-brown" size={46} />
            </div>
          </div>

          <p className="font-display text-xs font-extrabold uppercase tracking-[0.14em] text-festa mb-1">Já chegou na cozinha</p>
          <h1 className="font-display text-4xl md:text-5xl font-black uppercase text-brown mb-2">Pedido confirmado!</h1>
          <p className="text-text-light">Agora é só acompanhar o preparo.</p>

          <div className="bg-surface border-3 border-brown p-6 my-6 shadow-[5px_5px_0_#ffcd5e]">
            <p className="text-xs text-text-light uppercase tracking-wider font-semibold">Número do pedido</p>
            <p className="font-display text-5xl font-black text-primary mt-1">#{orderNumber}</p>
          </div>

          {order?.scheduled_for && (
            <div className="bg-primary/5 card-organic border-2 border-primary/30 p-4 mb-6 text-center">
              <p className="text-xs text-text-light uppercase tracking-wider font-semibold">Agendado para</p>
              <p className="font-display text-lg font-bold text-primary mt-1">
                {new Date(order.scheduled_for).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}
                {' às '}
                {new Date(order.scheduled_for).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          )}
        </div>

        {/* Pagamento Pix */}
        {order?.payment_method === 'pix' && settings?.pix_key && (
          <div className="bg-accent/5 card-organic border-2 border-accent/30 p-6 mb-6">
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-accent/10 rounded-2xl flex items-center justify-center mx-auto mb-2">
                <HiClipboardCopy className="text-accent" size={24} />
              </div>
              <h2 className="font-display text-lg font-bold text-accent">Pagamento via Pix</h2>
              <p className="text-sm text-accent/70 mt-0.5">Faça o pagamento para confirmar</p>
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
              Tenha <strong>{formatCurrency(order.total)}</strong> em mãos na hora da entrega.
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
              O pagamento de <strong>{formatCurrency(order.total)}</strong> será feito na entrega ou retirada.
            </p>
          </div>
        )}

        {/* Share */}
        <div className="mt-6">
          <ShareButtons orderNumber={orderNumber} />
        </div>

        <Link to={`/acompanhar/${orderNumber}`} className="block mt-5">
          <Button className="w-full gap-2" variant="festive">
            <HiCheck size={18} />
            Acompanhar pedido
          </Button>
        </Link>

        <Link to="/" className="block mt-3">
          <Button variant="outline" className="w-full gap-2">
            <HiHome size={18} />
            Voltar ao início
          </Button>
        </Link>
      </div>
    </div>
  )
}
