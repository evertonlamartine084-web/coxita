import { useEffect, useState } from 'react'
import { HiPlus } from 'react-icons/hi'
import toast from 'react-hot-toast'
import { useCartStore } from '../../store/cartStore'
import { getProducts } from '../../services/products'
import { evento } from '../../services/rastreio'
import { formatCurrency } from '../../utils/format'
import { saborUnicoDoPacote } from '../../utils/pacote'
import { catalogText } from '../../utils/catalogText'
import { ESTILO_TOAST } from '../../utils/toastEstilo'
import { escolherSugestoes } from '../../utils/levaJunto'

export default function LevaJunto() {
  const items = useCartStore(s => s.items)
  const addItem = useCartStore(s => s.addItem)
  const [produtos, setProdutos] = useState([])

  useEffect(() => {
    let cancelado = false
    getProducts().then(p => { if (!cancelado) setProdutos(p ?? []) }).catch(() => {})
    return () => { cancelado = true }
  }, [])

  const sugestoes = escolherSugestoes(produtos, items)
  if (sugestoes.length === 0) return null

  const adicionar = (produto) => {
    addItem(produto, saborUnicoDoPacote(produto))
    // separado do add_to_cart comum: é o que diz se a sugestão vende
    evento('leva_junto', { item_name: produto.name, value: Number(produto.price), currency: 'BRL' })
    toast.success(`${catalogText(produto.name)} adicionado!`, ESTILO_TOAST)
  }

  return (
    <section aria-labelledby="leva-junto" className="bg-surface border-2 border-brown/20 p-5 mb-5 shadow-[4px_4px_0_rgba(93,43,4,0.12)]">
      <h2 id="leva-junto" className="font-display text-xl font-black uppercase text-brown">Leva junto?</h2>
      <p className="text-text-light text-sm mb-3">Pra fechar a festa: vai na mesma entrega.</p>
      <ul className="divide-y divide-border/50">
        {sugestoes.map(p => (
          <li key={p.id} className="flex items-center gap-3 py-3 first:pt-1 last:pb-0">
            {p.image_url ? (
              <img src={p.image_url} alt="" width={56} height={56} loading="lazy" className="w-14 h-14 shrink-0 rounded-xl object-cover" />
            ) : (
              <div className="w-14 h-14 shrink-0 rounded-xl bg-bg-warm" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-display font-bold text-sm leading-tight text-text">{catalogText(p.name)}</p>
              <p className="text-primary font-bold text-sm">
                {formatCurrency(p.price)}
                {p.cash_price && Number(p.cash_price) < Number(p.price) && (
                  <span className="block text-xs font-semibold text-accent">{formatCurrency(p.cash_price)} no Pix</span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => adicionar(p)}
              aria-label={`Adicionar ${catalogText(p.name)}`}
              className="shrink-0 cursor-pointer inline-flex items-center gap-1 bg-primary text-white border-2 border-brown rounded-sm px-3 py-1.5 text-xs font-extrabold uppercase hover:bg-brown active:scale-[0.94] transition-[background-color,transform] duration-[--duration-fast] ease-[--ease-interaction]"
            >
              <HiPlus size={14} /> Adicionar
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
