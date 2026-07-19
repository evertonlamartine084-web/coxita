import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signIn } from '../../services/auth'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/admin')
    } catch {
      toast.error('E-mail ou senha inválidos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand dots-sun px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="sr-only">Coxelli</h1>
          <div className="inline-block bg-cream border-3 border-brown px-6 py-4 shadow-[6px_6px_0_#3f6bb5]">
            <img src="/wordmark.png" alt="Coxelli" className="h-16 w-auto mx-auto" />
            <p className="font-display text-sm font-extrabold uppercase tracking-[0.15em] text-brown mt-2">Painel administrativo</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="bg-white border-3 border-brown p-6 space-y-4 shadow-[6px_6px_0_#ffcd5e]">
          <Input
            label="E-mail"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <Input
            label="Senha"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
      </div>
    </div>
  )
}
