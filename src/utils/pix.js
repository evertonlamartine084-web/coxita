/**
 * Pix Copia e Cola (BR Code estático do Banco Central) com o valor já dentro: o cliente copia o
 * código, cola no app do banco e só confirma. Pedido do dono em 14/10/2026 ("aparecer aquele Pix
 * já com o valor pra o cara copiar").
 *
 * Formato EMV: cada campo é ID (2) + tamanho (2) + valor; termina no CRC16-CCITT (campo 63).
 */

const campo = (id, valor) => `${id}${String(valor.length).padStart(2, '0')}${valor}`

/** Sem acento e só o que o padrão aceita; o Banco Central limita nome a 25 e cidade a 15. */
const limpar = (texto, max) => String(texto ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9 .-]/g, '').trim().toUpperCase().slice(0, max)

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), em 4 dígitos hexadecimais. */
export function crc16(texto) {
  let crc = 0xffff
  for (const ch of new TextEncoder().encode(texto)) {
    crc ^= ch << 8
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/** Chave como o Pix espera: telefone com +55, CPF/CNPJ só dígitos, e-mail e aleatória como estão. */
export function normalizarChavePix(chave) {
  const c = String(chave ?? '').trim()
  if (/@/.test(c) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(c)) return c.toLowerCase()
  const d = c.replace(/\D/g, '')
  if (c.startsWith('+')) return `+${d}`
  if (d.length === 11 && /^\d{2}9/.test(d) && !/^\d{3}\.\d{3}/.test(c)) return `+55${d}` // celular com DDD
  return d // CPF (11) ou CNPJ (14)
}

export function pixCopiaECola({ chave, nome, cidade = 'NATAL', valor, identificador = '***' }) {
  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', normalizarChavePix(chave))
  const txid = String(identificador).replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***'
  const corpo = campo('00', '01')
    + campo('26', conta)
    + campo('52', '0000')
    + campo('53', '986')
    + (valor ? campo('54', Number(valor).toFixed(2)) : '')
    + campo('58', 'BR')
    + campo('59', limpar(nome, 25) || 'COXELLI')
    + campo('60', limpar(cidade, 15) || 'NATAL')
    + campo('62', campo('05', txid))
    + '6304'
  return corpo + crc16(corpo)
}
