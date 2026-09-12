import { useEffect, useState } from 'react'
import { HiX, HiDownload } from 'react-icons/hi'
import { useInstallStore } from '../../store/installStore'
import { comoInstalar } from '../../utils/comoInstalar'

const ESPERA_MS = 25000

/**
 * Segundo convite de instalação, para quem passou da barra do topo sem instalar nem dispensar.
 *
 * Só aparece com a barra fora de vista: dois convites simultâneos na mesma tela viram ruído.
 */
export default function InstallPrompt() {
  const evento = useInstallStore((s) => s.evento)
  const instalado = useInstallStore((s) => s.instalado)
  const dispensado = useInstallStore((s) => s.dispensado)
  const barraNaTela = useInstallStore((s) => s.barraNaTela)
  const instalar = useInstallStore((s) => s.instalar)
  const dispensar = useInstallStore((s) => s.dispensar)

  const [esperou, setEsperou] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setEsperou(true), ESPERA_MS)
    return () => clearTimeout(t)
  }, [])

  const instrucao = comoInstalar()
  if (instalado || dispensado || !esperou || barraNaTela) return null

  return (
    <div
      role="dialog"
      aria-label="Instalar o app do Coxelli"
      className="fixed inset-x-3 bottom-0 z-50 mx-auto max-w-md rounded-lg border-2 border-brown bg-cream p-4 shadow-[4px_4px_0_#5d2b04] sm:inset-x-auto sm:right-4"
      // sem isto o card fica embaixo da barra do navegador no celular e o botão some
      style={{ marginBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <button
        type="button"
        onClick={dispensar}
        aria-label="Agora não"
        className="absolute right-2 top-2 cursor-pointer p-1 text-text-light transition-colors hover:text-brown"
      >
        <HiX className="size-5" />
      </button>

      <div className="flex items-start gap-3">
        <img width={192} height={192} src="/logo-192.png" alt="" className="size-12 shrink-0 rounded-lg" />
        <div className="min-w-0 pr-5">
          <p className="font-display text-lg font-extrabold uppercase leading-tight tracking-[0.02em] text-brown">
            Baixe nosso app
          </p>

          <p className="mt-1 text-sm text-text-warm">
            {evento
              ? 'Peça mais rápido, direto do ícone — sem abrir o navegador.'
              : instrucao?.longo}
          </p>

          {evento && (
            <button
              type="button"
              onClick={instalar}
              className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-sm border-2 border-brown bg-brown px-4 py-2 font-display text-sm font-extrabold uppercase tracking-[0.04em] text-white shadow-[3px_3px_0_#ffcd5e] transition-colors duration-[--duration-fast] hover:border-primary hover:bg-primary active:scale-[0.98]"
            >
              <HiDownload className="size-4" />
              Instalar app
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
