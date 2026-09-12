/** Máscara e validação de CPF. O campo é opcional: vazio significa nota sem identificação. */

export function mascararCpf(valor) {
  const n = (valor || '').replace(/\D/g, '').slice(0, 11)
  return n
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

/**
 * Confere os dois dígitos verificadores.
 *
 * Vale a pena validar aqui: CPF errado só seria descoberto na hora de emitir a nota, quando o
 * pedido já foi entregue e o cliente não está mais por perto para corrigir.
 */
export function cpfValido(valor) {
  const n = (valor || '').replace(/\D/g, '')
  if (n.length !== 11) return false
  // 111.111.111-11 e afins passam na conta dos dígitos, mas não existem
  if (/^(\d)\1{10}$/.test(n)) return false

  const dv = (base, pesoInicial) => {
    let soma = 0
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }

  return dv(n.slice(0, 9), 10) === Number(n[9]) && dv(n.slice(0, 10), 11) === Number(n[10])
}
