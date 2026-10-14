import { useMemo } from 'react'
import { HiCash, HiCheck, HiRefresh, HiTruck } from 'react-icons/hi'
import toast from 'react-hot-toast'
import { supabase } from '../../services/supabase'
import { marcarPago, updateOrderStatus } from '../../services/orders'
import { formatCurrency, rotuloDoStatus, STATUS_COLORS, aReceber, faltaReceber, janelaDeEntrega, PAYMENT_LABELS } from '../../utils/format'

/**
 * Cliente da conversa no Atendimento (14/10/2026): o pedido em aberto, com os botões que a
 * conversa pede (cobrar Pix, marcar pago, avançar o status), e a ficha com o histórico e o
 * "Repetir último pedido". Os pedidos vêm de pedidos_do_telefone (supabase/pedidos-do-telefone.sql).
 */

const dia = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
const diaComAno = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })

/** O próximo passo do pedido, como a cozinha fala. */
function proximoPasso(p) {
  if (p.status === 'pendente') return { status: 'em_preparo', rotulo: 'Em preparo', icone: HiCheck }
  if (p.status === 'em_preparo') {
    return p.delivery_type === 'entrega'
      ? { status: 'saiu_entrega', rotulo: 'Saiu para entrega', icone: HiTruck }
      : { status: 'saiu_entrega', rotulo: 'Pronto para retirada', icone: HiCheck }
  }
  if (p.status === 'saiu_entrega') return { status: 'entregue', rotulo: p.delivery_type === 'entrega' ? 'Entregue' : 'Retirado', icone: HiCheck }
  return null
}

/** Mesmo efeito da troca de status na tela Pedidos: push ao cliente e, ao entregar, já pago. */
async function avancarStatus(p, status) {
  await updateOrderStatus(p.id, status)
  supabase.functions.invoke('send-push', { body: { order_number: p.order_number, status } }).catch(() => {})
  if (status === 'entregue' && aReceber({ ...p, status: 'entregue' })) await marcarPago(p.id)
}

export function CardPedidoAberto({ pedido: p, aoCobrar, aoMudar }) {
  if (!p) return null
  const pago = p.payment_status === 'pago'
  const passo = proximoPasso(p)
  const janela = p.scheduled_for && p.delivery_type === 'entrega' ? janelaDeEntrega(p.scheduled_for) : null

  const agir = async (fn, ok) => {
    try { await fn(); toast.success(ok); aoMudar?.() } catch { toast.error('Não consegui atualizar o pedido.') }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-sm">
      <span className="font-semibold">Pedido #{p.order_number}</span>
      {p.codigo_cliente && <span className="rounded bg-white px-1.5 font-mono text-xs">{p.codigo_cliente}</span>}
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[p.status]}`}>{rotuloDoStatus(p.status, p.delivery_type)}</span>
      <span className="font-semibold">{formatCurrency(p.total)}</span>
      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${pago ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>
        {pago ? '✓ PAGO' : `NÃO PAGO · ${PAYMENT_LABELS[p.payment_method] ?? p.payment_method}`}
      </span>
      {p.scheduled_for && (
        <span className="text-xs text-gray-600">
          {p.delivery_type === 'entrega' ? '🛵' : '🏪'} {dia(p.scheduled_for)}{janela ? ` ${janela.de}–${janela.ate}` : ` ${new Date(p.scheduled_for).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
        </span>
      )}
      <div className="ml-auto flex flex-wrap gap-1.5">
        {!pago && (
          <>
            <button onClick={() => aoCobrar(p)} className="flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50">
              <HiCash /> Cobrar Pix
            </button>
            <button
              onClick={() => window.confirm(`Marcar o pedido #${p.order_number} como pago (${formatCurrency(faltaReceber(p))})?`) && agir(() => marcarPago(p.id), 'Marcado como pago.')}
              className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-green-700 ring-1 ring-green-300 hover:bg-green-50"
            >
              Recebi
            </button>
          </>
        )}
        {passo && (
          <button onClick={() => agir(() => avancarStatus(p, passo.status), `#${p.order_number}: ${passo.rotulo}`)}
            className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:opacity-90">
            <passo.icone /> {passo.rotulo}
          </button>
        )}
      </div>
    </div>
  )
}

export function FichaDoCliente({ pedidos, carregando, temTelefone, aoRepetir }) {
  const resumo = useMemo(() => {
    const validos = (pedidos ?? []).filter(p => p.status !== 'cancelado')
    const sabores = new Map()
    for (const p of validos) for (const it of p.itens ?? []) for (const f of it.flavors ?? []) {
      sabores.set(f.flavor_name, (sabores.get(f.flavor_name) ?? 0) + Number(f.quantity) * Number(it.quantity || 1))
    }
    const comEndereco = validos.find(p => p.delivery_type === 'entrega' && p.address)
    return {
      validos,
      gasto: validos.reduce((t, p) => t + Number(p.total || 0), 0),
      primeiro: validos[validos.length - 1]?.created_at,
      endereco: comEndereco ? [comEndereco.address, comEndereco.address_number, comEndereco.neighborhood].filter(Boolean).join(', ') : null,
      preferidos: [...sabores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3),
      ultimo: validos.find(p => (p.itens ?? []).length),
    }
  }, [pedidos])

  if (!temTelefone) {
    return <p className="p-4 text-sm text-gray-500">Conversa sem telefone. Crie o pedido por ela (ou renomeie) para ligar ao cliente.</p>
  }
  if (carregando && !pedidos) return <p className="p-4 text-sm text-gray-500">Carregando…</p>
  if (!resumo.validos.length) return <p className="p-4 text-sm text-gray-500">Nenhum pedido com este telefone ainda. Cliente novo! 🎉</p>

  return (
    <div className="space-y-4 p-4 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-gray-50 p-2">
          <p className="text-xs text-gray-500">Pedidos</p>
          <p className="text-lg font-bold">{resumo.validos.length}</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-2">
          <p className="text-xs text-gray-500">Já gastou</p>
          <p className="text-lg font-bold">{formatCurrency(resumo.gasto)}</p>
        </div>
      </div>
      <p className="text-xs text-gray-500">Cliente desde {diaComAno(resumo.primeiro)}</p>

      {resumo.ultimo && (
        <button onClick={() => aoRepetir(resumo.ultimo)} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 font-semibold text-white hover:opacity-90">
          <HiRefresh /> Repetir último pedido
        </button>
      )}

      {resumo.preferidos.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-gray-400">Sabores preferidos</p>
          {resumo.preferidos.map(([nome, qtd]) => (
            <p key={nome} className="flex justify-between"><span>{nome}</span><span className="text-gray-500">{qtd} un.</span></p>
          ))}
        </div>
      )}

      {resumo.endereco && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-gray-400">Último endereço</p>
          <p>{resumo.endereco}</p>
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-semibold uppercase text-gray-400">Últimos pedidos</p>
        {resumo.validos.slice(0, 6).map(p => (
          <div key={p.id} className="border-t border-gray-100 py-1.5">
            <div className="flex justify-between">
              <span className="font-medium">#{p.order_number} · {dia(p.created_at)}</span>
              <span>{formatCurrency(p.total)}</span>
            </div>
            <p className="truncate text-xs text-gray-500">
              {(p.itens ?? []).map(it => `${it.quantity > 1 ? `${it.quantity}x ` : ''}${it.product_name}`).join(', ')}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
