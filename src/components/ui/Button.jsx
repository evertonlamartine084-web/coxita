export default function Button({ children, variant = 'primary', size = 'md', className = '', ...props }) {
  // O hover so troca a cor de fundo; o press encolhe 2%. Levantar o botao e
  // encolher 5% no clique le como brinquedo, nao como controle.
  const base =
    'inline-flex items-center justify-center font-display font-extrabold uppercase rounded-sm cursor-pointer tracking-[0.04em] ' +
    'transition-[background-color,color,border-color,opacity,transform] duration-[--duration-fast] ease-[--ease-interaction] ' +
    'active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

  const variants = {
    primary: 'bg-brown text-white border-2 border-brown hover:bg-primary hover:border-primary shadow-[4px_4px_0_#ffcd5e]',
    secondary: 'bg-secondary text-text border-2 border-brown hover:bg-brand-amber shadow-[4px_4px_0_#5d2b04]',
    outline: 'border-2 border-brown text-brown hover:bg-brown hover:text-white',
    danger: 'bg-danger text-white hover:bg-red-700',
    ghost: 'text-primary hover:text-brown underline underline-offset-4 decoration-2',
    festive: 'bg-primary text-white hover:bg-primary-dark',
  }

  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-3.5 text-lg',
  }

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
