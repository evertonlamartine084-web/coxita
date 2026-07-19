import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { HiHome, HiShoppingBag, HiTag, HiClipboardList, HiCog, HiLogout, HiStar, HiTicket } from 'react-icons/hi'
import { signOut } from '../../services/auth'
import { createElement, useState, useEffect, useRef } from 'react'
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

  const displayedPendingCount = location.pathname === '/admin/pedidos' ? 0 : pendingCount

  const handleLogout = async () => {
    await signOut()
    navigate('/admin/login')
  }

  return (
    <div className="admin-shell min-h-screen flex bg-cream">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:sticky lg:top-0 lg:h-screen inset-y-0 left-0 z-50 w-72 bg-brown text-white transform transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-3 gingham-blue border-b-2 border-secondary" aria-hidden="true" />
        <div className="p-5 border-b border-white/15">
          <div className="bg-cream border-2 border-secondary p-3 shadow-[4px_4px_0_#ffcd5e]">
            <img src="/wordmark.png" alt="Coxelli" className="h-10 w-auto object-contain" />
            <p className="font-display text-xs font-extrabold uppercase tracking-[0.16em] text-brown mt-1">Painel da cozinha</p>
          </div>
        </div>
        <nav className="p-4 space-y-1.5">
          {navItems.map(({ to, icon, label }) => {
            const active = location.pathname === to
            return (
              <Link
                key={to}
                to={to}
                onClick={() => {
                  setSidebarOpen(false)
                  if (to === '/admin/pedidos') setPendingCount(0)
                }}
                className={`flex items-center gap-3 px-3 py-3 border-2 no-underline font-semibold transition-colors ${
                  active ? 'bg-secondary border-secondary text-brown shadow-[3px_3px_0_#3f6bb5]' : 'border-transparent text-cream/80 hover:bg-white/10 hover:text-white'
                }`}
              >
                {createElement(icon, { size: 20 })}
                <span className="flex-1">{label}</span>
                {to === '/admin/pedidos' && displayedPendingCount > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
                    {displayedPendingCount}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/15 bg-brown">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 text-cream/70 hover:text-white w-full border-2 border-transparent hover:border-white/20 transition-colors"
          >
            <HiLogout size={20} />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-cream border-b-4 border-festa px-4 py-3 flex items-center lg:hidden sticky top-0 z-30">
          <button onClick={() => setSidebarOpen(true)} className="text-brown text-2xl mr-3" aria-label="Abrir menu">☰</button>
          <img src="/wordmark.png" alt="Coxelli" className="h-9 w-auto" />
          <span className="ml-auto font-display text-xs font-extrabold uppercase tracking-widest text-festa">Admin</span>
        </header>
        <main className="admin-content flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
