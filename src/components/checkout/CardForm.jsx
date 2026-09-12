import { useState } from 'react'
import { HiLockClosed, HiCreditCard } from 'react-icons/hi'
import {
  detectarBandeira, mascararNumero, mascararValidade,
  tamanhoCvv, numeroValido, validadeValida,
} from '../../utils/cartao'

/**
 * Formulário de cartão, na própria tela do checkout.
 *
 * Os dados vivem só no estado deste componente e vão direto para a Edge Function; nada é
 * gravado em localStorage, em store global ou em log. Ao desmontar, somem com o componente.
 */
export default function CardForm({ total, onPagar, processando }) {
  const [numero, setNumero] = useState('')
  const [titular, setTitular] = useState('')
  const [validade, setValidade] = useState('')
  const [cvv, setCvv] = useState('')
  const [parcelas, setParcelas] = useState(1)
  const [erros, setErros] = useState({})

  const bandeira = detectarBandeira(numero)
  const maxCvv = tamanhoCvv(numero)

  // até 4x, e nunca abaixo de R$ 20 por parcela — parcela miúda só gera taxa
  const maxParcelas = Math.max(1, Math.min(4, Math.floor(total / 20)))

  const validar = () => {
    const e = {}
    if (!numeroValido(numero)) e.numero = 'Confira o número do cartão.'
    if (titular.trim().length < 3) e.titular = 'Como está escrito no cartão.'
    if (!validadeValida(validade)) e.validade = 'Validade inválida ou vencida.'
    if (cvv.replace(/\D/g, '').length !== maxCvv) e.cvv = `O código tem ${maxCvv} dígitos.`
    setErros(e)
    return Object.keys(e).length === 0
  }

  const enviar = (ev) => {
    ev.preventDefault()
    if (!validar()) return
    onPagar({
      numero: numero.replace(/\D/g, ''),
      titular: titular.trim().toUpperCase(),
      validade: validadeValida(validade),
      cvv: cvv.replace(/\D/g, ''),
      bandeira: bandeira || 'Visa',
    }, parcelas)
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <Campo rotulo="Número do cartão" erro={erros.numero}>
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="cc-number"
            value={numero}
            onChange={(e) => setNumero(mascararNumero(e.target.value))}
            placeholder="0000 0000 0000 0000"
            className={entrada(erros.numero)}
          />
          {bandeira && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 font-display text-xs font-extrabold uppercase tracking-wide text-text-light">
              {bandeira}
            </span>
          )}
        </div>
      </Campo>

      <Campo rotulo="Nome impresso no cartão" erro={erros.titular}>
        <input
          type="text"
          autoComplete="cc-name"
          value={titular}
          onChange={(e) => setTitular(e.target.value)}
          placeholder="COMO ESTÁ NO CARTÃO"
          className={`${entrada(erros.titular)} uppercase`}
        />
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Validade" erro={erros.validade}>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="cc-exp"
            value={validade}
            onChange={(e) => setValidade(mascararValidade(e.target.value))}
            placeholder="MM/AA"
            className={entrada(erros.validade)}
          />
        </Campo>
        <Campo rotulo={`Código (${maxCvv} dígitos)`} erro={erros.cvv}>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="cc-csc"
            value={cvv}
            onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, maxCvv))}
            placeholder={'0'.repeat(maxCvv)}
            className={entrada(erros.cvv)}
          />
        </Campo>
      </div>

      {maxParcelas > 1 && (
        <Campo rotulo="Parcelas">
          <select
            value={parcelas}
            onChange={(e) => setParcelas(Number(e.target.value))}
            className={entrada(null)}
          >
            {Array.from({ length: maxParcelas }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}x de {(total / n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                {n === 1 ? ' à vista' : ' sem juros'}
              </option>
            ))}
          </select>
        </Campo>
      )}

      <button
        type="submit"
        disabled={processando}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-sm border-2 border-brown bg-brown px-6 py-3.5 font-display text-base font-extrabold uppercase tracking-[0.04em] text-white shadow-[4px_4px_0_#ffcd5e] transition-colors duration-[--duration-fast] hover:border-primary hover:bg-primary active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
      >
        <HiCreditCard className="size-5" aria-hidden="true" />
        {processando
          ? 'Processando…'
          : `Pagar ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}
      </button>

      <p className="flex items-center justify-center gap-1.5 text-xs text-text-light">
        <HiLockClosed className="size-3.5" aria-hidden="true" />
        Pagamento processado pela Cielo
      </p>
    </form>
  )
}

const entrada = (erro) =>
  `w-full rounded-sm border-2 bg-white px-3 py-2.5 text-base text-text outline-none transition-colors placeholder:text-text-light/50 focus:border-primary ${
    erro ? 'border-danger' : 'border-border-warm'
  }`

function Campo({ rotulo, erro, children }) {
  return (
    <label className="block">
      <span className="mb-1 block font-display text-xs font-extrabold uppercase tracking-[0.06em] text-text-warm">
        {rotulo}
      </span>
      {children}
      {erro && <span className="mt-1 block text-xs text-danger">{erro}</span>}
    </label>
  )
}
