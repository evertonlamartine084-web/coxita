import { useEffect, useState } from 'react'
import { HiBell, HiCheckCircle } from 'react-icons/hi'
import { registerPushSubscription } from '../../services/pushNotifications'

/**
 * Convite para receber avisos do pedido, logo depois de confirmar.
 *
 * Aqui é o melhor momento: a pessoa acabou de pedir e a proposta ("aviso quando sair pra
 * entrega") faz sentido sozinha. Antes disso a assinatura só nascia se o cliente abrisse a tela
 * de acompanhamento — quem pedia e largava o celular nunca era avisado de nada.
 *
 * NÃO dispara o pedido de permissão sozinho. O navegador só pergunta uma vez: se a pessoa negar
 * por reflexo, num pop-up que apareceu sem contexto, ela nunca mais é perguntada e perde os
 * avisos para sempre. Quem já concedeu antes é registrado em silêncio, sem ver nada disso.
 */
export default function AvisoPush({ orderNumber }) {
  const [estado, setEstado] = useState('carregando') // carregando | oferecer | ativo | indisponivel
  const [processando, setProcessando] = useState(false)

  useEffect(() => {
    if (!orderNumber) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setEstado('indisponivel')
      return
    }

    if (Notification.permission === 'granted') {
      // já autorizou antes: assina este pedido sem incomodar
      registerPushSubscription(orderNumber)
        .then((r) => setEstado(r?.granted ? 'ativo' : 'oferecer'))
        .catch(() => setEstado('oferecer'))
      return
    }

    // 'denied' é definitivo no navegador; não adianta oferecer o que não podemos entregar
    setEstado(Notification.permission === 'denied' ? 'indisponivel' : 'oferecer')
  }, [orderNumber])

  const ativar = async () => {
    setProcessando(true)
    try {
      const r = await registerPushSubscription(orderNumber)
      setEstado(r?.granted ? 'ativo' : 'indisponivel')
    } catch {
      setEstado('indisponivel')
    } finally {
      setProcessando(false)
    }
  }

  if (estado === 'carregando' || estado === 'indisponivel') return null

  if (estado === 'ativo') {
    return (
      <div className="mb-6 flex items-center justify-center gap-2 rounded-lg border-2 border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent">
        <HiCheckCircle className="size-5 shrink-0" aria-hidden="true" />
        Você será avisado quando o pedido mudar de status.
      </div>
    )
  }

  return (
    <div className="mb-6 rounded-lg border-2 border-brown bg-cream p-4 text-left shadow-[4px_4px_0_#ffcd5e]">
      <div className="flex items-start gap-3">
        <HiBell className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-extrabold uppercase leading-tight tracking-[0.02em] text-brown">
            Avisamos quando sair pra entrega
          </p>
          <p className="mt-1 text-sm text-text-warm">
            Sem precisar ficar olhando o site.
          </p>
          <button
            type="button"
            onClick={ativar}
            disabled={processando}
            className="mt-3 cursor-pointer rounded-sm border-2 border-brown bg-brown px-4 py-2 font-display text-sm font-extrabold uppercase tracking-[0.04em] text-white transition-colors duration-[--duration-fast] hover:border-primary hover:bg-primary active:scale-[0.98] disabled:opacity-60"
          >
            {processando ? 'Ativando…' : 'Quero ser avisado'}
          </button>
        </div>
      </div>
    </div>
  )
}
