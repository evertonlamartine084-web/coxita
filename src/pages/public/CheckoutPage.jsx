import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { HiTruck, HiOfficeBuilding, HiCreditCard, HiCash, HiDeviceMobile, HiClock, HiLightningBolt } from 'react-icons/hi'
import { FaWhatsapp } from 'react-icons/fa'
import { cepNaZonaNorte } from '../../content/entrega'
import { useCartStore } from '../../store/cartStore'
import { useLoyaltyStore } from '../../store/loyaltyStore'
import { createOrder, getPedidosPorTokens } from '../../services/orders'
import { getSettings } from '../../services/settings'
import { cotarEntrega } from '../../services/entrega'
import { getProducts } from '../../services/products'
import { getPrecoPorSabor } from '../../services/precoPorSabor'
import { pagarComCartao, gerarPix } from '../../services/cielo'
import { guardarToken, linkDoPedido, lerTokens } from '../../utils/pedidosLocais'
import { mascararCpf, cpfValido } from '../../utils/cpf'
import CardForm from '../../components/checkout/CardForm'
import PixPayment from '../../components/checkout/PixPayment'
import Modal from '../../components/ui/Modal'
import { notifyNewOrder } from '../../services/notifications'
import { validateCoupon, useCoupon as registerCouponUse } from '../../services/coupons'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import { formatCurrency } from '../../utils/format'
import { calcularDescontoAvista, ehAVista, rotuloDoDesconto } from '../../utils/descontoAvista'
import { dataLocal, entregaAbertaEm, erroDeAgendamento, horarioDeEntrega } from '../../utils/funcionamento'
import toast from 'react-hot-toast'
import Seo from '../../components/ui/Seo'

const formatarKm = (km) => `${Number(km).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`

