export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-400 py-8 mt-auto">
      <div className="max-w-6xl mx-auto px-4 text-center">
        <img src="/logo.png" alt="Coxita" className="w-16 h-16 object-contain mx-auto mb-2" />
        <p className="text-white font-semibold text-lg mb-2">Coxita</p>
        <p className="text-sm">As melhores coxinhas da cidade!</p>
        <p className="text-xs mt-4">&copy; {new Date().getFullYear()} Coxita. Todos os direitos reservados.</p>
      </div>
    </footer>
  )
}
