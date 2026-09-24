import { useEffect, useState } from 'react'
import { HiPlus, HiTrash, HiX } from 'react-icons/hi'
import toast from 'react-hot-toast'
import { getProducts } from '../../services/products'
import { editarItensPedido } from '../../services/orders'
import { formatCurrency } from '../../utils/format'
import { getSettings, peekSettings } from '../../services/settings'
import { calcularDescontoAvista } from '../../utils/descontoAvista'
import FlavorPicker from '../product/FlavorPicker'

/** Depois de despachado não se mexe: o que a cozinha mandou é o que vale. */
const EDITAVEL = ['pendente', 'em_preparo']

/**
 * Edição dos itens de um pedido, no painel.
 *
 * Quem edita é a loja, falando com o cliente. O cliente não tem essa tela — foi decisão do dono,
 * e evita cliente e loja mexendo no mesmo pedido ao mesmo tempo.
 */
export default function EditarItensPedido({ pedido, aoSalvar, aoCancelar }) {
  const [produtos, setProdutos] = useState([])
  const [itens, setItens] = useState(() =>
    (pedido.order_items ?? []).map(i => ({
      product_id: i.product_id,
      product_name: i.product_name,
      quantity: i.quantity,
      unit_price: Number(i.unit_price),
      // os sabores de um item que já estava no pedido ficam como estão; o seletor abre para item
      // novo e para pacote que ficou sem sabor
      flavors: (i.order_item_flavors ?? []).map(f => ({
        flavor_id: f.flavor_id, flavor_name: f.flavor_name, quantity: f.quantity,
      })),
    }))
  )
  const [salvando, setSalvando] = useState(false)
  // { produto, idx }: idx null = item novo; número = completar os sabores de um item da lista
  const [montando, setMontando] = useState(null)

  const [settings, setSettings] = useState(() => peekSettings() ?? {})

  useEffect(() => {
    getProducts().then(setProdutos).catch(() => setProdutos([]))
    getSettings().then(setSettings).catch(() => {})
  }, [])

  const totalAnterior = Number(pedido.total)
  const subtotal = itens.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  // O desconto à vista é percentual: tirar item do pedido reduz ele também.
  // A conta de verdade é a do banco (editar_itens_pedido); aqui ela é repetida
  // só para a tela não prometer um total diferente do que vai ser gravado.
  const descontoCupom = Number(pedido.discount || 0) - Number(pedido.discount_avista || 0)
  // Cada item leva o preço à vista do produto, quando ele tem um; o resto cai
  // no percentual. Mesma conta da função `editar_itens_pedido` no banco, que é
  // quem grava de verdade.
  const descontoAvista = Number(pedido.discount_avista || 0) > 0
    ? calcularDescontoAvista(
        itens.map(i => {
          const produto = produtos.find(p => p.id === i.product_id)
          return { price: i.unit_price, quantity: i.quantity, cash_price: produto?.cash_price }
        }),
        'pix',
        settings,
        Math.max(subtotal - descontoCupom, 0),
      )
    : 0
  const novoTotal = subtotal + Number(pedido.delivery_fee || 0) - descontoCupom - descontoAvista
  const diferenca = novoTotal - totalAnterior
  const jaPago = pedido.payment_status === 'pago'

  const alterarQtd = (idx, delta) => {
    setItens(atual => atual.map((it, i) =>
      i === idx ? { ...it, quantity: Math.max(1, it.quantity + delta) } : it
    ))
  }

  const remover = (idx) => setItens(atual => atual.filter((_, i) => i !== idx))

  const produtoDoItem = (item) => produtos.find(p => p.id === item.product_id)
  // Pacote sem sabor não diz à cozinha o que fritar, nem baixa o estoque
  const faltaSabor = (item) => Boolean(produtoDoItem(item)?.pack_size) && !item.flavors?.length

  const adicionar = (produtoId) => {
    const p = produtos.find(x => String(x.id) === String(produtoId))
    if (!p) return
    if (p.pack_size) { setMontando({ produto: p, idx: null }); return }
    setItens(atual => [...atual, {
      product_id: p.id, product_name: p.name, quantity: 1, unit_price: Number(p.price), flavors: [],
    }])
  }

  const confirmarSabores = (sabores, preco) => {
    const { produto, idx } = montando
    const flavors = sabores.map(sb => ({ flavor_id: sb.id, flavor_name: sb.name, quantity: sb.quantity }))
    // nos pastéis cada recheio tem preço: o seletor devolve o preço do pacote montado
    const unit_price = Number(preco?.price ?? produto.price)
    setItens(atual => idx === null
      ? [...atual, { product_id: produto.id, product_name: produto.name, quantity: 1, unit_price, flavors }]
      : atual.map((it, i) => (i === idx ? { ...it, unit_price, flavors } : it)))
    setMontando(null)
  }

  const salvar = async () => {
    if (!itens.length) {
      toast.error('O pedido precisa ter pelo menos um item. Para zerar, cancele o pedido.')
      return
    }
    if (itens.some(faltaSabor)) {
      toast.error('Escolha os sabores de todos os pacotes antes de salvar.')
      return
    }
    setSalvando(true)
    try {
      const atualizado = await editarItensPedido(pedido.id, itens)
      toast.success('Pedido atualizado.')
      aoSalvar(atualizado, diferenca)
    } catch (err) {
      toast.error(err.message || 'Não foi possível editar o pedido.')
    } finally {
      setSalvando(false)
    }
  }

  if (!EDITAVEL.includes(pedido.status)) {
    return (
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
        Este pedido já saiu para entrega e não pode mais ser editado. Se o cliente quiser mais
        alguma coisa, o caminho é um novo pedido.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {itens.map((item, idx) => (
          <div key={`${item.product_id}-${idx}`} className="flex items-center gap-2 rounded-lg border border-gray-200 p-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.product_name}</p>
              <p className="text-xs text-gray-500">{formatCurrency(item.unit_price)} cada</p>
              {item.flavors?.length > 0 && (
                <p className="text-xs text-gray-500">
                  {item.flavors.map(f => `${f.quantity}x ${f.flavor_name}`).join(', ')}
                </p>
              )}
              {faltaSabor(item) && (
                <button type="button" onClick={() => setMontando({ produto: produtoDoItem(item), idx })}
                  className="mt-0.5 cursor-pointer text-xs font-semibold text-red-600 underline">
                  Escolher sabores
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => alterarQtd(idx, -1)}
                className="size-7 cursor-pointer rounded border border-gray-300 text-sm hover:bg-gray-50">−</button>
              <span className="w-7 text-center text-sm font-semibold tabular-nums">{item.quantity}</span>
              <button type="button" onClick={() => alterarQtd(idx, 1)}
                className="size-7 cursor-pointer rounded border border-gray-300 text-sm hover:bg-gray-50">+</button>
            </div>
            <span className="w-20 text-right text-sm font-semibold tabular-nums">
              {formatCurrency(item.quantity * item.unit_price)}
            </span>
            <button type="button" onClick={() => remover(idx)} aria-label="Remover item"
              className="cursor-pointer p-1 text-gray-400 hover:text-red-600">
              <HiTrash className="size-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <HiPlus className="size-4 shrink-0 text-gray-400" />
        <select
          defaultValue=""
          onChange={(e) => { adicionar(e.target.value); e.target.value = '' }}
          className="flex-1 cursor-pointer rounded-lg border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-primary"
        >
          <option value="" disabled>Adicionar item…</option>
          {produtos.map(p => (
            <option key={p.id} value={p.id}>{p.name} — {formatCurrency(p.price)}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1 rounded-lg bg-gray-50 p-3 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
        {/* sem estas linhas, subtotal menos total parece erro: o desconto está lá, só não aparecia */}
        {descontoCupom > 0 && (
          <div className="flex justify-between text-green-700">
            <span>Desconto{pedido.coupon_code ? ` · cupom ${pedido.coupon_code}` : ''}</span>
            <span>-{formatCurrency(descontoCupom)}</span>
          </div>
        )}
        {descontoAvista > 0 && (
          <div className="flex justify-between text-green-700">
            <span>Desconto Pix/dinheiro</span><span>-{formatCurrency(descontoAvista)}</span>
          </div>
        )}
        <div className="flex justify-between text-gray-500"><span>Entrega</span><span>{formatCurrency(pedido.delivery_fee || 0)}</span></div>
        <div className="flex justify-between border-t border-gray-200 pt-1 font-bold">
          <span>Novo total</span><span>{formatCurrency(novoTotal)}</span>
        </div>
        {Math.abs(diferenca) > 0.001 && (
          <div className={`flex justify-between pt-1 font-semibold ${diferenca > 0 ? 'text-red-600' : 'text-green-700'}`}>
            <span>{diferenca > 0 ? 'Cliente paga a mais' : 'Devolver ao cliente'}</span>
            <span>{formatCurrency(Math.abs(diferenca))}</span>
          </div>
        )}
      </div>

      {jaPago && Math.abs(diferenca) > 0.001 && (
        <p className="rounded-lg bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-800">
          {diferenca > 0
            ? `Este pedido já está pago. Combine com o cliente como receber os ${formatCurrency(diferenca)} a mais — na entrega ou por Pix.`
            : `Este pedido já está pago. Depois de salvar, use "Estornar" para devolver os ${formatCurrency(Math.abs(diferenca))}.`}
        </p>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={salvar} disabled={salvando}
          className="flex-1 cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">
          {salvando ? 'Salvando…' : 'Salvar alterações'}
        </button>
        <button type="button" onClick={aoCancelar}
          className="cursor-pointer rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
          <HiX className="size-4" />
        </button>
      </div>

      {montando && (
        <FlavorPicker
          product={montando.produto}
          aberto={!!montando}
          aoFechar={() => setMontando(null)}
          aoConfirmar={confirmarSabores}
        />
      )}
    </div>
  )
}
