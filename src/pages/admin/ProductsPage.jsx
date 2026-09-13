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
  name: '', description: '', price: '', cash_price: '', category_id: '', active: true, featured: false, image_url: '',
}

export default function ProductsPage() {
  const [products, setProducts] = useState([])
  // Aba aberta: slug da categoria, 'todos' ou 'inativos'.
  const [aba, setAba] = useState('todos')
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
      cash_price: product.cash_price != null ? String(product.cash_price) : '',
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
        // Vazio volta a ser nulo: o produto passa a seguir o percentual das
        // settings, em vez de ficar com um preço de pix congelado.
        cash_price: form.cash_price === '' ? null : parseFloat(form.cash_price),
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

  const alternarAtivo = async (produto) => {
    try {
      await updateProduct(produto.id, { active: !produto.active })
      toast.success(produto.active ? 'Produto desativado.' : 'Produto ativado.')
      load()
    } catch {
      toast.error('Não consegui mudar o status.')
    }
  }

  if (loading) return <Loading />

  // Produto inativo nao aparece na aba da categoria dele: ele sumiu do
  // cardapio de proposito, e misturar os dois e o que fazia esta tela virar
  // uma lista de 53 linhas onde nao dava para ver o que esta no ar.
  const ativos = products.filter(p => p.active)
  const inativos = products.filter(p => !p.active)

  const abas = [
    { id: 'todos', label: 'Todos', total: ativos.length },
    ...categories
      .map(c => ({
        id: c.slug,
        label: c.name,
        total: ativos.filter(p => p.categories?.slug === c.slug).length,
      }))
      .filter(a => a.total > 0),
    { id: 'inativos', label: 'Fora do cardápio', total: inativos.length },
  ]

  const visiveis =
    aba === 'inativos' ? inativos
    : aba === 'todos' ? ativos
    : ativos.filter(p => p.categories?.slug === aba)


  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Produtos</h1>
        <Button onClick={openNew}>+ Novo Produto</Button>
      </div>

      {/* Abas: uma por categoria que tem produto no ar, mais os que sairam */}
      <div className="flex flex-wrap gap-2 mb-4">
        {abas.map(a => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              aba === a.id
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-300 hover:border-gray-900'
            } ${a.id === 'inativos' && aba !== a.id ? 'text-gray-400' : ''}`}
          >
            {a.label}
            <span className={`ml-1.5 ${aba === a.id ? 'text-gray-300' : 'text-gray-400'}`}>{a.total}</span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {visiveis.length === 0 ? (
          <p className="text-text-light text-center py-8">
            {aba === 'inativos' ? 'Nenhum produto fora do cardápio.' : 'Nenhum produto nesta aba.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Produto</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Categoria</th>
                  <th className="text-left px-4 py-3 font-medium">Cartão</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Pix</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visiveis.map(p => (
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
                          <span className="text-xs text-text-light">
                            {p.pack_size ? `${p.pack_size} un` : 'unidade'}
                            {p.featured && ' · ⭐ destaque'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-text-light">{p.categories?.name || '-'}</td>
                    <td className="px-4 py-3 font-medium">{formatCurrency(p.price)}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-text-light">
                      {p.cash_price ? formatCurrency(p.cash_price) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3 justify-end">
                        <button onClick={() => openEdit(p)} className="text-primary hover:underline text-sm">Editar</button>
                        <button
                          onClick={() => alternarAtivo(p)}
                          className="text-gray-500 hover:underline text-sm whitespace-nowrap"
                        >
                          {p.active ? 'Tirar do ar' : 'Pôr no ar'}
                        </button>
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
            <Input
              label="Preço no pix"
              name="cash_price"
              type="number"
              step="0.01"
              value={form.cash_price}
              onChange={handleChange}
              placeholder="vazio = usa o desconto padrão"
            />
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
