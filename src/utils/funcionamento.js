// Horário da ENTREGA, não da loja: a retirada não passa por aqui.
// Dias em que a loja entrega, no padrão do Date.getDay(): 0 = domingo.
// Segunda a sábado; domingo sem entrega.
export const DIAS_DE_ENTREGA = [1, 2, 3, 4, 5, 6]

const ABERTURA_PADRAO = '13:00'
const FECHAMENTO_PADRAO = '18:00'

export function horarioDeEntrega(settings = {}) {
  return {
    abre: settings.opening_time || ABERTURA_PADRAO,
    fecha: settings.closing_time || FECHAMENTO_PADRAO,
  }
}

const hhmm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/** Data local em AAAA-MM-DD (toISOString daria a data em UTC, um dia à frente depois das 21h). */
export function dataLocal(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function entregaAbertaEm(quando, settings) {
  const { abre, fecha } = horarioDeEntrega(settings)
  const hora = hhmm(quando)
  return DIAS_DE_ENTREGA.includes(quando.getDay()) && hora >= abre && hora <= fecha
}

/** Mensagem de erro para um agendamento fora do horário, ou null se estiver dentro. */
export function erroDeAgendamento(data, hora, settings) {
  const { abre, fecha } = horarioDeEntrega(settings)
  const quando = new Date(`${data}T${hora}`)
  if (!DIAS_DE_ENTREGA.includes(quando.getDay())) return 'Não entregamos aos domingos'
  if (hora < abre || hora > fecha) return `Entregamos das ${abre} às ${fecha}`
  return null
}

/**
 * Agenda de entrega, de 30 em 30 minutos, como horário de barbearia.
 *
 * Devolve os dias (segunda a sábado) dos próximos `entrega_dias_agenda` dias, cada um com os
 * horários que ainda dá para marcar: dentro do horário de entrega, com a antecedência mínima
 * de preparo e com vaga (`entrega_por_horario` por horário). O banco confere tudo de novo em
 * `criar_pedido`; aqui é só para não oferecer o que vai ser recusado.
 *
 * `ocupados` é o que veio de `horarios_entrega_ocupados`.
 */
export function agendaDeEntrega(settings = {}, ocupados = [], agora = new Date()) {
  const { abre, fecha } = horarioDeEntrega(settings)
  const dias = Number(settings.entrega_dias_agenda) || 7
  const porHorario = Number(settings.entrega_por_horario) || 1
  const antecedencia = (Number(settings.entrega_antecedencia_min) || 30) * 60 * 1000
  const tomados = new Map(ocupados.map(o => [new Date(o.horario).getTime(), o.entregas]))
  const [hAbre, mAbre] = abre.split(':').map(Number)
  const [hFecha, mFecha] = fecha.split(':').map(Number)

  const agenda = []
  for (let i = 0; i < dias; i++) {
    const dia = new Date(agora)
    dia.setHours(0, 0, 0, 0)
    dia.setDate(dia.getDate() + i)
    if (!DIAS_DE_ENTREGA.includes(dia.getDay())) continue
    const horarios = []
    const inicio = new Date(dia); inicio.setHours(hAbre, mAbre, 0, 0)
    const fim = new Date(dia); fim.setHours(hFecha, mFecha, 0, 0)
    for (let t = inicio; t < fim; t = new Date(+t + 30 * 60 * 1000)) {
      if (+t < +agora + antecedencia) continue
      if ((tomados.get(+t) ?? 0) >= porHorario) continue
      horarios.push({ data: dataLocal(t), hora: hhmm(t), quando: t })
    }
    agenda.push({ data: dataLocal(dia), dia, horarios })
  }
  return agenda
}
