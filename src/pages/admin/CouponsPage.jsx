import { useEffect, useState } from 'react'
import { getCoupons, createCoupon, deleteCoupon, updateCoupon } from '../../services/coupons'
import { formatCurrency, formatDate } from '../../utils/format'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Loading from '../../components/ui/Loading'
import toast from 'react-hot-toast'

const emptyCoupon = {
  code: '',
  discount_type: 'percent',
  discount_value: '',
  min_order: '',
  max_uses: '',
  expires_at: '',
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyCoupon)
  const [saving, setSaving] = useState(false)

  const load = () => {
    getCoupons()
      .then(setCoupons)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.code || !form.discount_value) {
      toast.error('Preencha codigo e valor')
      return
    }
    setSaving(true)
    try {
      await createCoupon({
        code: form.code,
        discount_type: form.discount_type,
        discount_value: parseFloat(form.discount_value),
        min_order: form.min_order ? parseFloat(form.min_order) : 0,
        max_uses: form.max_uses ? parseInt(form.max_uses) : null,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      })
      toast.success('Cupom criado!')
      setForm(emptyCoupon)
      setShowForm(false)
      load()
    } catch (err) {
      toast.error(err.message?.includes('unique') ? 'Codigo ja existe' : 'Erro ao criar cupom')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (coupon) => {
    try {
      await updateCoupon(coupon.id, { active: !coupon.active })
      toast.success(coupon.active ? 'Cupom desativado' : 'Cupom ativado')
      load()
    } catch {
      toast.error('Erro ao atualizar')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Excluir este cupom?')) return
    try {
      await deleteCoupon(id)
      toast.success('Cupom excluido')
      load()
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  if (loading) return <Loading />

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Cupons de Desconto</h1>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancelar' : '+ Novo Cupom'}
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Codigo *"
              value={form.code}
              onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="Ex: COXINHA10"
            />
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1.5">Tipo *</label>
              <select
                value={form.discount_type}
                onChange={e => setForm(f => ({ ...f, discount_type: e.target.value }))}
                className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl outline-none focus:border-primary text-sm"
              >
                <option value="percent">Porcentagem (%)</option>
                <option value="fixed">Valor fixo (R$)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input
              label={form.discount_type === 'percent' ? 'Desconto (%) *' : 'Desconto (R$) *'}
              type="number"
              step="0.01"
              value={form.discount_value}
              onChange={e => setForm(f => ({ ...f, discount_value: e.target.value }))}
              placeholder={form.discount_type === 'percent' ? 'Ex: 10' : 'Ex: 5.00'}
            />
            <Input
              label="Pedido minimo (R$)"
              type="number"
              step="0.01"
              value={form.min_order}
              onChange={e => setForm(f => ({ ...f, min_order: e.target.value }))}
              placeholder="0"
            />
            <Input
              label="Limite de usos"
              type="number"
              value={form.max_uses}
              onChange={e => setForm(f => ({ ...f, max_uses: e.target.value }))}
              placeholder="Ilimitado"
            />
          </div>
          <Input
            label="Expira em"
            type="datetime-local"
            value={form.expires_at}
            onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
          />
          <Button type="submit" disabled={saving}>
            {saving ? 'Criando...' : 'Criar Cupom'}
          </Button>
        </form>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {coupons.length === 0 ? (
          <p className="text-gray-500 text-center py-8">Nenhum cupom criado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Codigo</th>
                  <th className="text-left px-4 py-3 font-medium">Desconto</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Min.</th>
                  <th className="text-left px-4 py-3 font-medium">Usos</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {coupons.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-bold text-primary">{c.code}</td>
                    <td className="px-4 py-3">
                      {c.discount_type === 'percent' ? `${c.discount_value}%` : formatCurrency(c.discount_value)}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-500">
                      {c.min_order > 0 ? formatCurrency(c.min_order) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {c.used_count}{c.max_uses ? `/${c.max_uses}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggle(c)}
                        className={`text-xs font-bold px-2.5 py-1 rounded-full cursor-pointer ${
                          c.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {c.active ? 'Ativo' : 'Inativo'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="text-red-500 hover:underline text-sm cursor-pointer"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
