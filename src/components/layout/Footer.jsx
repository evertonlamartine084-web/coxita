export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-400 py-8 mt-auto">
      <div className="max-w-6xl mx-auto px-4 text-center">
        <p className="text-white font-semibold text-lg mb-2">🍗 Coxita</p>
        <p className="text-sm">As melhores coxinhas da cidade!</p>
        <p className="text-xs mt-4">&copy; {new Date().getFullYear()} Coxita. Todos os direitos reservados.</p>
      </div>
    </footer>
  )
}
