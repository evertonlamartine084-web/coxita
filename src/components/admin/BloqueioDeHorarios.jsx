import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../services/supabase'

/**
 * Horários de entrega do dia, de 30 em 30 min, como o checkout mostra. A loja fecha um horário
 * livre quando combina uma entrega por fora do site (WhatsApp, telefone) e reabre se desmarcar.
 * Bloqueio fica em entrega_bloqueios: some do checkout e o criar_pedido recusa
 * (supabase/entrega-bloqueios.sql). Horário com pedido de entrega não se mexe por aqui.
 */
export default function BloqueioDeHorarios({ dia, abre, fecha, pedidos }) {
  const [bloqueios, setBloqueios] = useState(null)
  const [mexendo, setMexendo] = useState(null)

  const ini = new Date(`${dia}T00:00:00`)
  const fim = new Date(+ini + 24 * 60 * 60 * 1000)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('entrega_bloqueios')
      .select('horario')
      .gte('horario', new Date(`${dia}T00:00:00`).toISOString())
      .lt('horario', new Date(+new Date(`${dia}T00:00:00`) + 24 * 60 * 60 * 1000).toISOString())
    if (error) { toast.error(`Não foi possível ler os bloqueios: ${error.message}`); setBloqueios([]); return }
    setBloqueios((data ?? []).map(b => +new Date(b.horario)))
  }, [dia])

  useEffect(() => { carregar() }, [carregar])

  if (ini.getDay() === 0) {
    return <p className="mt-3 text-sm text-text-light">Domingo não tem entrega pelo site.</p>
  }

  const horarios = []
  for (let d = new Date(`${dia}T${abre}`); d < new Date(`${dia}T${fecha}`) && d < fim; d = new Date(+d + 30 * 60 * 1000)) {
    horarios.push(d)
  }

  const pedidoDe = (h) => (pedidos ?? []).find(o => o.scheduled_for && +new Date(o.scheduled_for) === +h)

  const alternar = async (h) => {
    const bloqueado = bloqueios?.includes(+h)
    setMexendo(+h)
    try {
      const { error } = bloqueado
        ? await supabase.from('entrega_bloqueios').delete().eq('horario', h.toISOString())
        : await supabase.from('entrega_bloqueios').insert({ horario: h.toISOString(), motivo: 'fechado pelo painel' })
      if (error) throw error
      toast.success(`${h.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ${bloqueado ? 'reaberto no site' : 'fechado no site'}.`)
      await carregar()
    } catch (e) {
      toast.error(e.message || 'Não foi possível mudar o horário.')
    } finally {
      setMexendo(null)
    }
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {horarios.map(h => {
        const rotulo = h.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        const pedido = pedidoDe(h)
        if (pedido) {
          return (
            <span key={+h} title={`Entrega do #${pedido.order_number}`}
              className="rounded-lg bg-blue-50 px-3 py-1.5 text-sm text-blue-800 ring-1 ring-blue-200">
              {rotulo} · #{pedido.order_number}
            </span>
          )
        }
        const bloqueado = bloqueios?.includes(+h)
        const passou = h < new Date()
        return (
          <button key={+h} type="button" disabled={bloqueios === null || mexendo === +h || passou}
            onClick={() => alternar(h)}
            title={bloqueado ? 'Fechado: toque para reabrir no site' : 'Livre: toque para fechar no site'}
            className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 transition-colors disabled:cursor-default disabled:opacity-50 ${
              bloqueado
                ? 'bg-red-50 text-red-700 ring-red-200 line-through hover:bg-red-100'
                : 'bg-green-50 text-green-800 ring-green-200 hover:bg-green-100'
            }`}>
            {rotulo}
          </button>
        )
      })}
    </div>
  )
}
