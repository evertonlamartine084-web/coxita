import { useEffect, useState } from 'react'
import { getSettings, updateSettings } from '../../services/settings'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Loading from '../../components/ui/Loading'
import toast from 'react-hot-toast'

const fields = [
  { key: 'store_name', label: 'Nome da Loja' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'address', label: 'Endereço' },
  { key: 'opening_hours', label: 'Horário de Funcionamento (exibição)', placeholder: 'Ex: Seg-Sex: 11h-21h | Sáb-Dom: 11h-22h' },
  { key: 'opening_time', label: 'Horário de abertura', type: 'time' },
  { key: 'closing_time', label: 'Horário de fechamento', type: 'time' },
  { key: 'estimated_delivery', label: 'Tempo estimado de entrega', placeholder: 'Ex: 30-45 min' },
  { key: 'delivery_fee', label: 'Taxa de Entrega (R$)', type: 'number' },
  { key: 'min_order', label: 'Pedido Mínimo (R$)', type: 'number' },
  { key: 'pix_key', label: 'Chave Pix' },
  { key: 'pix_name', label: 'Nome no Pix' },
  { key: 'loyalty_goal', label: 'Fidelidade: coxinhas para ganhar 1 grátis', type: 'number' },
]

const bannerFields = [
  { key: 'banner_active', label: 'Banner ativo (sim/nao)', placeholder: 'sim ou nao' },
  { key: 'banner_text', label: 'Texto do banner', placeholder: 'Ex: Combo familia com 20% OFF hoje!' },
  { key: 'banner_emoji', label: 'Emoji do banner', placeholder: 'Ex: 🔥' },
  { key: 'banner_link', label: 'Link do banner (opcional)', placeholder: '/cardapio' },
]

export default function SettingsPage() {
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getSettings()
      .then(setForm)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const handleChange = (key, value) => {
    setForm(f => ({ ...f, [key]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updateSettings(form)
      toast.success('Configurações salvas!')
    } catch {
      toast.error('Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Loading />

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Configurações</h1>
      <form onSubmit={handleSubmit} className="max-w-xl space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-bold text-lg text-gray-700 mb-2">Geral</h2>
          {fields.map(f => (
            <Input
              key={f.key}
              label={f.label}
              type={f.type || 'text'}
              step={f.type === 'number' ? '0.01' : undefined}
              value={form[f.key] || ''}
              onChange={e => handleChange(f.key, e.target.value)}
              placeholder={f.placeholder}
            />
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-bold text-lg text-gray-700 mb-2">Banner Promocional</h2>
          <p className="text-gray-400 text-sm -mt-2">Aparece no topo da home para todos os clientes</p>
          {bannerFields.map(f => (
            <Input
              key={f.key}
              label={f.label}
              value={form[f.key] || ''}
              onChange={e => handleChange(f.key, e.target.value)}
              placeholder={f.placeholder}
            />
          ))}
        </div>

        <Button type="submit" disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar Configurações'}
        </Button>
      </form>
    </div>
  )
}
