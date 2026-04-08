import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCartStore } from '../../store/cartStore'
import { createOrder } from '../../services/orders'
import { getSettings } from '../../services/settings'
import { createPaymentPreference } from '../../services/payment'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import { formatCurrency } from '../../utils/format'
import toast from 'react-hot-toast'

const initialForm = {
  customer_name: '',
  customer_phone: '',
  delivery_type: 'entrega',
  address: '',
  neighborhood: '',
  address_number: '',
  address_complement: '',
  address_reference: '',
  notes: '',
  payment_method: 'pix',
  change_for: '',
}

export default function CheckoutPage() {
  const navigate = useNavigate()
  const { items, getSubtotal, deliveryFee, setDeliveryFee, getTotal, clearCart } = useCartStore()
  const [form, setForm] = useState(initialForm)
  const [settings, setSettingsData] = useState({})
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (items.length === 0) {
      navigate('/carrinho')
      return
    }
    getSettings().then(s => {
      setSettingsData(s)
      setDeliveryFee(parseFloat(s.delivery_fee || '0'))
    })
  }, [])

  useEffect(() => {
    if (form.delivery_type === 'retirada') {
      setDeliveryFee(0)
    } else {
      setDeliveryFee(parseFloat(settings.delivery_fee || '0'))
    }
  }, [form.delivery_type, settings])

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
    setErrors(e => ({ ...e, [name]: '' }))
  }

  const validate = () => {
    const errs = {}
    if (!form.customer_name.trim()) errs.customer_name = 'Nome obrigatório'
    if (!form.customer_phone.trim()) errs.customer_phone = 'Telefone obrigatório'
    if (form.delivery_type === 'entrega') {
      if (!form.address.trim()) errs.address = 'Endereço obrigatório'
      if (!form.neighborhood.trim()) errs.neighborhood = 'Bairro obrigatório'
      if (!form.address_number.trim()) errs.address_number = 'Número obrigatório'
    }
    const minOrder = parseFloat(settings.min_order || '0')
    if (minOrder > 0 && getSubtotal() < minOrder) {
      errs.min_order = `Pedido mínimo: ${formatCurrency(minOrder)}`
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setSubmitting(true)
    try {
      const orderData = {
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim(),
        delivery_type: form.delivery_type,
        address: form.delivery_type === 'entrega' ? form.address.trim() : null,
        neighborhood: form.delivery_type === 'entrega' ? form.neighborhood.trim() : null,
        address_number: form.delivery_type === 'entrega' ? form.address_number.trim() : null,
        address_complement: form.address_complement.trim() || null,
        address_reference: form.address_reference.trim() || null,
        notes: form.notes.trim() || null,
        payment_method: form.payment_method,
        change_for: form.payment_method === 'dinheiro' && form.change_for ? parseFloat(form.change_for) : null,
        subtotal: getSubtotal(),
        delivery_fee: deliveryFee,
        total: getTotal(),
      }

      const order = await createOrder(orderData, items)

      // Salva dados do pedido para a tela de confirmação
      sessionStorage.setItem('lastOrder', JSON.stringify({
        ...order,
        items: items.map(i => ({ product_name: i.name, quantity: i.quantity, unit_price: i.price })),
        settings: { pix_key: settings.pix_key, pix_name: settings.pix_name, whatsapp: settings.whatsapp },
      }))

      // Se for cartão, redireciona pro Mercado Pago
      if (form.payment_method === 'credito' || form.payment_method === 'debito') {
        try {
          const payment = await createPaymentPreference(order, items)
          clearCart()
          window.location.href = payment.init_point
          return
        } catch (payErr) {
          console.error('Erro ao criar pagamento:', payErr)
          toast.error('Erro ao processar pagamento. Tente outro método.')
          return
        }
      }

      clearCart()
      navigate(`/pedido-confirmado/${order.order_number}`)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao enviar pedido. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Finalizar Pedido</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Dados pessoais */}
        <section className="bg-surface rounded-xl border border-border p-4 space-y-4">
          <h2 className="font-semibold text-lg">Seus Dados</h2>
          <Input
            label="Nome *"
            name="customer_name"
            value={form.customer_name}
            onChange={handleChange}
            error={errors.customer_name}
            placeholder="Seu nome completo"
          />
          <Input
            label="Telefone *"
            name="customer_phone"
            value={form.customer_phone}
            onChange={handleChange}
            error={errors.customer_phone}
            placeholder="(00) 00000-0000"
          />
        </section>

        {/* Tipo de entrega */}
        <section className="bg-surface rounded-xl border border-border p-4">
          <h2 className="font-semibold text-lg mb-3">Tipo de Entrega</h2>
          <div className="flex gap-3">
            {[
              { value: 'entrega', label: '🚴 Entrega' },
              { value: 'retirada', label: '🏪 Retirada' },
            ].map(opt => (
              <label key={opt.value} className={`flex-1 p-3 rounded-lg border-2 text-center cursor-pointer transition-colors ${
                form.delivery_type === opt.value ? 'border-primary bg-orange-50' : 'border-border'
              }`}>
                <input
                  type="radio"
                  name="delivery_type"
                  value={opt.value}
                  checked={form.delivery_type === opt.value}
                  onChange={handleChange}
                  className="sr-only"
                />
                <span className="font-medium">{opt.label}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Endereço */}
        {form.delivery_type === 'entrega' && (
          <section className="bg-surface rounded-xl border border-border p-4 space-y-4">
            <h2 className="font-semibold text-lg">Endereço</h2>
            <Input label="Rua *" name="address" value={form.address} onChange={handleChange} error={errors.address} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Número *" name="address_number" value={form.address_number} onChange={handleChange} error={errors.address_number} />
              <Input label="Complemento" name="address_complement" value={form.address_complement} onChange={handleChange} />
            </div>
            <Input label="Bairro *" name="neighborhood" value={form.neighborhood} onChange={handleChange} error={errors.neighborhood} />
            <Input label="Referência" name="address_reference" value={form.address_reference} onChange={handleChange} placeholder="Próximo a..." />
          </section>
        )}

        {/* Pagamento */}
        <section className="bg-surface rounded-xl border border-border p-4">
          <h2 className="font-semibold text-lg mb-3">Pagamento</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: 'pix', label: '📱 Pix' },
              { value: 'dinheiro', label: '💵 Dinheiro' },
              { value: 'credito', label: '💳 Crédito' },
              { value: 'debito', label: '💳 Débito' },
            ].map(opt => (
              <label key={opt.value} className={`p-3 rounded-lg border-2 text-center cursor-pointer transition-colors ${
                form.payment_method === opt.value ? 'border-primary bg-orange-50' : 'border-border'
              }`}>
                <input
                  type="radio"
                  name="payment_method"
                  value={opt.value}
                  checked={form.payment_method === opt.value}
                  onChange={handleChange}
                  className="sr-only"
                />
                <span className="font-medium text-sm">{opt.label}</span>
              </label>
            ))}
          </div>

          {form.payment_method === 'dinheiro' && (
            <div className="mt-4">
              <Input
                label="Troco para quanto?"
                name="change_for"
                type="number"
                value={form.change_for}
                onChange={handleChange}
                placeholder="Ex: 50.00"
              />
            </div>
          )}

          {form.payment_method === 'pix' && settings.pix_key && (
            <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
              <p className="text-sm font-medium text-green-800">Chave Pix:</p>
              <p className="text-sm text-green-700 font-mono mt-1">{settings.pix_key}</p>
              {settings.pix_name && (
                <p className="text-xs text-green-600 mt-1">Nome: {settings.pix_name}</p>
              )}
            </div>
          )}
        </section>

        {/* Observações */}
        <section className="bg-surface rounded-xl border border-border p-4">
          <h2 className="font-semibold text-lg mb-3">Observações</h2>
          <textarea
            name="notes"
            value={form.notes}
            onChange={handleChange}
            rows={3}
            className="w-full px-3 py-2 border border-border rounded-lg outline-none focus:border-primary resize-none"
            placeholder="Alguma observação sobre o pedido?"
          />
        </section>

        {/* Resumo */}
        <section className="bg-surface rounded-xl border border-border p-4">
          <h2 className="font-semibold text-lg mb-3">Resumo</h2>
          {items.map(item => (
            <div key={item.id} className="flex justify-between text-sm py-1">
              <span>{item.quantity}x {item.name}</span>
              <span>{formatCurrency(item.price * item.quantity)}</span>
            </div>
          ))}
          <div className="border-t border-border mt-3 pt-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span>{formatCurrency(getSubtotal())}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Taxa de entrega</span>
              <span>{deliveryFee > 0 ? formatCurrency(deliveryFee) : 'Grátis'}</span>
            </div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-border">
              <span>Total</span>
              <span className="text-primary">{formatCurrency(getTotal())}</span>
            </div>
          </div>
        </section>

        {errors.min_order && (
          <p className="text-danger text-sm text-center">{errors.min_order}</p>
        )}

        <Button type="submit" className="w-full" size="lg" disabled={submitting}>
          {submitting ? 'Enviando...' : 'Confirmar Pedido'}
        </Button>
      </form>
    </div>
  )
}
