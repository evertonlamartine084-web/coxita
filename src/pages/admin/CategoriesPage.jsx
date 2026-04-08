import { useEffect, useState } from 'react'
import { getAllCategories, createCategory, updateCategory, deleteCategory } from '../../services/categories'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import Loading from '../../components/ui/Loading'
import toast from 'react-hot-toast'

export default function CategoriesPage() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    getAllCategories()
      .then(setCategories)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const slugify = (text) =>
    text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

  const openNew = () => {
    setEditing(null)
    setName('')
    setModalOpen(true)
  }

  const openEdit = (cat) => {
    setEditing(cat)
    setName(cat.name)
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      if (editing) {
        await updateCategory(editing.id, { name: name.trim(), slug: slugify(name) })
        toast.success('Categoria atualizada!')
      } else {
        await createCategory({
          name: name.trim(),
          slug: slugify(name),
          sort_order: categories.length + 1,
        })
        toast.success('Categoria criada!')
      }
      setModalOpen(false)
      load()
    } catch {
      toast.error('Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Excluir esta categoria?')) return
    try {
      await deleteCategory(id)
      toast.success('Excluída!')
      load()
    } catch {
      toast.error('Erro ao excluir.')
    }
  }

  const toggleActive = async (cat) => {
    try {
      await updateCategory(cat.id, { active: !cat.active })
      load()
    } catch {
      toast.error('Erro.')
    }
  }

  if (loading) return <Loading />

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Categorias</h1>
        <Button onClick={openNew}>+ Nova Categoria</Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {categories.length === 0 ? (
          <p className="text-text-light text-center py-8">Nenhuma categoria.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {categories.map(cat => (
              <div key={cat.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                <div>
                  <span className="font-medium">{cat.name}</span>
                  <span className="text-text-light text-sm ml-2">({cat.slug})</span>
                  {!cat.active && <span className="text-danger text-xs ml-2">Inativa</span>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => toggleActive(cat)} className="text-sm text-text-light hover:underline">
                    {cat.active ? 'Desativar' : 'Ativar'}
                  </button>
                  <button onClick={() => openEdit(cat)} className="text-primary hover:underline text-sm">Editar</button>
                  <button onClick={() => handleDelete(cat.id)} className="text-danger hover:underline text-sm">Excluir</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Categoria' : 'Nova Categoria'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Nome" value={name} onChange={e => setName(e.target.value)} />
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
