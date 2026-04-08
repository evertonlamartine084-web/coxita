import { useEffect, useState } from 'react'
import { getAllProducts, createProduct, updateProduct, deleteProduct, uploadProductImage } from '../../services/products'
import { getAllCategories } from '../../services/categories'
import { formatCurrency } from '../../utils/format'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import Loading from '../../components/ui/Loading'
import toast from 'react-hot-toast'

const emptyProduct = {
  name: '', description: '', price: '', category_id: '', active: true, featured: false, image_url: '',
}

export default function ProductsPage() {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyProduct)
  const [imageFile, setImageFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([getAllProducts(), getAllCategories()])
      .then(([p, c]) => { setProducts(p); setCategories(c) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openNew = () => {
    setEditing(null)
    setForm(emptyProduct)
    setImageFile(null)
    setModalOpen(true)
  }

  const openEdit = (product) => {
    setEditing(product)
    setForm({
      name: product.name,
      description: product.description || '',
      price: String(product.price),
      category_id: product.category_id || '',
      active: product.active,
      featured: product.featured,
      image_url: product.image_url || '',
    })
    setImageFile(null)
    setModalOpen(true)
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim() || !form.price) {
      toast.error('Nome e preço são obrigatórios.')
      return
    }
    setSaving(true)
    try {
      let image_url = form.image_url
      if (imageFile) {
        image_url = await uploadProductImage(imageFile)
      }
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price: parseFloat(form.price),
        category_id: form.category_id || null,
        active: form.active,
        featured: form.featured,
        image_url,
      }
      if (editing) {
        await updateProduct(editing.id, payload)
        toast.success('Produto atualizado!')
      } else {
        await createProduct(payload)
        toast.success('Produto criado!')
      }
      setModalOpen(false)
      load()
    } catch {
      toast.error('Erro ao salvar produto.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Tem certeza que deseja excluir este produto?')) return
    try {
      await deleteProduct(id)
      toast.success('Produto excluído!')
      load()
    } catch {
      toast.error('Erro ao excluir.')
    }
  }

  if (loading) return <Loading />

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Produtos</h1>
        <Button onClick={openNew}>+ Novo Produto</Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {products.length === 0 ? (
          <p className="text-text-light text-center py-8">Nenhum produto cadastrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Produto</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Categoria</th>
                  <th className="text-left px-4 py-3 font-medium">Preço</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {p.image_url ? (
                          <img src={p.image_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">🍗</div>
                        )}
                        <div>
                          <p className="font-medium">{p.name}</p>
                          {p.featured && <span className="text-xs text-yellow-600">⭐ Destaque</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-text-light">{p.categories?.name || '-'}</td>
                    <td className="px-4 py-3 font-medium">{formatCurrency(p.price)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${p.active ? 'text-success' : 'text-danger'}`}>
                        {p.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => openEdit(p)} className="text-primary hover:underline text-sm">Editar</button>
                        <button onClick={() => handleDelete(p.id)} className="text-danger hover:underline text-sm">Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Product Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Produto' : 'Novo Produto'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Nome *" name="name" value={form.name} onChange={handleChange} />
          <div>
            <label className="block text-sm font-medium text-text mb-1">Descrição</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              className="w-full px-3 py-2 border border-border rounded-lg outline-none focus:border-primary resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Preço *" name="price" type="number" step="0.01" value={form.price} onChange={handleChange} />
            <div>
              <label className="block text-sm font-medium text-text mb-1">Categoria</label>
              <select
                name="category_id"
                value={form.category_id}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-border rounded-lg outline-none focus:border-primary"
              >
                <option value="">Sem categoria</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-1">Imagem</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files[0])}
              className="w-full text-sm"
            />
            {form.image_url && !imageFile && (
              <img src={form.image_url} alt="" className="w-20 h-20 rounded-lg object-cover mt-2" />
            )}
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" name="active" checked={form.active} onChange={handleChange} className="w-4 h-4" />
              <span className="text-sm">Ativo</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" name="featured" checked={form.featured} onChange={handleChange} className="w-4 h-4" />
              <span className="text-sm">Destaque</span>
            </label>
          </div>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
