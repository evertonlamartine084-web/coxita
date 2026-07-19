import { createElement } from 'react'

export default function Reveal({ children, delay = 0, as = 'div', className = '', ...props }) {
  return createElement(
    as,
    { ...props, className, 'data-delay': delay || undefined },
    children,
  )
}
