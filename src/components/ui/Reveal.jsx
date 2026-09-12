import { createElement, useEffect, useState } from 'react'

/**
 * Entrada por scroll: opacidade + um deslocamento curto para o olho registrar
 * direcao. O `delay` (em ms) serve para escalonar irmaos.
 *
 * Sem biblioteca de animacao: a transicao mora na classe `.reveal` do
 * index.css e o unico trabalho do JS e virar `data-visible` quando o bloco
 * entra na tela. `threshold: 0.2` dispara quando um quinto do bloco apareceu
 * -- em cards altos, esperar o elemento inteiro anima fora da tela.
 *
 * Usa *callback ref* (o setter de estado) em vez de useRef: as paginas montam
 * o conteudo depois de um `if (loading) return <Loading />`, e com useRef o
 * efeito rodaria no mount com `current` nulo e nunca seria reavaliado.
 */
export default function Reveal({
  children,
  delay = 0,
  as = 'div',
  className = '',
  style,
  ...props
}) {
  const [elemento, setElemento] = useState(null)
  // Sem IntersectionObserver, ja nasce visivel em vez de ficar invisivel para
  // sempre: falhar mostrando o conteudo e melhor que falhar escondendo.
  const [visivel, setVisivel] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    if (!elemento || visivel) return

    const observador = new IntersectionObserver(
      ([entrada]) => {
        // Uma vez so: re-animar no scroll de volta le como falha, nao enfeite.
        if (!entrada.isIntersecting) return
        setVisivel(true)
        observador.disconnect()
      },
      { threshold: 0.2 },
    )

    observador.observe(elemento)
    return () => observador.disconnect()
  }, [elemento, visivel])

  return createElement(
    as,
    {
      ...props,
      ref: setElemento,
      className: `reveal ${className}`.trim(),
      'data-visible': visivel || undefined,
      style: delay ? { ...style, '--reveal-delay': `${delay}ms` } : style,
    },
    children,
  )
}
