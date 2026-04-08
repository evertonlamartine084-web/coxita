export default function Input({ label, error, className = '', ...props }) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-semibold text-text-warm mb-1.5 font-display">
          {label}
        </label>
      )}
      <input
        className={`w-full px-4 py-2.5 border-2 rounded-xl outline-none transition-all duration-200 font-body text-sm
          ${error ? 'border-danger bg-danger/5' : 'border-border focus:border-primary focus:shadow-sm focus:shadow-primary/10'}`}
        {...props}
      />
      {error && <p className="text-danger text-xs mt-1.5 font-semibold">{error}</p>}
    </div>
  )
}
