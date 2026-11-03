import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { chamarUber, atualizarUber, cancelarUber, STATUS_UBER, corridaAtiva } from '../../services/uber'
import { formatCurrency } from '../../utils/format'

/**
 * Entrega por Uber no detalhe do pedido (03/11/2026). "Chamar Uber" pede o motorista pela API do
 * Uber Direct e GERA COBRANÇA no cartão da conta, por isso confirma antes. Com a corrida aberta,
 * a situação é relida a cada 30 s enquanto o pedido estiver aberto na tela.
 */
export default function UberDoPedido({ pedido, aoMudar }) {
  const [ocupado, setOcupado] = useState(false)
  const [confirmando, setConfirmando] = useState(null) // 'chamar' | 'cancelar'
  const ativa = corridaAtiva(pedido.uber_status)

  useEffect(() => {
    if (!pedido.uber_delivery_id || !ativa) return
    const t = setInterval(() => {
      atualizarUber(pedido.id).then(r => aoMudar(pedido.id, r)).catch(() => {})
    }, 30000)
    return () => clearInterval(t)
  }, [pedido.id, pedido.uber_delivery_id, ativa, aoMudar])

  const executar = async (acao) => {
    setConfirmando(null)
    setOcupado(true)
    try {
      const r = await ({ chamar: chamarUber, atualizar: atualizarUber, cancelar: cancelarUber }[acao])(pedido.id)
      aoMudar(pedido.id, r)
      if (acao === 'chamar') toast.success(r.ja_chamado ? 'O Uber já estava chamado.' : 'Uber chamado! Procurando motorista.')
      if (acao === 'cancelar') toast.success('Corrida cancelada.')
    } catch (e) {
      toast.error(`Uber: ${e.message}`)
    } finally {
      setOcupado(false)
    }
  }

  const botao = 'cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50'

  return (
    <div className="rounded-lg border-2 border-black/80 bg-gray-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-bold">🚗 Entrega por Uber</h4>
        {pedido.uber_status && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${ativa ? 'bg-black text-white' : 'bg-gray-200 text-gray-700'}`}>
            {STATUS_UBER[pedido.uber_status] ?? pedido.uber_status}
          </span>
        )}
      </div>

      {!pedido.uber_delivery_id || (!ativa && pedido.uber_status !== 'delivered') ? (
        <>
          <p className="mt-1 text-sm text-gray-600">
            Cliente pagou {formatCurrency(pedido.delivery_fee)} de entrega. Chame o motorista quando o pedido estiver quase pronto
            (ele chega em uns 10 min).
          </p>
          {confirmando === 'chamar' ? (
            <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm">
              <p className="font-semibold text-amber-900">Chamar agora? A Uber cobra a corrida no cartão da conta.</p>
              <div className="mt-2 flex gap-2">
                <button type="button" disabled={ocupado} onClick={() => executar('chamar')} className={`${botao} bg-black text-white`}>Sim, chamar</button>
                <button type="button" onClick={() => setConfirmando(null)} className={`${botao} border border-gray-300 bg-white`}>Voltar</button>
              </div>
            </div>
          ) : (
            <button type="button" disabled={ocupado} onClick={() => setConfirmando('chamar')} className={`${botao} mt-2 bg-black text-white`}>
              {ocupado ? 'Chamando…' : pedido.uber_status ? 'Chamar outro Uber' : 'Chamar Uber'}
            </button>
          )}
        </>
      ) : (
        <div className="mt-1 space-y-1 text-sm">
          {pedido.uber_motorista
            ? <p>Motorista: <strong>{pedido.uber_motorista}</strong></p>
            : <p className="text-gray-600">A Uber ainda está procurando motorista.</p>}
          {pedido.uber_custo != null && <p className="text-gray-600">Custo da corrida: {formatCurrency(pedido.uber_custo)}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            {pedido.uber_link && (
              <a href={pedido.uber_link} target="_blank" rel="noreferrer" className={`${botao} bg-black text-white no-underline`}>Ver no mapa</a>
            )}
            <button type="button" disabled={ocupado} onClick={() => executar('atualizar')} className={`${botao} border border-gray-300 bg-white`}>Atualizar</button>
            {ativa && (confirmando === 'cancelar' ? (
              <>
                <button type="button" disabled={ocupado} onClick={() => executar('cancelar')} className={`${botao} bg-red-600 text-white`}>Confirmar cancelamento</button>
                <button type="button" onClick={() => setConfirmando(null)} className={`${botao} border border-gray-300 bg-white`}>Voltar</button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmando('cancelar')} className={`${botao} border border-red-300 bg-white text-red-700`}>Cancelar corrida</button>
            ))}
          </div>
          {ativa && <p className="text-xs text-gray-500">Se o motorista já saiu, a Uber pode cobrar o cancelamento.</p>}
        </div>
      )}
    </div>
  )
}
