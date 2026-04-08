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
  { key: 'opening_hours', label: 'Horário de Funcionamento' },
  { key: 'delivery_fee', label: 'Taxa de Entrega (R$)', type: 'number' },
  { key: 'min_order', label: 'Pedido Mínimo (R$)', type: 'number' },
  { key: 'pix_key', label: 'Chave Pix' },
  { key: 'pix_name', label: 'Nome no Pix' },
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
      <form onSubmit={handleSubmit} className="max-w-xl bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        {fields.map(f => (
          <Input
            key={f.key}
            label={f.label}
            type={f.type || 'text'}
            step={f.type === 'number' ? '0.01' : undefined}
            value={form[f.key] || ''}
            onChange={e => handleChange(f.key, e.target.value)}
          />
        ))}
        <Button type="submit" disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar Configurações'}
        </Button>
      </form>
    </div>
  )
}
