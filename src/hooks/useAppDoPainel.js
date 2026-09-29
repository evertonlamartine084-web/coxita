import { useEffect, useState } from 'react'

/**
 * Faz o painel ser um app instalável separado do app dos clientes ("Coxelli Painel", ícone
 * marrom, abre em /admin/pedidos).
 *
 * O site é um SPA só, com um index.html só, então o <head> nasce com o manifesto da loja. Aqui
 * ele é trocado pelo /painel.webmanifest enquanto o painel está aberto (e desfeito ao sair):
 * o Chrome relê o manifesto quando o link muda, e o Safari lê o <head> na hora do "Adicionar à
 * Tela de Início". Os dois apps convivem porque têm `id` e `scope` diferentes.
 *
 * A instalação do painel fica fora do useCapturarInstalacao de propósito: aquele registra
 * instalação na contagem de clientes do painel, e o painel instalado não é cliente.
 *
 * Devolve { podeInstalar, instalar, instalado }.
 */
export function useAppDoPainel() {
  const [convite, setConvite] = useState(null)
  const [instalado, setInstalado] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches)

  useEffect(() => {
    const trocas = [
      ['link[rel="manifest"]', 'href', '/painel.webmanifest'],
      ['meta[name="theme-color"]', 'content', '#5d2b04'],
      ['meta[name="apple-mobile-web-app-title"]', 'content', 'Painel'],
      ...[...document.querySelectorAll('link[rel="apple-touch-icon"]')].map((el, i) =>
        [`link[rel="apple-touch-icon"]:nth-of-type(${i + 1})`, 'href', '/painel-apple-180.png', el]),
    ]
    const antes = trocas.map(([sel, attr, valor, el]) => {
      const alvo = el ?? document.querySelector(sel)
      if (!alvo) return null
      const original = alvo.getAttribute(attr)
      alvo.setAttribute(attr, valor)
      return () => alvo.setAttribute(attr, original)
    })

    const aoPoderInstalar = (e) => {
      e.preventDefault()
      setConvite(e)
    }
    const aoInstalar = () => {
      setInstalado(true)
      setConvite(null)
    }
    window.addEventListener('beforeinstallprompt', aoPoderInstalar)
    window.addEventListener('appinstalled', aoInstalar)

    return () => {
      antes.forEach(desfazer => desfazer?.())
      window.removeEventListener('beforeinstallprompt', aoPoderInstalar)
      window.removeEventListener('appinstalled', aoInstalar)
    }
  }, [])

  const instalar = async () => {
    if (!convite) return
    convite.prompt()
    const { outcome } = await convite.userChoice
    if (outcome === 'accepted') setInstalado(true)
    setConvite(null)
  }

  return { podeInstalar: !!convite && !instalado, instalar, instalado }
}
