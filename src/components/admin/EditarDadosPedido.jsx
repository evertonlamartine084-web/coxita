import { useState } from 'react'
import toast from 'react-hot-toast'
import { editarDadosPedido } from '../../services/orders'
import { formatCurrency, mascararTelefone, PAYMENT_LABELS } from '../../utils/format'
import Input from '../ui/Input'

const FORMAS = ['pix', 'dinheiro', 'credito', 'debito']

/** "2026-11-06T18:00" no horário de Natal, para os campos de data e hora. */
function local(iso) {
  if (!iso) return { data: '', hora: '' }
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return { data: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, hora: `${p(d.getHours())}:${p(d.getMinutes())}` }
}

const reais = (v) => Number(String(v ?? '').replace(',', '.')) || 0

/**
 * Corrige os dados de um pedido já lançado: cliente, endereço, taxa de entrega, data marcada,
 * forma de pagamento, o dia em que foi feito e as observações. Os itens têm a tela deles
 * (EditarItensPedido) e o pagamento recebido, os botões de pago e sinal.
 *
 * Com nota emitida, forma de pagamento e taxa (que muda o total) ficam travadas: a nota já saiu
 * com elas.
 */
export default function EditarDadosPedido({ pedido, aoSalvar, aoCancelar }) {
  const comNota = pedido.bling_nfe_status === 'emitida'
  const marcado = local(pedido.scheduled_for)
  const feito = local(pedido.created_at)
  const [f, setF] = useState({
    customer_name: pedido.customer_name ?? '',
    customer_phone: pedido.customer_phone ?? '',
    delivery_type: pedido.delivery_type ?? 'retirada',
    address: pedido.address ?? '',
    address_number: pedido.address_number ?? '',
    neighborhood: pedido.neighborhood ?? '',
    address_complement: pedido.address_complement ?? '',
    address_reference: pedido.address_reference ?? '',
    address_cep: pedido.address_cep ?? '',
    taxa: String(Number(pedido.delivery_fee || 0)).replace('.', ','),
    agendado: !!pedido.scheduled_for,
    data: marcado.data,
    hora: marcado.hora,
    payment_method: pedido.payment_method ?? 'pix',
    feito_em: feito.data,
    notes: pedido.notes ?? '',
  })
  const [salvando, setSalvando] = useState(false)
  const mudar = (campo, valor) => setF(atual => ({ ...atual, [campo]: valor }))

  const taxa = f.delivery_type === 'entrega' ? reais(f.taxa) : 0
  const total = Math.max(0, Number(pedido.subtotal || 0) - Number(pedido.discount || 0) + taxa)

  const salvar = async () => {
    if (!f.customer_name.trim()) return toast.error('Diga de quem é o pedido.')
    if (f.agendado && (!f.data || !f.hora)) return toast.error('Informe a data e a hora marcadas.')
    if (!f.feito_em) return toast.error('Informe o dia em que o pedido foi feito.')
    if (Number(pedido.sinal_valor) > total) return toast.error(`O sinal (${formatCurrency(pedido.sinal_valor)}) ficaria maior que o total.`)

    // o dia muda, a hora em que foi feito fica a mesma
    const criado = new Date(pedido.created_at)
    const [a, m, d] = f.feito_em.split('-').map(Number)
    criado.setFullYear(a, m - 1, d)

    const campos = {
      customer_name: f.customer_name.trim(),
      customer_phone: f.customer_phone.trim(),
      delivery_type: f.delivery_type,
      address: f.address.trim(),
      address_number: f.address_number.trim(),
      neighborhood: f.neighborhood.trim(),
      address_complement: f.address_complement.trim() || null,
      address_reference: f.address_reference.trim() || null,
      address_cep: f.address_cep.replace(/\D/g, '') || null,
      scheduled_for: f.agendado ? new Date(`${f.data}T${f.hora}`).toISOString() : null,
      created_at: criado.toISOString(),
      notes: f.notes.trim(),
    }
    if (!comNota) {
      campos.payment_method = f.payment_method
      campos.delivery_fee = taxa
      campos.total = total
    }
    setSalvando(true)
    try {
      const atualizado = await editarDadosPedido(pedido.id, campos)
      toast.success(`Pedido #${pedido.order_number} atualizado.`)
      aoSalvar(atualizado)
    } catch (e) {
      console.error('Não foi possível salvar o pedido:', e)
      toast.error(e.message || 'Não foi possível salvar o pedido.')
    } finally {
      setSalvando(false)
    }
  }

  const caixa = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm'

  return (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <h4 className="font-semibold">Editar pedido #{pedido.order_number}</h4>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Cliente" value={f.customer_name} onChange={e => mudar('customer_name', e.target.value)} />
        <Input label="Telefone" value={f.customer_phone} onChange={e => mudar('customer_phone', mascararTelefone(e.target.value))} inputMode="tel" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Tipo</span>
          <select value={f.delivery_type} onChange={e => mudar('delivery_type', e.target.value)} className={caixa}>
            <option value="retirada">Retirada</option>
            <option value="entrega">Entrega</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Pagamento</span>
          <select value={f.payment_method} onChange={e => mudar('payment_method', e.target.value)} className={caixa} disabled={comNota}>
            {/* forma que só o site usa (pix_online) continua aparecendo se for a do pedido */}
            {[...new Set([...FORMAS, f.payment_method])].map(v => <option key={v} value={v}>{PAYMENT_LABELS[v] ?? v}</option>)}
          </select>
        </label>
      </div>

      {f.delivery_type === 'entrega' && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Endereço" value={f.address} onChange={e => mudar('address', e.target.value)} className="sm:col-span-2" />
          <Input label="Número" value={f.address_number} onChange={e => mudar('address_number', e.target.value)} />
          <Input label="Bairro" value={f.neighborhood} onChange={e => mudar('neighborhood', e.target.value)} />
          <Input label="Complemento" value={f.address_complement} onChange={e => mudar('address_complement', e.target.value)} />
          <Input label="CEP" value={f.address_cep} onChange={e => mudar('address_cep', e.target.value)} inputMode="numeric" />
          <Input label="Referência" value={f.address_reference} onChange={e => mudar('address_reference', e.target.value)} className="sm:col-span-2" />
          <Input label="Taxa de entrega (R$)" value={f.taxa} onChange={e => mudar('taxa', e.target.value)} inputMode="decimal" disabled={comNota} />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-sm font-medium sm:col-span-3">
          <input type="checkbox" checked={f.agendado} onChange={e => mudar('agendado', e.target.checked)} />
          Com dia e hora marcados
        </label>
        {f.agendado && (
          <>
            <Input label="Data marcada" type="date" value={f.data} onChange={e => mudar('data', e.target.value)} />
            <Input label="Hora" type="time" value={f.hora} onChange={e => mudar('hora', e.target.value)} />
          </>
        )}
        <Input label="Feito no dia" type="date" value={f.feito_em} onChange={e => mudar('feito_em', e.target.value)} />
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Observações</span>
        <textarea value={f.notes} onChange={e => mudar('notes', e.target.value)} rows={2} className={caixa} />
      </label>

      <p className="text-sm">
        Total: <strong>{formatCurrency(comNota ? pedido.total : total)}</strong>
        {comNota && <span className="text-xs text-text-light"> · nota emitida: pagamento e taxa não mudam</span>}
      </p>

      <div className="flex gap-2">
        <button type="button" onClick={salvar} disabled={salvando}
          className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
        <button type="button" onClick={aoCancelar}
          className="cursor-pointer rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-gray-50">
          Cancelar
        </button>
      </div>
    </div>
  )
}
