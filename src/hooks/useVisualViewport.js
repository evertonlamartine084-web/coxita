import { useEffect, useState } from 'react'

function medir() {
  if (typeof window === 'undefined') return { top: 0, height: 0 }
  const vv = window.visualViewport
  if (!vv) return { top: 0, height: window.innerHeight }
  return { top: vv.offsetTop, height: vv.height }
}

/**
 * Area realmente visivel da tela, descontando o teclado virtual.
 *
 * No iOS o teclado nao encolhe a pagina: `100vh` continua medindo a tela
 * inteira e o Safari "empurra" o viewport para revelar o campo focado --
 * qualquer modal `fixed` dimensionado em vh desmonta. A visualViewport e a
 * unica fonte confiavel da area util; `top` acompanha o deslocamento que o
 * iOS aplica enquanto o teclado esta aberto.
 *
 * @param {boolean} ativo escutar somente enquanto necessario (ex.: modal aberto)
 */
export function useVisualViewport(ativo = true) {
  const [area, setArea] = useState(medir)

  useEffect(() => {
    if (!ativo) return
    const vv = window.visualViewport
    const atualizar = () => setArea(medir())
    atualizar()
    if (!vv) return
    vv.addEventListener('resize', atualizar)
    vv.addEventListener('scroll', atualizar)
    return () => {
      vv.removeEventListener('resize', atualizar)
      vv.removeEventListener('scroll', atualizar)
    }
  }, [ativo])

  return area
}
