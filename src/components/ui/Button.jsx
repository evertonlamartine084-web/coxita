export default function Button({ children, variant = 'primary', size = 'md', className = '', ...props }) {
  const base = 'inline-flex items-center justify-center font-display font-bold rounded-2xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 cursor-pointer'

  const variants = {
    primary: 'bg-primary text-white hover:bg-primary-dark hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-0.5',
    secondary: 'bg-secondary text-primary-dark hover:bg-secondary-dark hover:shadow-lg hover:shadow-secondary/30 hover:-translate-y-0.5',
    outline: 'border-2 border-primary text-primary hover:bg-primary hover:text-white hover:shadow-lg hover:-translate-y-0.5',
    danger: 'bg-danger text-white hover:bg-red-700 hover:shadow-lg',
    ghost: 'text-primary hover:bg-primary/8',
    festive: 'bg-gradient-to-r from-primary to-primary-light text-white hover:shadow-xl hover:shadow-primary/25 hover:-translate-y-0.5',
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
