import { useEffect, useRef, useState } from 'react'
import { HiClipboardCopy, HiCheckCircle, HiRefresh } from 'react-icons/hi'
import toast from 'react-hot-toast'
import { consultarPagamento } from '../../services/cielo'

const VALIDADE_SEGUNDOS = 15 * 60
const INTERVALO_MS = 4000

/**
 * Tela do Pix: QR na própria página, sem mandar o cliente pra lugar nenhum.
 *
 * Fica perguntando à Cielo se o pagamento caiu. Sem isso o cliente pagaria no app do banco e
 * continuaria olhando o QR, sem saber se deu certo — que é exatamente o que acontece hoje, com
 * a chave Pix copiada na mão.
 */
export default function PixPayment({ orderId, qrBase64, qrTexto, total, onPago }) {
  const [restante, setRestante] = useState(VALIDADE_SEGUNDOS)
  const [copiado, setCopiado] = useState(false)
  const [conferindo, setConferindo] = useState(false)
  const jaAvisou = useRef(false)
  const expirou = restante <= 0

  // O pai recria onPago a cada render; guardado em ref, não reinicia a consulta abaixo
  const onPagoRef = useRef(onPago)
  useEffect(() => { onPagoRef.current = onPago }, [onPago])

  // contagem regressiva
  useEffect(() => {
    if (restante <= 0) return
    const t = setInterval(() => setRestante((s) => s - 1), 1000)
    return () => clearInterval(t)
  }, [restante])

  // Pergunta à Cielo de tempos em tempos. Depende de `expirou`, e não de `restante`: com o
  // contador nas dependências o intervalo era recriado a cada segundo e nunca chegava aos 4s —
  // o cliente pagava e só via a confirmação se clicasse em "Já paguei".
  useEffect(() => {
    if (expirou) return

    let vivo = true
    const conferir = async () => {
      try {
        const status = await consultarPagamento(orderId)
        if (!vivo || jaAvisou.current) return
        if (status === 'pago') {
          jaAvisou.current = true
          onPagoRef.current()
        }
      } catch {
        // rede oscilando: a próxima rodada tenta de novo, sem incomodar o cliente
      }
    }

    const t = setInterval(conferir, INTERVALO_MS)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [orderId, expirou])

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(qrTexto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      toast.error('Não foi possível copiar. Selecione o código manualmente.')
    }
  }

  const conferirAgora = async () => {
    setConferindo(true)
    try {
      const status = await consultarPagamento(orderId)
      if (status === 'pago') {
        jaAvisou.current = true
        onPago()
      } else {
        toast('Ainda não identificamos o pagamento. Se você acabou de pagar, aguarde alguns segundos.')
      }
    } catch {
      toast.error('Não foi possível verificar agora. Tente de novo.')
    } finally {
      setConferindo(false)
    }
  }

  const mm = String(Math.floor(Math.max(0, restante) / 60)).padStart(2, '0')
  const ss = String(Math.max(0, restante) % 60).padStart(2, '0')

  return (
    <div className="space-y-4 text-center">
      <div>
        <p className="font-display text-xl font-extrabold uppercase leading-tight tracking-[0.02em] text-brown">
          Pague com Pix
        </p>
        <p className="mt-1 text-sm text-text-warm">
          Abra o app do seu banco e escaneie o código abaixo.
        </p>
      </div>

      {expirou ? (
        <div className="rounded-lg border-2 border-danger bg-white p-6">
          <p className="font-display text-base font-extrabold uppercase text-danger">
            Código expirado
          </p>
          <p className="mt-1 text-sm text-text-warm">
            Volte e refaça o pagamento para gerar um código novo.
          </p>
        </div>
      ) : (
        <>
          <div className="mx-auto inline-block rounded-lg border-2 border-brown bg-white p-3 shadow-[4px_4px_0_#5d2b04]">
            {qrBase64 ? (
              <img
                src={`data:image/png;base64,${qrBase64}`}
                alt="QR Code do Pix"
                className="size-56 md:size-64"
              />
            ) : (
              <div className="flex size-56 items-center justify-center text-sm text-text-light md:size-64">
                QR indisponível — use o código abaixo
              </div>
            )}
          </div>

          <p className="text-sm text-text-warm">
            Válido por{' '}
            <span className="font-display font-extrabold tabular-nums text-brown">
              {mm}:{ss}
            </span>
          </p>

          <button
            type="button"
            onClick={copiar}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-sm border-2 border-brown bg-secondary px-4 py-3 font-display text-sm font-extrabold uppercase tracking-[0.04em] text-brown transition-colors duration-[--duration-fast] hover:bg-brand-amber active:scale-[0.98]"
          >
            {copiado ? <HiCheckCircle className="size-4" /> : <HiClipboardCopy className="size-4" />}
            {copiado ? 'Código copiado' : 'Copiar código Pix'}
          </button>

          <div className="flex items-center justify-center gap-2 text-sm text-text-light">
            <span className="inline-block size-2 animate-pulse rounded-full bg-success" />
            Aguardando o pagamento…
          </div>

          <button
            type="button"
            onClick={conferirAgora}
            disabled={conferindo}
            className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-primary underline decoration-2 underline-offset-4 transition-colors hover:text-brown disabled:opacity-60"
          >
            <HiRefresh className={`size-4 ${conferindo ? 'animate-spin' : ''}`} />
            Já paguei, verificar agora
          </button>
        </>
      )}

      <p className="text-xs text-text-light">
        Valor: {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
      </p>
    </div>
  )
}
