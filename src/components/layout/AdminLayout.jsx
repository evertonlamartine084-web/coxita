import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { HiHome, HiShoppingBag, HiTag, HiClipboardList, HiCog, HiLogout, HiStar, HiTicket } from 'react-icons/hi'
import { signOut } from '../../services/auth'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../services/supabase'
import { playOrderAlert } from '../../utils/alertSound'
import toast from 'react-hot-toast'

const navItems = [
  { to: '/admin', icon: HiHome, label: 'Dashboard' },
  { to: '/admin/pedidos', icon: HiClipboardList, label: 'Pedidos' },
  { to: '/admin/produtos', icon: HiShoppingBag, label: 'Produtos' },
  { to: '/admin/categorias', icon: HiTag, label: 'Categorias' },
  { to: '/admin/cupons', icon: HiTicket, label: 'Cupons' },
  { to: '/admin/avaliacoes', icon: HiStar, label: 'Avaliações' },
  { to: '/admin/configuracoes', icon: HiCog, label: 'Configurações' },
]

export default function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const lastOrderCountRef = useRef(null)

  // Poll for new orders every 15 seconds
  useEffect(() => {
    const checkNewOrders = async () => {
      try {
        const { count } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })

        if (lastOrderCountRef.current !== null && count > lastOrderCountRef.current) {
          const newCount = count - lastOrderCountRef.current
          setPendingCount(c => c + newCount)
          const soundOn = localStorage.getItem('coxita_admin_sound') !== 'off'
          if (soundOn) playOrderAlert()
          toast.success(`${newCount} novo(s) pedido(s)!`, { duration: 5000 })
        }
        lastOrderCountRef.current = count
      } catch (e) {
        console.warn('Error checking orders:', e)
      }
    }

    checkNewOrders()
    const interval = setInterval(checkNewOrders, 15000)
    return () => clearInterval(interval)
  }, [])

  // Reset pending count when visiting orders page
  useEffect(() => {
    if (location.pathname === '/admin/pedidos') {
      setPendingCount(0)
    }
  }, [location.pathname])

  const handleLogout = async () => {
    await signOut()
    navigate('/admin/login')
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-gray-900 text-white transform transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Coxita" className="w-8 h-8 object-contain" />
            <h1 className="text-xl font-bold">Coxita Admin</h1>
          </div>
        </div>
        <nav className="p-4 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => {
            const active = location.pathname === to
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg no-underline transition-colors ${
                  active ? 'bg-primary text-white' : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                <Icon size={20} />
                <span className="flex-1">{label}</span>
                {to === '/admin/pedidos' && pendingCount > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
                    {pendingCount}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-700">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 text-gray-300 hover:text-white w-full rounded-lg hover:bg-gray-800 transition-colors"
          >
            <HiLogout size={20} />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white shadow-sm px-4 py-3 flex items-center lg:hidden">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-600 text-2xl mr-3">☰</button>
          <span className="font-semibold">Coxita Admin</span>
        </header>
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
