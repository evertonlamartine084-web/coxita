import { Outlet } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'
import InstallBar from '../ui/InstallBar'
import InstallPrompt from '../ui/InstallPrompt'
import { useCapturarInstalacao } from '../../hooks/useCapturarInstalacao'

export default function PublicLayout() {
  useCapturarInstalacao()

  return (
    <div className="min-h-screen flex flex-col">
      <InstallBar />
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <InstallPrompt />
    </div>
  )
}
