import { createElement, Fragment } from 'react'

/**
 * Titulo que entra palavra por palavra.
 *
 * Divide por palavra, nao por letra: letra a letra em titulo grande vira
 * ruido -- o olho passa a acompanhar a animacao em vez de ler a frase.
 *
 * A animacao inteira e CSS (`.palavra` no index.css); aqui so distribuimos o
 * atraso de cada palavra. Sob `prefers-reduced-motion` o proprio CSS entrega
 * tudo visivel, sem precisar de ramo em JS.
 *
 * Acessibilidade: o texto real fica num `aria-label` no container e os
 * pedacos vao com `aria-hidden`, senao o leitor de tela soletra palavra por
 * palavra como se fossem itens separados.
 */
export default function SplitText({
  children,
  as = 'span',
  className = '',
  delay = 0,
  passo = 55,
  ...props
}) {
  const texto = String(children)
  const palavras = texto.split(' ')

  return createElement(
    as,
    { ...props, className, 'aria-label': texto },
    palavras.map((palavra, i) => (
      // O espaco entre palavras precisa ser um nó de texto de verdade, fora
      // do `inline-block`. Simular com margem muda a largura da linha e faz
      // um titulo que cabia em uma linha quebrar em duas.
      <Fragment key={`${palavra}-${i}`}>
        <span
          className="palavra"
          aria-hidden="true"
          style={{ '--palavra-delay': `${delay + i * passo}ms` }}
        >
          {palavra}
        </span>
        {i < palavras.length - 1 ? ' ' : null}
      </Fragment>
    )),
  )
}
