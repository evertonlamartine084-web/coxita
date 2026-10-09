import { useState } from 'react'
import toast from 'react-hot-toast'
import { registrarSinal } from '../../services/orders'
import { formatCurrency, faltaReceber } from '../../utils/format'

const metade = (total) => Math.round(Number(total) * 50) / 100

/**
 * Sinal da encomenda: o agendado paga 50% antes e o resto na entrega. Fica no detalhe do pedido
 * enquanto ele não está pago; o "A receber" do Dashboard mostra o que falta.
 */
export default function SinalDoPedido({ pedido, aoMudar }) {
  const sinal = Number(pedido.sinal_valor || 0)
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(() => String(sinal || metade(pedido.total)).replace('.', ','))
  const [salvando, setSalvando] = useState(false)

  if (pedido.status === 'cancelado' || ['pago', 'estornado'].includes(pedido.payment_status)) return null

  const salvar = async (novo) => {
    if (!Number.isFinite(novo) || novo < 0 || novo > Number(pedido.total)) {
      return toast.error(`O sinal tem que ficar entre R$ 0 e ${formatCurrency(pedido.total)}.`)
    }
    setSalvando(true)
    try {
      const atualizado = await registrarSinal(pedido.id, novo)
      toast.success(novo > 0 ? `Sinal de ${formatCurrency(novo)} registrado.` : 'Sinal removido.')
      setEditando(false)
      aoMudar(atualizado)
    } catch (e) {
      toast.error(e.message || 'Não foi possível registrar o sinal.')
    } finally {
      setSalvando(false)
    }
  }

  if (sinal > 0 && !editando) {
    return (
      <div className="mt-2 rounded-lg bg-amber-50 p-2.5 text-sm ring-1 ring-amber-200">
        <p>
          <strong>Sinal recebido:</strong> {formatCurrency(sinal)}
          {pedido.sinal_em && <span className="text-text-light"> em {new Date(pedido.sinal_em).toLocaleDateString('pt-BR')}</span>}
        </p>
        <p><strong>Falta cobrar na entrega:</strong> {formatCurrency(faltaReceber(pedido))}</p>
        <button type="button" onClick={() => setEditando(true)} className="mt-1 cursor-pointer text-xs font-semibold text-primary hover:underline">
          Corrigir sinal
        </button>
      </div>
    )
  }

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 text-sm">
      <label>
        <span className="mb-1 block text-xs text-text-light">Sinal recebido (R$)</span>
        <input
          value={valor}
          onChange={e => setValor(e.target.value)}
          inputMode="decimal"
          className="w-28 rounded-lg border border-gray-200 px-2 py-1.5"
        />
      </label>
      <button
        type="button"
        disabled={salvando}
        onClick={() => salvar(Number(valor.replace(/\./g, '').replace(',', '.')))}
        className="cursor-pointer rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
      >
        Registrar sinal
      </button>
      {sinal > 0 && (
        <button type="button" disabled={salvando} onClick={() => salvar(0)} className="cursor-pointer text-xs font-semibold text-red-700 hover:underline">
          Tirar sinal
        </button>
      )}
      {editando && (
        <button type="button" onClick={() => setEditando(false)} className="cursor-pointer text-xs text-text-light hover:underline">
          Cancelar
        </button>
      )}
    </div>
  )
}
