import { useEffect } from 'react'
import { useInstallStore, abertoComoApp } from '../store/installStore'
import { registrarInstalacao, registrarUsoDoApp } from '../services/appInstalls'

/**
 * Prende os eventos de instalação do navegador ao store. Chamar UMA vez, no layout.
 *
 * `beforeinstallprompt` dispara cedo e uma vez só; sem `preventDefault` o Chrome mostra o
 * próprio banner e o evento se perde, e sem ele guardado não há como abrir o diálogo depois.
 */
export function useCapturarInstalacao() {
  const capturar = useInstallStore((s) => s.capturar)
  const marcarInstalado = useInstallStore((s) => s.marcarInstalado)
  const conferirInstalado = useInstallStore((s) => s.conferirInstalado)

  useEffect(() => {
    const aoPoderInstalar = (e) => {
      e.preventDefault()
      capturar(e)
    }
    const aoInstalar = () => {
      marcarInstalado()
      registrarInstalacao() // alimenta a contagem do painel
    }
    window.addEventListener('beforeinstallprompt', aoPoderInstalar)
    window.addEventListener('appinstalled', aoInstalar)

    // pergunta ao navegador se o app já está instalado (Chrome/Android)
    conferirInstalado()
    // marca presença se esta sessão está rodando dentro do app
    registrarUsoDoApp()

    // instalar pelo menu do navegador, com o site aberto, muda o display-mode sem recarregar
    const modo = window.matchMedia('(display-mode: standalone)')
    const aoMudarModo = () => {
      if (!abertoComoApp()) return
      marcarInstalado()
      registrarUsoDoApp()
    }
    modo.addEventListener('change', aoMudarModo)

    return () => {
      window.removeEventListener('beforeinstallprompt', aoPoderInstalar)
      window.removeEventListener('appinstalled', aoInstalar)
      modo.removeEventListener('change', aoMudarModo)
    }
  }, [capturar, marcarInstalado, conferirInstalado])
}
