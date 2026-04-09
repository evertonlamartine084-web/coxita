import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { HiTruck, HiOfficeBuilding, HiCreditCard, HiCash, HiDeviceMobile } from 'react-icons/hi'
import { useCartStore } from '../../store/cartStore'
import { useLoyaltyStore } from '../../store/loyaltyStore'
import { createOrder } from '../../services/orders'
import { getSettings } from '../../services/settings'
import { createPaymentPreference } from '../../services/payment'
import { notifyNewOrder } from '../../services/notifications'
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
  const addLoyaltyItems = useLoyaltyStore(s => s.addItems)
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
    if (!form.customer_name.trim()) errs.customer_name = 'Nome obrigatorio'
    if (!form.customer_phone.trim()) errs.customer_phone = 'Telefone obrigatorio'
    if (form.delivery_type === 'entrega') {
      if (!form.address.trim()) errs.address = 'Endereco obrigatorio'
      if (!form.neighborhood.trim()) errs.neighborhood = 'Bairro obrigatorio'
      if (!form.address_number.trim()) errs.address_number = 'Numero obrigatorio'
    }
    const minOrder = parseFloat(settings.min_order || '0')
    if (minOrder > 0 && getSubtotal() < minOrder) {
      errs.min_order = `Pedido minimo: ${formatCurrency(minOrder)}`
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

      notifyNewOrder(order, items)

      // Loyalty points
      const totalQty = items.reduce((sum, i) => sum + i.quantity, 0)
      addLoyaltyItems(totalQty)

      localStorage.setItem('coxita-last-order', order.order_number.toString())
      localStorage.setItem('coxita-last-order-items', JSON.stringify(
        items.map(i => ({ id: i.id, name: i.name, price: i.price, image_url: i.image_url }))
      ))

      if (form.payment_method === 'credito' || form.payment_method === 'debito') {
        try {
          const payment = await createPaymentPreference(order, items)
          clearCart()
          window.location.href = payment.init_point
          return
        } catch (payErr) {
          console.error('Erro ao criar pagamento:', payErr)
          toast.error('Erro ao processar pagamento. Tente outro metodo.')
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
    <div className="min-h-screen bg-gradient-to-b from-bg-warm to-bg">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <img src="/logo.png" alt="" className="w-10 h-10 object-contain" />
          <div>
            <h1 className="font-display text-2xl font-extrabold text-text">Finalizar pedido</h1>
            <p className="text-text-light text-sm">Preencha os dados para enviar</p>
          </div>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center gap-2 mb-8">
          {['Dados', 'Entrega', 'Pagamento', 'Confirmar'].map((step, i) => (
            <div key={step} className="flex items-center gap-2 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold font-display ${
                i === 0 ? 'bg-primary text-white' : 'bg-stone-200 text-stone-400'
              }`}>
                {i + 1}
              </div>
              <span className="text-xs text-text-light hidden sm:block">{step}</span>
              {i < 3 && <div className="flex-1 h-0.5 bg-stone-200 rounded" />}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Dados pessoais */}
          <CheckoutSection title="Seus dados" step="1">
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
          </CheckoutSection>

          {/* Tipo de entrega */}
          <CheckoutSection title="Tipo de entrega" step="2">
            <div className="flex gap-3">
              <DeliveryOption
                active={form.delivery_type === 'entrega'}
                onChange={() => handleChange({ target: { name: 'delivery_type', value: 'entrega' } })}
                icon={<HiTruck size={22} />}
                label="Entrega"
                sublabel="Receba em casa"
                name="delivery_type"
                value="entrega"
              />
              <DeliveryOption
                active={form.delivery_type === 'retirada'}
                onChange={() => handleChange({ target: { name: 'delivery_type', value: 'retirada' } })}
                icon={<HiOfficeBuilding size={22} />}
                label="Retirada"
                sublabel="Buscar no local"
                name="delivery_type"
                value="retirada"
              />
            </div>
          </CheckoutSection>

          {/* Endereco */}
          {form.delivery_type === 'entrega' && (
            <CheckoutSection title="Endereco" step="">
              <Input label="Rua *" name="address" value={form.address} onChange={handleChange} error={errors.address} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Numero *" name="address_number" value={form.address_number} onChange={handleChange} error={errors.address_number} />
                <Input label="Complemento" name="address_complement" value={form.address_complement} onChange={handleChange} />
              </div>
              <Input label="Bairro *" name="neighborhood" value={form.neighborhood} onChange={handleChange} error={errors.neighborhood} />
              <Input label="Referencia" name="address_reference" value={form.address_reference} onChange={handleChange} placeholder="Proximo a..." />
            </CheckoutSection>
          )}

          {/* Pagamento */}
          <CheckoutSection title="Pagamento" step="3">
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'pix', label: 'Pix', icon: <HiDeviceMobile size={20} /> },
                { value: 'dinheiro', label: 'Dinheiro', icon: <HiCash size={20} /> },
                { value: 'credito', label: 'Credito', icon: <HiCreditCard size={20} /> },
                { value: 'debito', label: 'Debito', icon: <HiCreditCard size={20} /> },
              ].map(opt => (
                <label key={opt.value} className={`flex items-center gap-2.5 p-3.5 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                  form.payment_method === opt.value
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border hover:border-primary/30'
                }`}>
                  <input
                    type="radio"
                    name="payment_method"
                    value={opt.value}
                    checked={form.payment_method === opt.value}
                    onChange={handleChange}
                    className="sr-only"
                  />
                  <span className={`${form.payment_method === opt.value ? 'text-primary' : 'text-text-light'}`}>
                    {opt.icon}
                  </span>
                  <span className="font-semibold text-sm">{opt.label}</span>
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
              <div className="mt-4 p-4 bg-accent/5 rounded-xl border border-accent/20">
                <p className="text-sm font-bold text-accent">Chave Pix:</p>
                <p className="text-sm text-accent/80 font-mono mt-1 break-all">{settings.pix_key}</p>
                {settings.pix_name && (
                  <p className="text-xs text-accent/60 mt-1">Nome: {settings.pix_name}</p>
                )}
              </div>
            )}
          </CheckoutSection>

          {/* Observacoes */}
          <CheckoutSection title="Observacoes" step="">
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              rows={3}
              className="w-full px-4 py-3 border-2 border-border rounded-xl outline-none focus:border-primary resize-none transition-colors font-body text-sm"
              placeholder="Alguma observacao sobre o pedido?"
            />
          </CheckoutSection>

          {/* Resumo */}
          <CheckoutSection title="Resumo do pedido" step="4">
            <div className="space-y-2">
              {items.map(item => (
                <div key={item.id} className="flex justify-between text-sm py-1.5">
                  <span className="text-text-warm">
                    <span className="font-bold text-primary mr-1">{item.quantity}x</span>
                    {item.name}
                  </span>
                  <span className="font-semibold">{formatCurrency(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="border-t-2 border-dashed border-border mt-4 pt-4 space-y-2">
              <div className="flex justify-between text-sm text-text-light">
                <span>Subtotal</span>
                <span>{formatCurrency(getSubtotal())}</span>
              </div>
              <div className="flex justify-between text-sm text-text-light">
                <span>Taxa de entrega</span>
                <span className={deliveryFee === 0 ? 'text-accent font-semibold' : ''}>
                  {deliveryFee > 0 ? formatCurrency(deliveryFee) : 'Gratis'}
                </span>
              </div>
              <div className="flex justify-between pt-3 border-t border-border">
                <span className="font-display font-extrabold text-lg">Total</span>
                <span className="font-display font-extrabold text-2xl text-primary">{formatCurrency(getTotal())}</span>
              </div>
            </div>
          </CheckoutSection>

          {errors.min_order && (
            <p className="text-danger text-sm text-center font-semibold bg-danger/5 py-3 rounded-xl">{errors.min_order}</p>
          )}

          <Button
            type="submit"
            className="w-full pulse-glow"
            size="lg"
            variant="festive"
            disabled={submitting}
          >
            {submitting ? 'Enviando pedido...' : 'Confirmar pedido'}
          </Button>
        </form>
      </div>
    </div>
  )
}

function CheckoutSection({ title, step, children }) {
  return (
    <section className="bg-surface card-organic border border-border/60 p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-2">
        {step && (
          <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center font-display">
            {step}
          </span>
        )}
        <h2 className="font-display font-bold text-lg">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function DeliveryOption({ active, onChange, icon, label, sublabel, name, value }) {
  return (
    <label className={`flex-1 p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 text-center ${
      active
        ? 'border-primary bg-primary/5 shadow-sm'
        : 'border-border hover:border-primary/30'
    }`}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={active}
        onChange={onChange}
        className="sr-only"
      />
      <div className={`mx-auto mb-1 ${active ? 'text-primary' : 'text-text-light'}`}>
        {icon}
      </div>
      <span className="font-bold text-sm block">{label}</span>
      <span className="text-xs text-text-light">{sublabel}</span>
    </label>
  )
}
