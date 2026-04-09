import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { HiTruck, HiOfficeBuilding, HiCreditCard, HiCash, HiDeviceMobile, HiClock, HiLightningBolt } from 'react-icons/hi'
import { useCartStore } from '../../store/cartStore'
import { useLoyaltyStore } from '../../store/loyaltyStore'
import { createOrder, getActiveOrderByNumbers } from '../../services/orders'
import { getSettings } from '../../services/settings'
import { createPaymentPreference } from '../../services/payment'
import { notifyNewOrder } from '../../services/notifications'
import { validateCoupon, useCoupon } from '../../services/coupons'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import { formatCurrency } from '../../utils/format'
import toast from 'react-hot-toast'

const initialForm = {
  customer_name: '',
  customer_phone: '',
  delivery_type: 'entrega',
  address_cep: '',
  address: '',
  neighborhood: '',
  address_number: '',
  address_complement: '',
  address_reference: '',
  notes: '',
  payment_method: 'pix',
  change_for: '',
  order_type: 'agora',
  scheduled_date: '',
  scheduled_time: '',
}

export default function CheckoutPage() {
  const navigate = useNavigate()
  const { items, getSubtotal, deliveryFee, setDeliveryFee, getTotal, clearCart } = useCartStore()
  const addLoyaltyItems = useLoyaltyStore(s => s.addItems)
  const [form, setForm] = useState(initialForm)
  const [settings, setSettingsData] = useState({})
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)
  const [couponCode, setCouponCode] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState(null)
  const [couponLoading, setCouponLoading] = useState(false)
  const [couponError, setCouponError] = useState('')
  const [activeOrder, setActiveOrder] = useState(null)
  const [storeClosed, setStoreClosed] = useState(false)

  const getDiscount = () => {
    if (!appliedCoupon) return 0
    if (appliedCoupon.discount_type === 'percent') {
      return getSubtotal() * (appliedCoupon.discount_value / 100)
    }
    return Math.min(appliedCoupon.discount_value, getSubtotal())
  }

  const getFinalTotal = () => {
    return Math.max(0, getSubtotal() - getDiscount() + deliveryFee)
  }

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return
    setCouponLoading(true)
    setCouponError('')
    try {
      const result = await validateCoupon(couponCode)
      if (!result.valid) {
        setCouponError(result.error)
        setAppliedCoupon(null)
      } else if (result.coupon.min_order > 0 && getSubtotal() < result.coupon.min_order) {
        setCouponError(`Pedido minimo de ${formatCurrency(result.coupon.min_order)} para este cupom`)
        setAppliedCoupon(null)
      } else {
        setAppliedCoupon(result.coupon)
        setCouponError('')
        toast.success('Cupom aplicado!')
      }
    } catch {
      setCouponError('Erro ao validar cupom')
    } finally {
      setCouponLoading(false)
    }
  }

  useEffect(() => {
    if (items.length === 0) {
      navigate('/carrinho')
      return
    }
    getSettings().then(s => {
      setSettingsData(s)
      setDeliveryFee(parseFloat(s.delivery_fee || '0'))

      // Check if store is open
      if (s.opening_time && s.closing_time) {
        const now = new Date()
        const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
        if (hhmm < s.opening_time || hhmm >= s.closing_time) {
          setStoreClosed(true)
          setForm(f => ({ ...f, order_type: 'agendado' }))
        }
      }
    })

    // Check for active order
    const myOrders = JSON.parse(localStorage.getItem('coxita-my-orders') || '[]')
    if (myOrders.length > 0) {
      getActiveOrderByNumbers(myOrders).then(order => {
        if (order) setActiveOrder(order)
      }).catch(() => {})
    }

    // Auto-fill with saved customer data
    const saved = localStorage.getItem('coxita-customer-data')
    if (saved) {
      try {
        const data = JSON.parse(saved)
        setForm(f => ({
          ...f,
          customer_name: data.customer_name || '',
          customer_phone: data.customer_phone || '',
          address_cep: data.address_cep || '',
          address: data.address || '',
          neighborhood: data.neighborhood || '',
          address_number: data.address_number || '',
          address_complement: data.address_complement || '',
          address_reference: data.address_reference || '',
        }))
      } catch {}
    }
  }, [])

  const handleCepBlur = async () => {
    const cep = form.address_cep.replace(/\D/g, '')
    if (cep.length !== 8) return
    setCepLoading(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const data = await res.json()
      if (!data.erro) {
        setForm(f => ({
          ...f,
          address: data.logradouro || f.address,
          neighborhood: data.bairro || f.neighborhood,
        }))
      }
    } catch {}
    finally { setCepLoading(false) }
  }

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
    if (form.order_type === 'agendado') {
      if (!form.scheduled_date) errs.scheduled_date = 'Selecione a data'
      if (!form.scheduled_time) errs.scheduled_time = 'Selecione o horario'
      if (form.scheduled_date && form.scheduled_time) {
        const scheduled = new Date(`${form.scheduled_date}T${form.scheduled_time}`)
        if (scheduled <= new Date()) errs.scheduled_date = 'Data/hora deve ser no futuro'
      }
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
        address_cep: form.delivery_type === 'entrega' ? form.address_cep.replace(/\D/g, '') || null : null,
        address: form.delivery_type === 'entrega' ? form.address.trim() : null,
        neighborhood: form.delivery_type === 'entrega' ? form.neighborhood.trim() : null,
        address_number: form.delivery_type === 'entrega' ? form.address_number.trim() : null,
        address_complement: form.address_complement.trim() || null,
        address_reference: form.address_reference.trim() || null,
        notes: form.notes.trim() || null,
        payment_method: form.payment_method,
        change_for: form.payment_method === 'dinheiro' && form.change_for ? parseFloat(form.change_for) : null,
        scheduled_for: form.order_type === 'agendado' ? new Date(`${form.scheduled_date}T${form.scheduled_time}`).toISOString() : null,
        subtotal: getSubtotal(),
        delivery_fee: deliveryFee,
        discount: getDiscount(),
        coupon_code: appliedCoupon?.code || null,
        total: getFinalTotal(),
      }

      const order = await createOrder(orderData, items)

      notifyNewOrder(order, items)

      // Increment coupon usage
      if (appliedCoupon) {
        useCoupon(appliedCoupon.id).catch(() => {})
      }

      // Loyalty points
      const totalQty = items.reduce((sum, i) => sum + i.quantity, 0)
      addLoyaltyItems(totalQty)

      localStorage.setItem('coxita-last-order', order.order_number.toString())
      localStorage.setItem('coxita-customer-phone', form.customer_phone.trim())

      // Save order number to device history
      const myOrders = JSON.parse(localStorage.getItem('coxita-my-orders') || '[]')
      myOrders.push(order.order_number)
      localStorage.setItem('coxita-my-orders', JSON.stringify(myOrders))
      localStorage.setItem('coxita-customer-data', JSON.stringify({
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim(),
        address_cep: form.address_cep.trim(),
        address: form.address.trim(),
        neighborhood: form.neighborhood.trim(),
        address_number: form.address_number.trim(),
        address_complement: form.address_complement.trim(),
        address_reference: form.address_reference.trim(),
      }))
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

        {activeOrder && (
          <div className="bg-secondary/10 border-2 border-secondary/30 rounded-xl p-5 mb-6 text-center">
            <p className="text-lg font-display font-bold text-text mb-2">Voce ja tem um pedido em andamento!</p>
            <p className="text-sm text-text-light mb-4">Pedido #{activeOrder.order_number} esta em aberto. Aguarde a conclusao para fazer outro.</p>
            <Link
              to={`/acompanhar/${activeOrder.order_number}`}
              className="inline-block bg-primary text-white font-bold px-6 py-3 rounded-xl no-underline hover:bg-primary-dark transition-colors"
            >
              Acompanhar pedido #{activeOrder.order_number}
            </Link>
          </div>
        )}

        <form onSubmit={handleSubmit} className={`space-y-5 ${activeOrder ? 'opacity-50 pointer-events-none' : ''}`}>
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
              <div className="relative">
                <Input
                  label="CEP"
                  name="address_cep"
                  value={form.address_cep}
                  onChange={handleChange}
                  onBlur={handleCepBlur}
                  placeholder="00000-000"
                />
                {cepLoading && (
                  <span className="absolute right-3 top-9 text-xs text-primary font-semibold animate-pulse">Buscando...</span>
                )}
              </div>
              <Input label="Rua *" name="address" value={form.address} onChange={handleChange} error={errors.address} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Numero *" name="address_number" value={form.address_number} onChange={handleChange} error={errors.address_number} />
                <Input label="Complemento" name="address_complement" value={form.address_complement} onChange={handleChange} />
              </div>
              <Input label="Bairro *" name="neighborhood" value={form.neighborhood} onChange={handleChange} error={errors.neighborhood} />
              <Input label="Referencia" name="address_reference" value={form.address_reference} onChange={handleChange} placeholder="Proximo a..." />
            </CheckoutSection>
          )}

          {/* Quando receber */}
          <CheckoutSection title="Quando voce quer?" step="">
            {storeClosed && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-3">
                <p className="text-sm font-bold text-yellow-700">Estamos fechados no momento</p>
                <p className="text-xs text-yellow-600 mt-0.5">
                  Horario: {settings.opening_time} - {settings.closing_time}. Agende seu pedido!
                </p>
              </div>
            )}
            <div className="flex gap-3">
              <DeliveryOption
                active={form.order_type === 'agora' && !storeClosed}
                onChange={() => !storeClosed && handleChange({ target: { name: 'order_type', value: 'agora' } })}
                icon={<HiLightningBolt size={22} />}
                label="Agora"
                sublabel={storeClosed ? 'Indisponivel agora' : 'O mais rapido possivel'}
                name="order_type"
                value="agora"
                disabled={storeClosed}
              />
              <DeliveryOption
                active={form.order_type === 'agendado'}
                onChange={() => handleChange({ target: { name: 'order_type', value: 'agendado' } })}
                icon={<HiClock size={22} />}
                label="Agendar"
                sublabel="Escolher dia e hora"
                name="order_type"
                value="agendado"
              />
            </div>

            {form.order_type === 'agendado' && (
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-semibold text-text-warm mb-1.5 font-display">Data *</label>
                  <input
                    type="date"
                    name="scheduled_date"
                    value={form.scheduled_date}
                    onChange={handleChange}
                    min={new Date().toISOString().split('T')[0]}
                    className={`w-full px-4 py-2.5 border-2 rounded-xl outline-none transition-all duration-200 font-body text-sm ${
                      errors.scheduled_date ? 'border-danger bg-danger/5' : 'border-border focus:border-primary'
                    }`}
                  />
                  {errors.scheduled_date && <p className="text-danger text-xs mt-1.5 font-semibold">{errors.scheduled_date}</p>}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-text-warm mb-1.5 font-display">Horario *</label>
                  <input
                    type="time"
                    name="scheduled_time"
                    value={form.scheduled_time}
                    onChange={handleChange}
                    className={`w-full px-4 py-2.5 border-2 rounded-xl outline-none transition-all duration-200 font-body text-sm ${
                      errors.scheduled_time ? 'border-danger bg-danger/5' : 'border-border focus:border-primary'
                    }`}
                  />
                  {errors.scheduled_time && <p className="text-danger text-xs mt-1.5 font-semibold">{errors.scheduled_time}</p>}
                </div>
              </div>
            )}
          </CheckoutSection>

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

          {/* Cupom */}
          <CheckoutSection title="Cupom de desconto" step="">
            {appliedCoupon ? (
              <div className="flex items-center justify-between bg-accent/5 border border-accent/30 rounded-xl p-3">
                <div>
                  <span className="font-mono font-bold text-accent">{appliedCoupon.code}</span>
                  <span className="text-sm text-accent ml-2">
                    -{appliedCoupon.discount_type === 'percent' ? `${appliedCoupon.discount_value}%` : formatCurrency(appliedCoupon.discount_value)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => { setAppliedCoupon(null); setCouponCode('') }}
                  className="text-danger text-sm font-semibold cursor-pointer"
                >
                  Remover
                </button>
              </div>
            ) : (
              <div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponCode}
                    onChange={e => setCouponCode(e.target.value.toUpperCase())}
                    placeholder="Digite o codigo"
                    className="flex-1 px-4 py-2.5 border-2 border-border rounded-xl outline-none focus:border-primary font-mono text-sm uppercase"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    disabled={couponLoading || !couponCode.trim()}
                    className="px-5 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary-dark transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {couponLoading ? '...' : 'Aplicar'}
                  </button>
                </div>
                {couponError && <p className="text-danger text-xs mt-1.5 font-semibold">{couponError}</p>}
              </div>
            )}
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
              {getDiscount() > 0 && (
                <div className="flex justify-between text-sm text-accent font-semibold">
                  <span>Desconto ({appliedCoupon.code})</span>
                  <span>-{formatCurrency(getDiscount())}</span>
                </div>
              )}
              <div className="flex justify-between text-sm text-text-light">
                <span>Taxa de entrega</span>
                <span className={deliveryFee === 0 ? 'text-accent font-semibold' : ''}>
                  {deliveryFee > 0 ? formatCurrency(deliveryFee) : 'Gratis'}
                </span>
              </div>
              <div className="flex justify-between pt-3 border-t border-border">
                <span className="font-display font-extrabold text-lg">Total</span>
                <span className="font-display font-extrabold text-2xl text-primary">{formatCurrency(getFinalTotal())}</span>
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

function DeliveryOption({ active, onChange, icon, label, sublabel, name, value, disabled }) {
  return (
    <label className={`flex-1 p-4 rounded-xl border-2 transition-all duration-200 text-center ${
      disabled
        ? 'border-border bg-gray-50 opacity-50 cursor-not-allowed'
        : active
        ? 'border-primary bg-primary/5 shadow-sm cursor-pointer'
        : 'border-border hover:border-primary/30 cursor-pointer'
    }`}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={active}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
      />
      <div className={`mx-auto mb-1 ${active && !disabled ? 'text-primary' : 'text-text-light'}`}>
        {icon}
      </div>
      <span className="font-bold text-sm block">{label}</span>
      <span className="text-xs text-text-light">{sublabel}</span>
    </label>
  )
}
