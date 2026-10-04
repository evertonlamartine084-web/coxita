import { useCallback, useEffect, useMemo, useState } from 'react'
import { horariosOcupados } from '../../services/entrega'
import { agendaDeEntrega } from '../../utils/funcionamento'

/**
 * Escolha do horário de entrega, de 30 em 30 minutos.
 *
 * Horário que já encheu some da lista. A lista se atualiza a cada minuto e sempre que
 * `recarregar` muda — o checkout muda esse número quando o banco recusa um horário que outro
 * cliente pegou primeiro.
 */
export default function HorariosDeEntrega({ settings, data, hora, aoEscolher, erro, recarregar }) {
  const [ocupados, setOcupados] = useState([])
  const [agora, setAgora] = useState(() => new Date())
  const [diaAberto, setDiaAberto] = useState(null)

  const buscar = useCallback(() => {
    const de = new Date()
    horariosOcupados(de, new Date(+de + 8 * 24 * 60 * 60 * 1000))
      .then(lista => { setOcupados(lista); setAgora(new Date()) })
      .catch(() => setAgora(new Date())) // sem a lista, o banco ainda recusa horário cheio
  }, [])

  useEffect(() => {
    buscar()
    const intervalo = setInterval(buscar, 60000)
    return () => clearInterval(intervalo)
  }, [buscar, recarregar])

  const agenda = useMemo(() => agendaDeEntrega(settings, ocupados, agora), [settings, ocupados, agora])
  const primeiroComVaga = agenda.find(d => d.horarios.length)
  const diaAtual = agenda.find(d => d.data === (diaAberto ?? data)) ?? primeiroComVaga

  // horário escolhido que deixou de existir (encheu ou passou): limpa para o cliente escolher outro
  useEffect(() => {
    if (!data || !hora) return
    const existe = agenda.some(d => d.horarios.some(h => h.data === data && h.hora === hora))
    if (!existe) aoEscolher('', '')
  }, [agenda, data, hora, aoEscolher])

  const nomeDoDia = (d) => {
    const hoje = new Date(agora); hoje.setHours(0, 0, 0, 0)
    const dif = Math.round((d - hoje) / (24 * 60 * 60 * 1000))
    if (dif === 0) return 'Hoje'
    if (dif === 1) return 'Amanhã'
    return d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  }

  if (!primeiroComVaga) {
    return <p className="text-sm text-text-light">Não há horário de entrega livre nos próximos dias. Escolha a retirada ou fale com a gente no WhatsApp.</p>
  }

  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-text-warm font-display">Escolha o dia</p>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {agenda.map(d => {
          const ativo = diaAtual?.data === d.data
          const vazio = !d.horarios.length
          return (
            <button
              key={d.data}
              type="button"
              disabled={vazio}
              onClick={() => setDiaAberto(d.data)}
              className={`shrink-0 cursor-pointer rounded-xl border-2 px-3 py-2 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                ativo ? 'border-primary bg-primary text-white' : 'border-border bg-white hover:border-primary'
              }`}
            >
              <span className="block text-xs font-semibold capitalize">{nomeDoDia(d.dia)}</span>
              <span className="block text-sm font-bold">{d.dia.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
            </button>
          )
        })}
      </div>

      <p className="mb-2 mt-4 text-sm font-semibold text-text-warm font-display">Escolha o horário</p>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {diaAtual.horarios.map(h => {
          const ativo = h.data === data && h.hora === hora
          return (
            <button
              key={h.hora}
              type="button"
              onClick={() => aoEscolher(h.data, h.hora)}
              aria-pressed={ativo}
              className={`cursor-pointer rounded-xl border-2 py-2.5 text-sm font-bold tabular-nums transition-colors ${
                ativo ? 'border-primary bg-primary text-white' : 'border-border bg-white hover:border-primary'
              }`}
            >
              {h.hora}
            </button>
          )
        })}
      </div>
      {erro && <p className="mt-2 text-xs font-semibold text-danger">{erro}</p>}
      <p className="mt-3 text-xs text-text-light">
        Cada horário atende uma entrega por vez. O pedido chega entre o horário escolhido e meia hora depois.
      </p>
    </div>
  )
}
