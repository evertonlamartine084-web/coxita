export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <img
        src="/logo.png"
        alt="Carregando..."
        className="w-16 h-16 object-contain animate-bounce mb-3 opacity-60"
      />
      <p className="text-text-light text-sm font-display font-semibold">Carregando...</p>
    </div>
  )
}
