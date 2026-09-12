/** Máscaras e validações do formulário de cartão. Nada aqui persiste nada. */

/** Detecta a bandeira pelo início do número — a Cielo exige o campo Brand na requisição. */
export function detectarBandeira(numero) {
  const n = (numero || '').replace(/\D/g, '')
  if (/^4/.test(n)) return 'Visa'
  if (/^(5[1-5]|2[2-7])/.test(n)) return 'Master'
  if (/^3[47]/.test(n)) return 'Amex'
  if (/^(38|60|6504|6505|6507|6509|6516|6550)/.test(n)) return 'Hipercard'
  if (/^(636368|438935|504175|451416|509)/.test(n)) return 'Elo'
  if (/^(30|36|38)/.test(n)) return 'Diners'
  return null
}

const AMEX = (n) => /^3[47]/.test(n)

/** Espaça em grupos de 4 (Amex usa 4-6-5, e digitar nela com 4-4-4-4 fica estranho). */
export function mascararNumero(valor) {
  const n = (valor || '').replace(/\D/g, '').slice(0, 19)
  if (AMEX(n)) {
    return n.replace(/(\d{4})(\d{0,6})(\d{0,5})/, (_, a, b, c) => [a, b, c].filter(Boolean).join(' '))
  }
  return n.replace(/(\d{4})(?=\d)/g, '$1 ').trim()
}

export function mascararValidade(valor) {
  const n = (valor || '').replace(/\D/g, '').slice(0, 6)
  if (n.length <= 2) return n
  return `${n.slice(0, 2)}/${n.slice(2)}`
}

export function tamanhoCvv(numero) {
  return AMEX((numero || '').replace(/\D/g, '')) ? 4 : 3
}

/**
 * Os cartões de teste da Cielo são 15 zeros e um dígito (0000000000000001 = autorizado,
 * ...0002 = negado, e assim por diante). Eles NÃO passam no Luhn, então sem esta exceção o
 * sandbox fica impossível de testar. Nenhum cartão real tem esse formato, então liberar aqui
 * não enfraquece a validação em produção.
 */
const ehCartaoDeTesteCielo = (n) => /^0{15}\d$/.test(n)

/**
 * Luhn. Pega o dígito trocado na hora, em vez de mandar pra Cielo e voltar recusado —
 * cada recusa desnecessária é um cliente achando que o cartão dele tem problema.
 */
export function numeroValido(numero) {
  const n = (numero || '').replace(/\D/g, '')
  if (ehCartaoDeTesteCielo(n)) return true
  if (n.length < 13 || n.length > 19) return false
  let soma = 0
  let dobra = false
  for (let i = n.length - 1; i >= 0; i--) {
    let d = Number(n[i])
    if (dobra) {
      d *= 2
      if (d > 9) d -= 9
    }
    soma += d
    dobra = !dobra
  }
  return soma % 10 === 0
}

/** Aceita MM/AA e MM/AAAA; devolve MM/AAAA, que é o formato que a Cielo espera. */
export function validadeValida(valor) {
  const m = /^(\d{2})\/(\d{2}|\d{4})$/.exec((valor || '').trim())
  if (!m) return null
  const mes = Number(m[1])
  if (mes < 1 || mes > 12) return null
  const ano = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2])
  // vence no ÚLTIMO dia do mês: um cartão 09/2026 é válido o setembro inteiro
  const vence = new Date(ano, mes, 0, 23, 59, 59)
  if (vence < new Date()) return null
  return `${String(mes).padStart(2, '0')}/${ano}`
}
