import { useEffect, useRef, useState } from 'react'
import { HiDownload, HiX, HiInformationCircle } from 'react-icons/hi'
import { useInstallStore } from '../../store/installStore'
import { comoInstalar } from '../../utils/comoInstalar'

/**
 * Faixa acima do header convidando a instalar o app.
 *
 * Fica no fluxo (não é sticky) de propósito: quem chega vê o convite, e quem começou a rolar o
 * cardápio não fica com uma tarja comendo a tela em cima do header, que já é sticky. Quem
 * rolar além dela ainda recebe o popup — ver InstallPrompt.
 *
 * Aparece MESMO SEM o `beforeinstallprompt`. O evento é o que abre o diálogo nativo, mas ele
 * não vem sempre (o Chrome exige engajamento, o Safari nunca dispara) — e amarrar o convite a
 * ele deixava a maioria dos visitantes sem ver nada.
 */
export default function InstallBar() {
  const evento = useInstallStore((s) => s.evento)
  const instalado = useInstallStore((s) => s.instalado)
  const dispensado = useInstallStore((s) => s.dispensado)
  const instalar = useInstallStore((s) => s.instalar)
  const dispensar = useInstallStore((s) => s.dispensar)
  const setBarraNaTela = useInstallStore((s) => s.setBarraNaTela)

  const [mostrandoComo, setMostrandoComo] = useState(false)
  const visivel = !instalado && !dispensado
  const ref = useRef(null)
  const instrucao = comoInstalar()

  // avisa o popup enquanto a barra estiver à vista, pra não haver dois convites na tela
  useEffect(() => {
    const el = ref.current
    if (!el) {
      setBarraNaTela(false)
      return
    }
    const obs = new IntersectionObserver(
      ([entrada]) => setBarraNaTela(entrada.isIntersecting),
      { threshold: 0 }
    )
    obs.observe(el)
    return () => {
      obs.disconnect()
      setBarraNaTela(false)
    }
  }, [visivel, setBarraNaTela])

  if (!visivel) return null

  return (
    <div
      ref={ref}
      className="relative z-[51] bg-brown text-cream"
      // o topo respeita o notch quando a página abre em tela cheia
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
        <img src="/logo-192.png" alt="" className="size-7 shrink-0 rounded" />

        <p className="min-w-0 flex-1 text-sm leading-tight">
          <span className="font-display font-extrabold uppercase tracking-[0.03em]">
            Baixe nosso app
          </span>
          <span className="hidden text-cream/80 sm:inline"> — mais rápido, direto do ícone</span>
        </p>

        {evento ? (
          <button
            type="button"
            onClick={instalar}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-sm border-2 border-secondary bg-secondary px-3 py-1 font-display text-xs font-extrabold uppercase tracking-[0.04em] text-brown transition-colors duration-[--duration-fast] hover:border-sun hover:bg-sun active:scale-[0.98]"
          >
            <HiDownload className="size-3.5" aria-hidden="true" />
            Instalar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setMostrandoComo((v) => !v)}
            aria-expanded={mostrandoComo}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-sm border-2 border-secondary bg-transparent px-3 py-1 font-display text-xs font-extrabold uppercase tracking-[0.04em] text-secondary transition-colors duration-[--duration-fast] hover:bg-secondary hover:text-brown active:scale-[0.98]"
          >
            <HiInformationCircle className="size-3.5" aria-hidden="true" />
            {instrucao?.curto ?? 'Como instalar'}
          </button>
        )}

        <button
          type="button"
          onClick={dispensar}
          aria-label="Dispensar convite de instalação"
          className="shrink-0 cursor-pointer p-1 text-cream/70 transition-colors hover:text-cream"
        >
          <HiX className="size-4" />
        </button>
      </div>

      {mostrandoComo && instrucao && (
        <p className="mx-auto max-w-6xl px-4 pb-3 text-sm leading-snug text-cream/90">
          {instrucao.longo}
        </p>
      )}
    </div>
  )
}