const initialForm = {
  customer_name: '',
  customer_phone: '',
  customer_cpf: '',
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
  const { items, getSubtotal, deliveryFee, setDeliveryFee, clearCart, sincronizarComCatalogo } = useCartStore()
  const addLoyaltyItems = useLoyaltyStore(s => s.addItems)
  const [form, setForm] = useState(initialForm)
  const [settings, setSettingsData] = useState({})
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  // pagamento online (Cielo): o pedido já existe no banco e a cobrança acontece sem sair daqui
  const [pagamento, setPagamento] = useState(null) // { modo: 'cartao'|'pix', order, pix? }
  const [processandoPag, setProcessandoPag] = useState(false)
  // carrinho vazio manda de volta pro /carrinho (ver efeito abaixo). Ao concluir um pagamento
  // ele fica vazio de propósito, e sem esta trava o cliente era jogado no carrinho vazio em vez
  // da tela de "pedido confirmado".
  const finalizando = useRef(false)
  const [cepLoading, setCepLoading] = useState(false)
  // taxa de entrega por km, calculada no servidor a partir do CEP (ver services/entrega.js)
  // status: 'vazio' (sem CEP completo) | 'calculando' | 'ok' | 'fora' | 'erro'
  const [cotacao, setCotacao] = useState({ status: 'vazio' })
  const [recotar, setRecotar] = useState(0) // sobe para forçar um novo cálculo com o mesmo CEP
  const [couponCode, setCouponCode] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState(null)
  const [couponLoading, setCouponLoading] = useState(false)
  const [couponError, setCouponError] = useState('')
  const [activeOrder, setActiveOrder] = useState(null)
  const [entregaForaDoHorario, setEntregaForaDoHorario] = useState(false)
  // Só a entrega tem horário; quem retira pode pedir para agora a qualquer hora
  const entregaFechada = form.delivery_type === 'entrega' && entregaForaDoHorario

  const getDescontoCupom = () => {
    if (!appliedCoupon) return 0
    if (appliedCoupon.discount_type === 'percent') {
      return getSubtotal() * (appliedCoupon.discount_value / 100)
    }
    return Math.min(appliedCoupon.discount_value, getSubtotal())
  }

  // Pix e dinheiro nao pagam maquininha, e o cliente paga o preco a vista do
  // produto (ou, sem ele, o percentual). O teto e o subtotal ja sem o cupom:
  // os dois descontos somados nao podem passar do proprio subtotal.
  const getDescontoAvista = () =>
    calcularDescontoAvista(items, form.payment_method, settings,
      getSubtotal() - getDescontoCupom())

  const getDiscount = () => getDescontoCupom() + getDescontoAvista()

  const rotuloAVista = rotuloDoDesconto(settings, items)

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
        setCouponError(`Pedido mínimo de ${formatCurrency(result.coupon.min_order)} para este cupom`)
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
    if (items.length === 0 && !finalizando.current) {
      navigate('/carrinho')
      return
    }
    // Ultima parada antes de virar pedido: o preco da linha volta a ser o do
    // banco. Sem isto, um carrinho aberto antes de a cozinha mexer na tabela
    // fecharia pedido pelo valor antigo.
    Promise.all([getProducts(), getPrecoPorSabor()])
      .then(([produtos, precos]) => sincronizarComCatalogo(produtos, precos))
      .catch(() => {})

    getSettings().then(s => {
      setSettingsData(s)

      setEntregaForaDoHorario(!entregaAbertaEm(new Date(), s))
    })

    // Pedido ainda em andamento deste aparelho, buscado pelos códigos guardados localmente
    const tokens = Object.values(lerTokens())
    if (tokens.length > 0) {
      getPedidosPorTokens(tokens).then(pedidos => {
        const emAberto = pedidos.find(o => !['entregue', 'cancelado'].includes(o.status))
        if (emAberto) setActiveOrder(emAberto)
      }).catch(error => console.warn('Não foi possível verificar pedidos ativos:', error))
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
      } catch (error) {
        console.warn('Dados salvos do cliente estão inválidos:', error)
      }
    }
  }, [items.length, navigate, setDeliveryFee, sincronizarComCatalogo])

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
    } catch (error) {
      console.warn('Não foi possível consultar o CEP:', error)
    }
    finally { setCepLoading(false) }
  }

  // Recalcula a entrega quando o CEP fica completo (inclusive o que veio preenchido do último
  // pedido) e quando o número muda: com o Google no servidor a distância é pela casa.
  const cepDigitos = form.address_cep.replace(/\D/g, '')
  const numeroEndereco = form.address_number.trim()
  useEffect(() => {
    if (form.delivery_type !== 'entrega' || cepDigitos.length !== 8) {
      setCotacao({ status: 'vazio' })
      return
    }
    // Fora da Zona Norte nem calcula: a entrega é combinada pelo WhatsApp
    if (!cepNaZonaNorte(cepDigitos)) {
      setCotacao({ status: 'fora-zona' })
      return
    }
    let cancelado = false
    setCotacao({ status: 'calculando' })
    const t = setTimeout(() => {
      cotarEntrega({ cep: cepDigitos, numero: numeroEndereco, rua: form.address, bairro: form.neighborhood })
        .then(c => { if (!cancelado) setCotacao({ status: c.dentro_area ? 'ok' : 'fora', ...c }) })
        .catch(e => { if (!cancelado) setCotacao({ status: 'erro', motivo: e.message }) })
    }, 700)
    return () => { cancelado = true; clearTimeout(t) }
    // rua e bairro vão junto mas não disparam: o ViaCEP preenche os dois logo depois do CEP
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.delivery_type, cepDigitos, numeroEndereco, recotar])

  // a taxa do resumo é sempre a da cotação; sem cotação válida, zero (e o envio fica bloqueado)
  useEffect(() => {
    setDeliveryFee(form.delivery_type === 'entrega' && cotacao.status === 'ok' ? Number(cotacao.taxa) : 0)
  }, [form.delivery_type, cotacao, setDeliveryFee])

  // Fora do horário de entrega, entrega só agendada
  useEffect(() => {
    if (entregaFechada) setForm(f => (f.order_type === 'agora' ? { ...f, order_type: 'agendado' } : f))
  }, [entregaFechada])

  /** Pedido de entrega fora da Zona Norte: vai pronto para o WhatsApp, onde a loja passa a taxa. */
  const linkPedidoWhatsApp = () => {
    const numero = (settings.whatsapp || '(84) 99616-9478').replace(/\D/g, '')
    const endereco = [form.address, form.address_number, form.neighborhood].map(s => s.trim()).filter(Boolean).join(', ')
    const texto = [
      'Olá! Quero fazer um pedido com entrega fora da Zona Norte:',
      '',
      ...items.map(i => `${i.quantity}x ${i.name}${i.flavors?.length ? ` (${i.flavors.map(s => `${s.quantity} ${s.name}`).join(', ')})` : ''}`),
      `Subtotal: ${formatCurrency(getSubtotal())}`,
      '',
      `CEP: ${form.address_cep}${endereco ? ` — ${endereco}` : ''}`,
      'Qual fica a taxa de entrega?',
    ].join('\n')
    return `https://wa.me/55${numero}?text=${encodeURIComponent(texto)}`
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
    setErrors(e => ({ ...e, [name]: '' }))
  }

  const validate = () => {
    const errs = {}
    if (!form.customer_name.trim()) errs.customer_name = 'Nome obrigatório'
    if (!form.customer_phone.trim()) errs.customer_phone = 'Telefone obrigatório'
    // vazio é válido (nota sem identificação); preenchido tem que ser um CPF de verdade, senão
    // o erro só apareceria na emissão da nota, com o pedido já entregue
    if (form.customer_cpf.trim() && !cpfValido(form.customer_cpf)) {
      errs.customer_cpf = 'CPF inválido. Deixe em branco se não quiser na nota.'
    }
    if (form.delivery_type === 'entrega') {
      if (form.address_cep.replace(/\D/g, '').length !== 8) errs.address_cep = 'CEP obrigatório para calcular a entrega'
      else if (cotacao.status === 'calculando') errs.address_cep = 'Aguarde o cálculo da entrega'
      else if (cotacao.status === 'fora-zona') errs.address_cep = 'Fora da Zona Norte, a entrega é combinada pelo WhatsApp.'
      else if (cotacao.status === 'fora') errs.address_cep = `Entregamos até ${cotacao.max_km} km. Escolha a retirada.`
      else if (cotacao.status !== 'ok') errs.address_cep = 'Não conseguimos calcular a entrega para este CEP'
      if (!form.address.trim()) errs.address = 'Endereço obrigatório'
      if (!form.neighborhood.trim()) errs.neighborhood = 'Bairro obrigatório'
      if (!form.address_number.trim()) errs.address_number = 'Número obrigatório'
    }
    if (form.order_type === 'agendado') {
      if (!form.scheduled_date) errs.scheduled_date = 'Selecione a data'
      if (!form.scheduled_time) errs.scheduled_time = 'Selecione o horário'
      if (form.scheduled_date && form.scheduled_time) {
        const scheduled = new Date(`${form.scheduled_date}T${form.scheduled_time}`)
        if (scheduled <= new Date()) errs.scheduled_date = 'Data/hora deve ser no futuro'
        else if (form.delivery_type === 'entrega') {
          const foraDoHorario = erroDeAgendamento(form.scheduled_date, form.scheduled_time, settings)
          if (foraDoHorario) errs.scheduled_time = foraDoHorario
        }
      }
    }
    const minOrder = parseFloat(settings.min_order || '0')
    if (minOrder > 0 && getSubtotal() < minOrder) {
      errs.min_order = `Pedido mínimo: ${formatCurrency(minOrder)}`
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const concluir = (order) => {
    finalizando.current = true
    clearCart()
    navigate(`/pedido-confirmado/${order.order_number}`)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setSubmitting(true)
    try {
      const orderData = {
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim(),
        // opcional: vazio significa nota sem identificação do consumidor
        customer_cpf: form.customer_cpf.replace(/\D/g, '') || null,
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
        // o banco confere a taxa por esta cotação (ver supabase/entrega-por-km.sql)
        cotacao_entrega: form.delivery_type === 'entrega' ? cotacao.id : null,
        discount: getDiscount(),
        discount_avista: getDescontoAvista(),
        coupon_code: appliedCoupon?.code || null,
        total: getFinalTotal(),
      }

      const order = await createOrder(orderData, items)

      notifyNewOrder(order, items)

      // Increment coupon usage
      if (appliedCoupon) {
        registerCouponUse(appliedCoupon.id).catch(error => console.warn('Não foi possível atualizar o uso do cupom:', error))
      }

      // Loyalty points
      const totalQty = items.reduce((sum, i) => sum + i.quantity, 0)
      addLoyaltyItems(totalQty)

      // o código é o que abre o pedido depois; sem ele o cliente teria que provar quem é
      guardarToken(order.order_number, order.public_token)
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
        items.map(i => ({
          id: i.id,
          name: i.name,
          price: i.price,
          image_url: i.image_url,
          pack_size: i.pack_size,
          flavors: i.flavors,
        }))
      ))

      // Pagamento online: abre a cobrança AQUI, sem redirect. O carrinho só é limpo quando o
      // pagamento fecha — se o cliente desistir no meio, ele não perde o que montou.
      if (form.payment_method === 'cartao') {
        setPagamento({ modo: 'cartao', order })
        return
      }

      if (form.payment_method === 'pix_online') {
        try {
          const pix = await gerarPix(order.id)
          setPagamento({ modo: 'pix', order, pix })
        } catch (err) {
          console.error('Erro ao gerar Pix:', err)
          toast.error('Não foi possível gerar o Pix. Escolha outra forma de pagamento.')
        }
        return
      }

      concluir(order)
    } catch (err) {
      console.error(err)
      const msg = String(err?.message ?? '')
      if (msg.includes('entrega-')) {
        // cotação vencida, fora da área ou CEP trocado depois do cálculo: recalcula e pede de novo
        setRecotar(n => n + 1)
        toast.error('A taxa de entrega foi atualizada. Confira o valor e envie de novo.')
      } else {
        toast.error('Erro ao enviar pedido. Tente novamente.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const aoPagarCartao = async (cartao, parcelas) => {
    setProcessandoPag(true)
    try {
      const r = await pagarComCartao(pagamento.order.id, cartao, parcelas)
      if (r.ok) {
        toast.success('Pagamento aprovado!')
        concluir(pagamento.order)
      } else {
        // a recusa é do banco emissor, não um erro nosso: o pedido continua de pé e a pessoa
        // pode tentar outro cartão sem refazer nada
        toast.error(r.mensagem || 'Pagamento não autorizado. Tente outro cartão.')
      }
    } catch (err) {
      console.error('Erro no pagamento:', err)
      toast.error('Não foi possível processar o pagamento. Tente novamente.')
    } finally {
      setProcessandoPag(false)
    }
  }

  const aoPixConfirmado = () => {
    toast.success('Pagamento confirmado!')
    concluir(pagamento.order)
  }

  return (
    <>
        <Seo titulo="Finalizar pedido" caminho="/checkout" noindex />
      <div className="min-h-screen bg-cream dots-paper">
        <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <img width={512} height={512} src="/logo.png" alt="" className="w-14 h-14 object-contain rounded-full border-2 border-brown bg-cream" />
            <div>
              <p className="font-display text-xs font-extrabold uppercase tracking-[0.12em] text-festa">Última etapa</p>
              <h1 className="font-display text-3xl md:text-4xl font-black uppercase text-brown leading-none">Finalizar pedido</h1>
              <p className="text-text-light text-sm mt-1">Confira os dados antes de mandar para a cozinha.</p>
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
              <p className="text-lg font-display font-bold text-text mb-2">Você já tem um pedido em andamento!</p>
              <p className="text-sm text-text-light mb-4">O pedido #{activeOrder.codigo_cliente ?? activeOrder.order_number} está em aberto. Aguarde a conclusão para fazer outro.</p>
              <Link
                to={linkDoPedido(activeOrder.order_number)}
                className="inline-block bg-primary text-white font-bold px-6 py-3 rounded-xl no-underline hover:bg-primary-dark transition-colors"
              >
                Acompanhar pedido #{activeOrder.codigo_cliente ?? activeOrder.order_number}
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
              {/* Opcional de propósito: cada campo obrigatório a mais derruba conversão, e quem
                  não informar recebe nota como consumidor não identificado. */}
              <Input
                label="CPF na nota (opcional)"
                name="customer_cpf"
                value={form.customer_cpf}
                onChange={(e) =>
                  setForm(f => ({ ...f, customer_cpf: mascararCpf(e.target.value) }))
                }
                error={errors.customer_cpf}
                placeholder="000.000.000-00"
                inputMode="numeric"
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

            {/* Endereço */}
            {form.delivery_type === 'entrega' && (
              <CheckoutSection title="Endereço" step="">
                <div className="relative">
                  <Input
                    label="CEP"
                    name="address_cep"
                    value={form.address_cep}
                    onChange={handleChange}
                    onBlur={handleCepBlur}
                    placeholder="00000-000"
                    error={errors.address_cep}
                  />
                  {cepLoading && (
                    <span className="absolute right-3 top-9 text-xs text-primary font-semibold animate-pulse">Buscando...</span>
                  )}
                </div>
                <AvisoEntrega
                  cotacao={cotacao}
                  aoRetirar={() => handleChange({ target: { name: 'delivery_type', value: 'retirada' } })}
                  linkWhatsApp={linkPedidoWhatsApp()}
                />
                <Input label="Rua *" name="address" value={form.address} onChange={handleChange} error={errors.address} />
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Número *" name="address_number" value={form.address_number} onChange={handleChange} error={errors.address_number} />
                  <Input label="Complemento" name="address_complement" value={form.address_complement} onChange={handleChange} />
                </div>
                <Input label="Bairro *" name="neighborhood" value={form.neighborhood} onChange={handleChange} error={errors.neighborhood} />
                <Input label="Referência" name="address_reference" value={form.address_reference} onChange={handleChange} placeholder="Próximo a..." />
              </CheckoutSection>
            )}

            {/* Quando receber */}
            <CheckoutSection title="Quando você quer?" step="">
              {entregaFechada && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-3">
                  <p className="text-sm font-bold text-yellow-700">A entrega está fora do horário agora</p>
                  <p className="text-xs text-yellow-600 mt-0.5">
                    A loja segue aberta. A entrega funciona de segunda a sábado, das {horarioDeEntrega(settings).abre} às {horarioDeEntrega(settings).fecha}:
                    agende a entrega ou retire o pedido na loja agora.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleChange({ target: { name: 'delivery_type', value: 'retirada' } })}
                    className="mt-2 text-xs font-bold text-yellow-800 underline"
                  >
                    Quero retirar na loja
                  </button>
                </div>
              )}
              <div className="flex gap-3">
                <DeliveryOption
                  active={form.order_type === 'agora' && !entregaFechada}
                  onChange={() => !entregaFechada && handleChange({ target: { name: 'order_type', value: 'agora' } })}
                  icon={<HiLightningBolt size={22} />}
                  label="Agora"
                  sublabel={entregaFechada ? 'Entrega só no horário' : 'O mais rápido possível'}
                  name="order_type"
                  value="agora"
                  disabled={entregaFechada}
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
                      min={dataLocal()}
                      className={`w-full px-4 py-2.5 border-2 rounded-xl outline-none transition-all duration-200 font-body text-sm ${
                        errors.scheduled_date ? 'border-danger bg-danger/5' : 'border-border focus:border-primary'
                      }`}
                    />
                    {errors.scheduled_date && <p className="text-danger text-xs mt-1.5 font-semibold">{errors.scheduled_date}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-text-warm mb-1.5 font-display">Horário *</label>
                    <input
                      type="time"
                      name="scheduled_time"
                      value={form.scheduled_time}
                      onChange={handleChange}
                      min={form.delivery_type === 'entrega' ? horarioDeEntrega(settings).abre : undefined}
                      max={form.delivery_type === 'entrega' ? horarioDeEntrega(settings).fecha : undefined}
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
                  { value: 'pix_online', label: 'Pix agora', icon: <HiDeviceMobile size={20} /> },
                  { value: 'cartao', label: 'Cartão agora', icon: <HiCreditCard size={20} /> },
                  { value: 'dinheiro', label: 'Dinheiro na entrega', icon: <HiCash size={20} /> },
                  { value: 'credito', label: 'Cartão na entrega', icon: <HiCreditCard size={20} /> },
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
                    <span className="font-semibold text-sm flex-1">{opt.label}</span>
                    {/* O selo vive na propria opcao: e no momento de escolher que
                        o desconto muda a decisao, nao depois, no resumo. */}
                    {ehAVista(opt.value) && rotuloAVista && (
                      <span className="text-[11px] font-extrabold font-display text-accent whitespace-nowrap">
                        -{rotuloAVista}
                      </span>
                    )}
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

            {/* Observações */}
            <CheckoutSection title="Observações" step="">
              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                rows={3}
                className="w-full px-4 py-3 border-2 border-border rounded-xl outline-none focus:border-primary resize-none transition-colors font-body text-sm"
                placeholder="Alguma observação sobre o pedido?"
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
                      placeholder="Digite o código"
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
                  <div key={item.lineId} className="flex justify-between text-sm py-1.5">
                    <span className="text-text-warm">
                      <span className="font-bold text-primary mr-1">{item.quantity}x</span>
                      {item.name}
                      {item.flavors?.length > 0 && (
                        <span className="block text-text-light text-xs mt-0.5">
                          {item.flavors.map(f => `${f.quantity * item.quantity}x ${f.name}`).join(', ')}
                        </span>
                      )}
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
                {getDescontoCupom() > 0 && (
                  <div className="flex justify-between text-sm text-accent font-semibold">
                    <span>Desconto ({appliedCoupon.code})</span>
                    <span>-{formatCurrency(getDescontoCupom())}</span>
                  </div>
                )}
                {getDescontoAvista() > 0 && (
                  <div className="flex justify-between text-sm text-accent font-semibold">
                    <span>Desconto à vista{rotuloAVista ? ` (${rotuloAVista})` : ''}</span>
                    <span>-{formatCurrency(getDescontoAvista())}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm text-text-light">
                  <span>
                    Taxa de entrega
                    {form.delivery_type === 'entrega' && cotacao.status === 'ok' && ` (${formatarKm(cotacao.km)})`}
                  </span>
                  <span className={form.delivery_type === 'retirada' ? 'text-accent font-semibold' : ''}>
                    {form.delivery_type === 'retirada'
                      ? 'Grátis'
                      : cotacao.status === 'ok' ? formatCurrency(deliveryFee) : 'Informe o CEP'}
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
              className="w-full"
              size="lg"
              variant="festive"
              disabled={submitting}
            >
              {submitting ? 'Enviando pedido...' : 'Confirmar pedido'}
            </Button>
          </form>
        </div>

        {pagamento && (
          <Modal
            isOpen
            onClose={() => {
              // fechar não cancela o pedido: ele fica gravado como aguardando pagamento, e o
              // cliente consegue retomar pelo "Acompanhar pedido"
              setPagamento(null)
              toast('Pedido guardado. Você pode pagar depois em "Acompanhar pedido".')
            }}
            title={pagamento.modo === 'pix' ? 'Pagamento via Pix' : 'Pagamento com cartão'}
          >
            {pagamento.modo === 'cartao' ? (
              <CardForm
                total={Number(pagamento.order.total)}
                onPagar={aoPagarCartao}
                processando={processandoPag}
              />
            ) : (
              <PixPayment
                orderId={pagamento.order.id}
                qrBase64={pagamento.pix?.qr_base64}
                qrTexto={pagamento.pix?.qr_texto}
                total={Number(pagamento.order.total)}
                onPago={aoPixConfirmado}
              />
            )}
          </Modal>
        )}
      </div>
    </>
  )
}

function CheckoutSection({ title, step, children }) {
  return (
    <section className="bg-surface border-2 border-brown/20 p-5 md:p-6 shadow-[4px_4px_0_rgba(93,43,4,0.12)] space-y-4">
      <div className="flex items-center gap-2">
        {step && (
          <span className="w-7 h-7 bg-secondary text-brown border border-brown text-xs font-extrabold flex items-center justify-center font-display">
            {step}
          </span>
        )}
        <h2 className="font-display font-extrabold uppercase tracking-wide text-lg text-brown">{title}</h2>
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

/** Resultado do cálculo da entrega logo abaixo do CEP. */
function AvisoEntrega({ cotacao, aoRetirar, linkWhatsApp }) {
  if (cotacao.status === 'vazio') {
    return <p className="text-xs text-text-light -mt-2">A taxa de entrega é de R$ 2,00 por km, calculada pelo endereço.</p>
  }
  if (cotacao.status === 'calculando') {
    return <p className="text-sm text-text-light -mt-2 animate-pulse">Calculando a entrega…</p>
  }
  if (cotacao.status === 'ok') {
    return (
      <p className="text-sm text-text -mt-2">
        Entrega: <strong>{formatarKm(cotacao.km)}</strong> da loja, <strong>{formatCurrency(cotacao.taxa)}</strong>
      </p>
    )
  }
  if (cotacao.status === 'fora-zona') {
    return (
      <div className="-mt-2 rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
        <p className="font-semibold">Entregamos aí também!</p>
        <p className="mt-0.5">
          Pelo site a entrega é só na Zona Norte. Para a Zona Sul, Parnamirim e outras regiões,
          faça o pedido pelo WhatsApp que a gente passa a taxa.
        </p>
        <a
          href={linkWhatsApp} target="_blank" rel="noopener noreferrer"
          className="mt-2.5 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 font-display font-bold text-white no-underline hover:brightness-95"
        >
          <FaWhatsapp size={20} aria-hidden="true" /> Pedir pelo WhatsApp
        </a>
        <button type="button" onClick={aoRetirar} className="mt-2 font-semibold text-primary underline cursor-pointer">
          Prefiro retirar na loja
        </button>
      </div>
    )
  }
  return (
    <div className="-mt-2 rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
      <p>
        {cotacao.status === 'fora'
          ? `Este endereço fica a ${formatarKm(cotacao.km)} da loja. Entregamos até ${cotacao.max_km} km.`
          : cotacao.motivo === 'cep-nao-encontrado'
            ? 'Não encontramos este CEP. Confira os números.'
            : 'Não conseguimos calcular a entrega agora. Tente de novo em instantes.'}
      </p>
      <button type="button" onClick={aoRetirar} className="mt-1 font-semibold text-primary underline cursor-pointer">
        Prefiro retirar na loja
      </button>
    </div>
  )
}
