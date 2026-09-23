import { useEffect, useMemo, useState } from 'react'
import { HiPlus, HiTrash } from 'react-icons/hi'
import toast from 'react-hot-toast'
import { getProducts } from '../../services/products'
import { getSettings, peekSettings } from '../../services/settings'
import { createOrder } from '../../services/orders'
import { calcularDescontoAvista, ehAVista } from '../../utils/descontoAvista'
import { formatCurrency } from '../../utils/format'
import FlavorPicker from '../product/FlavorPicker'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Button from '../ui/Button'

/**
 * Pedido lançado pela loja, no painel.
 *
 * Existe porque encomenda combinada no WhatsApp ou no balcão também é venda: sem isto ela ou
 * ficava de fora do sistema, ou entrava como um valor solto, sem itens — e aí não baixa estoque,
 * não conta no cardápio mais vendido e não vira nota.
 *
 * Passa pela MESMA função do banco que o site (`criar_pedido`), então preço, desconto à vista e
 * baixa de estoque saem iguais aos de um pedido feito pelo cliente.
 */
export default function NovoPedidoModal({ aberto, aoFechar, aoCriar }) {
  const [produtos, setProdutos] = useState([])
  const [settings, setSettings] = useState(() => peekSettings() ?? {})
  const [itens, setItens] = useState([])
  const [montando, setMontando] = useState(null) // produto que está tendo os sabores escolhidos
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    delivery_type: 'retirada',
    address: '',
    neighborhood: '',
    address_number: '',
    payment_method: 'dinheiro',
    notes: '',
    agendado: false,
    scheduled_date: '',
    scheduled_time: '',
  })

  useEffect(() => {
    if (!aberto) return
    getProducts().then(setProdutos).catch(() => setProdutos([]))
    getSettings().then(setSettings).catch(() => {})
  }, [aberto])

  const mudar = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }))

  const adicionar = (produtoId) => {
    const p = produtos.find(x => String(x.id) === String(produtoId))
    if (!p) return
    // Pacote é montado de 25 em 25: sem os sabores o pedido não diz o que a cozinha deve fritar
    if (p.pack_size) { setMontando(p); return }
    setItens(atual => [...atual, { ...p, quantity: 1, flavors: [] }])
  }

  const confirmarSabores = (sabores, preco) => {
    setItens(atual => [...atual, { ...montando, ...(preco ?? {}), quantity: 1, flavors: sabores }])
    setMontando(null)
  }

  const alterarQtd = (idx, delta) =>
    setItens(atual => atual.map((it, i) =>
      i === idx ? { ...it, quantity: Math.max(1, it.quantity + delta) } : it))

  const remover = (idx) => setItens(atual => atual.filter((_, i) => i !== idx))

  const subtotal = itens.reduce((s, i) => s + Number(i.price) * i.quantity, 0)
  const taxaEntrega = form.delivery_type === 'entrega' ? Number(settings.delivery_fee || 0) : 0
  const descontoAvista = useMemo(
    () => calcularDescontoAvista(itens, form.payment_method, settings, subtotal),
    [itens, form.payment_method, settings, subtotal],
  )
  const total = Math.max(0, subtotal - descontoAvista + taxaEntrega)

  const salvar = async () => {
    if (!form.customer_name.trim()) return toast.error('Diga de quem é o pedido.')
    if (itens.length === 0) return toast.error('Adicione ao menos um item.')
    if (form.agendado && (!form.scheduled_date || !form.scheduled_time)) {
      return toast.error('Informe a data e a hora do agendamento.')
    }

    setSalvando(true)
    try {
      const pedido = await createOrder({
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim(),
        delivery_type: form.delivery_type,
        address: form.address.trim(),
        neighborhood: form.neighborhood.trim(),
        address_number: form.address_number.trim(),
        notes: [form.notes.trim(), 'Pedido lançado no painel'].filter(Boolean).join(' · '),
        payment_method: form.payment_method,
        scheduled_for: form.agendado
          ? new Date(`${form.scheduled_date}T${form.scheduled_time}`).toISOString()
          : null,
        subtotal,
        delivery_fee: taxaEntrega,
        discount: descontoAvista,
        discount_avista: descontoAvista,
        total,
      }, itens)
      toast.success(`Pedido #${pedido.order_number} criado.`)
      setItens([])
      setForm(f => ({ ...f, customer_name: '', customer_phone: '', notes: '', agendado: false, scheduled_date: '', scheduled_time: '' }))
      aoCriar?.(pedido)
      aoFechar()
    } catch (e) {
      console.error('Não foi possível criar o pedido:', e)
      toast.error('Não foi possível criar o pedido.')
    } finally {
      setSalvando(false)
    }
  }

  if (!aberto) return null

  return (
    <>
      <Modal isOpen={aberto} onClose={aoFechar} title="Novo pedido">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Cliente *" value={form.customer_name} onChange={e => mudar('customer_name', e.target.value)} />
            <Input label="Telefone" value={form.customer_phone} onChange={e => mudar('customer_phone', e.target.value)} placeholder="(00) 00000-0000" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Tipo</span>
              <select
                value={form.delivery_type}
                onChange={e => mudar('delivery_type', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2"
              >
                <option value="retirada">Retirada</option>
                <option value="entrega">Entrega</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Pagamento</span>
              <select
                value={form.payment_method}
                onChange={e => mudar('payment_method', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2"
              >
                <option value="dinheiro">Dinheiro</option>
                <option value="pix">Pix</option>
                <option value="credito">Cartão na entrega</option>
              </select>
            </label>
          </div>

          {form.delivery_type === 'entrega' && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Input label="Endereço" value={form.address} onChange={e => mudar('address', e.target.value)} />
              <Input label="Número" value={form.address_number} onChange={e => mudar('address_number', e.target.value)} />
              <Input label="Bairro" value={form.neighborhood} onChange={e => mudar('neighborhood', e.target.value)} />
            </div>
          )}

          <div className="rounded-lg border border-gray-200 p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={form.agendado} onChange={e => mudar('agendado', e.target.checked)} />
              Encomenda para outro dia
            </label>
            {form.agendado && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input label="Data" type="date" value={form.scheduled_date} onChange={e => mudar('scheduled_date', e.target.value)} />
                <Input label="Hora" type="time" value={form.scheduled_time} onChange={e => mudar('scheduled_time', e.target.value)} />
              </div>
            )}
          </div>

          {/* Itens */}
          <div className="rounded-lg border border-gray-200 p-3">
            <div className="mb-2 flex items-center gap-2">
              <HiPlus className="size-4 text-gray-500" />
              <select
                value=""
                onChange={e => adicionar(e.target.value)}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="">Adicionar produto…</option>
                {produtos.filter(p => p.active).map(p => (
                  <option key={p.id} value={p.id}>{p.name} — {formatCurrency(p.price)}</option>
                ))}
              </select>
            </div>

            {itens.length === 0 ? (
              <p className="py-3 text-center text-sm text-gray-400">Nenhum item ainda.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {itens.map((it, idx) => (
                  <li key={`${it.id}-${idx}`} className="flex items-center gap-2 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{it.name}</p>
                      {it.flavors?.length > 0 && (
                        <p className="text-xs text-gray-500">
                          {it.flavors.map(f => `${f.quantity}x ${f.name}`).join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => alterarQtd(idx, -1)} className="size-6 cursor-pointer rounded border border-gray-200">−</button>
                      <span className="w-6 text-center">{it.quantity}</span>
                      <button type="button" onClick={() => alterarQtd(idx, 1)} className="size-6 cursor-pointer rounded border border-gray-200">+</button>
                    </div>
                    <span className="w-20 text-right font-medium">{formatCurrency(Number(it.price) * it.quantity)}</span>
                    <button type="button" onClick={() => remover(idx)} className="cursor-pointer text-red-600" aria-label="Remover item">
                      <HiTrash className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-1 rounded-lg bg-gray-50 p-3 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
            {descontoAvista > 0 && (
              <div className="flex justify-between text-green-700">
                <span>Desconto {ehAVista(form.payment_method) ? 'à vista' : ''}</span>
                <span>− {formatCurrency(descontoAvista)}</span>
              </div>
            )}
            {taxaEntrega > 0 && (
              <div className="flex justify-between"><span>Entrega</span><span>{formatCurrency(taxaEntrega)}</span></div>
            )}
            <div className="flex justify-between border-t border-gray-200 pt-1 text-base font-bold">
              <span>Total</span><span>{formatCurrency(total)}</span>
            </div>
          </div>

          <Input label="Observações" value={form.notes} onChange={e => mudar('notes', e.target.value)} placeholder="Ex: entregar na portaria" />

          <div className="flex gap-2">
            <Button onClick={salvar} disabled={salvando} className="flex-1">
              {salvando ? 'Criando…' : 'Criar pedido'}
            </Button>
            <Button variant="secondary" onClick={aoFechar} disabled={salvando}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {montando && (
        <FlavorPicker
          product={montando}
          aberto={!!montando}
          aoFechar={() => setMontando(null)}
          aoConfirmar={confirmarSabores}
        />
      )}
    </>
  )
}
