import { useState } from 'react'
import toast from 'react-hot-toast'
import { aplicarPromoRefri } from '../../services/orders'
import { formatCurrency } from '../../utils/format'

const REFRIS = [
  { valor: 'guarana', rotulo: 'Guaraná' },
  { valor: 'pepsi', rotulo: 'Pepsi' },
  { valor: '', rotulo: 'Não sei' },
]

/**
 * Botão da promo "cento + refri 1L por R$ 33" no pedido.
 *
 * O cliente pede o cento pelo site e avisa que é da promo; aqui a loja escolhe quais centos
 * entram e qual refri vai com cada um. Funciona também em pedido já entregue.
 */
export default function PromoRefri({ pedido, aoAplicar }) {
  const centos = (pedido.order_items ?? []).filter(i => i.product_name === 'Cento de Salgados')
  const [aberto, setAberto] = useState(false)
  const [escolha, setEscolha] = useState({}) // id -> { usar, refri }
  const [salvando, setSalvando] = useState(false)

  if (!centos.length || pedido.status === 'cancelado') return null

  const da = id => escolha[id] ?? { usar: true, refri: 'guarana' }
  const mudar = (id, campo, valor) => setEscolha(e => ({ ...e, [id]: { ...da(id), [campo]: valor } }))
  const marcados = centos.filter(i => da(i.id).usar)

  const aplicar = async () => {
    if (!marcados.length) return toast.error('Marque ao menos um cento.')
    setSalvando(true)
    try {
      const atualizado = await aplicarPromoRefri(pedido.id, marcados.map(i => ({ id: i.id, refri: da(i.id).refri })))
      toast.success(`Promo aplicada. Novo total: ${formatCurrency(atualizado.total)}`)
      setAberto(false)
      aoAplicar(atualizado)
    } catch (e) {
      toast.error(`Não foi possível aplicar: ${e.message}`)
    } finally {
      setSalvando(false)
    }
  }

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)}
        className="mt-2 w-full cursor-pointer rounded-lg border-2 border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100">
        🥤 É da promo? Cento + refri 1L por R$ 33
      </button>
    )
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
      <p className="font-semibold text-amber-900">Quais centos entram na promo?</p>
      {centos.map(i => (
        <div key={i.id} className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
            <input type="checkbox" checked={da(i.id).usar} onChange={e => mudar(i.id, 'usar', e.target.checked)} className="size-4 accent-primary" />
            <span className="truncate">
              {i.quantity > 1 ? `${i.quantity}x ` : ''}Cento: {(i.order_item_flavors ?? []).map(f => f.flavor_name).join(', ') || 'sem sabor'}
            </span>
          </label>
          <select value={da(i.id).refri} onChange={e => mudar(i.id, 'refri', e.target.value)} disabled={!da(i.id).usar}
            className="rounded border border-border bg-white px-2 py-1 text-sm">
            {REFRIS.map(r => <option key={r.valor} value={r.valor}>{r.rotulo}</option>)}
          </select>
        </div>
      ))}
      <p className="text-xs text-amber-900/80">Cada cento marcado vira R$ 33,00 (já preço de Pix) e ganha 1 refri de 1L a R$ 0,00.</p>
      <div className="flex gap-2">
        <button type="button" onClick={aplicar} disabled={salvando}
          className="flex-1 cursor-pointer rounded-lg bg-primary px-3 py-2 font-semibold text-white hover:bg-primary-dark disabled:opacity-60">
          {salvando ? 'Aplicando…' : `Aplicar promo (${marcados.length})`}
        </button>
        <button type="button" onClick={() => setAberto(false)}
          className="cursor-pointer rounded-lg border border-border bg-white px-3 py-2 text-text-light hover:bg-gray-50">Cancelar</button>
      </div>
    </div>
  )
}
