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
