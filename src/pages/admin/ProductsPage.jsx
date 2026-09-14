import { useEffect, useState } from 'react'
import { getAllProducts, createProduct, updateProduct, deleteProduct, uploadProductImage } from '../../services/products'
import { getAllCategories } from '../../services/categories'
import { getFlavors } from '../../services/flavors'
import { getGradePorSabor, salvarPrecoDoSabor } from '../../services/precoPorSabor'
import { formatCurrency } from '../../utils/format'
import { catalogText } from '../../utils/catalogText'
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
  // Familia aberta para editar preco por tamanho.
  const [familia, setFamilia] = useState(null)
  const [precosFamilia, setPrecosFamilia] = useState({})
  const [salvandoFamilia, setSalvandoFamilia] = useState(false)
  const [sabores, setSabores] = useState([])
  const [grade, setGrade] = useState([])
  const [precosSabor, setPrecosSabor] = useState({})
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyProduct)
  const [imageFile, setImageFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([getAllProducts(), getAllCategories(), getFlavors(), getGradePorSabor()])
      .then(([p, c, f, g]) => { setProducts(p); setCategories(c); setSabores(f); setGrade(g) })
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

  // "Cento de Salgados" e "Meio Cento de Salgados" nao sao dois produtos: sao
  // o mesmo produto em dois tamanhos. A tela agrupa o que a cozinha chama de
  // um produto so -- mesma categoria e mesmo sabor fixo -- e o preco de cada
  // tamanho vira uma linha dentro dele.
  const chaveDaFamilia = p => `${p.category_id}|${p.fixed_flavor_id ?? ''}`

  const familias = []
  const avulsos = []
  const porChave = new Map()
  for (const p of visiveis) {
    if (!p.pack_size) { avulsos.push(p); continue }
    const chave = chaveDaFamilia(p)
    if (!porChave.has(chave)) {
      const nova = {
        chave,
        nome: p.sabor_fixo?.name ?? p.categories?.name ?? 'Pacotes',
        categoria: p.categories?.name,
        tamanhos: [],
      }
      porChave.set(chave, nova)
      familias.push(nova)
    }
    porChave.get(chave).tamanhos.push(p)
  }
  for (const f of familias) f.tamanhos.sort((a, b) => a.pack_size - b.pack_size)

  // Pacote misto de grupo com preco por sabor -- o pastel -- vira um card por
  // sabor, como o doce ja e. O card do pacote some: o preco dele e so o piso,
  // recalculado a partir do sabor mais barato quando a grade e salva, e nao um
  // produto que a cozinha pensa separado.
  const cards = familias.flatMap(f => {
    const doGrupo = saboresDaFamilia(f)
    if (doGrupo.length === 0) return [f]
    return doGrupo.map(sb => ({
      chave: `${f.chave}|${sb.id}`,
      nome: catalogText(sb.name),
      categoria: f.categoria,
      sabor: sb,
      familia: f,
      tamanhos: f.tamanhos.map(t => {
        const linha = grade.find(l => l.flavor_id === sb.id && l.pack_size === t.pack_size)
        return {
          ...t,
          price: linha ? Number(linha.price) : Number(t.price),
          cash_price: linha ? Number(linha.cash_price) : t.cash_price,
          semPrecoProprio: !linha,
        }
      }),
    }))
  })

  // Pacote misto de um grupo cujos sabores tem preco proprio: a grade entra no
  // mesmo modal. E o caso do pastel, onde o preco do card e so o piso -- o do
  // sabor mais barato -- e o valor de verdade sai do que o cliente monta.
  const saboresDaFamilia = (f) => {
    const pacote = f?.tamanhos?.[0]
    if (!pacote || pacote.fixed_flavor_id || !pacote.flavor_group) return []
    return sabores.filter(sb => sb.group_slug === pacote.flavor_group && sb.active)
  }

  const abrirFamilia = (f, saborFoco = null) => {
    setFamilia({ ...f, saborFoco })
    setPrecosFamilia(Object.fromEntries(f.tamanhos.map(t => [
      t.id,
      { price: String(t.price), cash_price: t.cash_price != null ? String(t.cash_price) : '' },
    ])))
    const campos = {}
    for (const sb of saboresDaFamilia(f)) {
      for (const t of f.tamanhos) {
        const linha = grade.find(l => l.flavor_id === sb.id && l.pack_size === t.pack_size)
        campos[`${sb.id}:${t.pack_size}`] = {
          price: linha ? String(linha.price) : '',
          cash_price: linha ? String(linha.cash_price) : '',
        }
      }
    }
    setPrecosSabor(campos)
  }

  const salvarFamilia = async (e) => {
    e.preventDefault()
    setSalvandoFamilia(true)
    try {
      for (const t of familia.tamanhos) {
        const campos = precosFamilia[t.id]
        const price = parseFloat(String(campos.price).replace(',', '.'))
        const cash = campos.cash_price === '' ? null : parseFloat(String(campos.cash_price).replace(',', '.'))
        if (!Number.isFinite(price) || price <= 0) throw new Error(`Preço inválido em ${t.name}`)
        if (cash != null && cash > price) throw new Error(`No ${t.name}, o pix não pode ser maior que o cartão`)
        if (price === Number(t.price) && cash === (t.cash_price ?? null)) continue
        await updateProduct(t.id, { price, cash_price: cash })
      }
      for (const sb of (familia.saborFoco ? [familia.saborFoco] : saboresDaFamilia(familia))) {
        for (const t of familia.tamanhos) {
          const chave = `${sb.id}:${t.pack_size}`
          const campos = precosSabor[chave] ?? {}
          const vazio = String(campos.price ?? '').trim() === ''
          const price = vazio ? null : parseFloat(String(campos.price).replace(',', '.'))
          const cash = vazio ? null : parseFloat(String(campos.cash_price).replace(',', '.'))
          if (!vazio && (!Number.isFinite(price) || !Number.isFinite(cash))) {
            throw new Error(`Preço inválido em ${sb.name} ${t.pack_size} un`)
          }
          if (!vazio && cash > price) {
            throw new Error(`Em ${sb.name} ${t.pack_size} un, o pix não pode ser maior que o cartão`)
          }
          const antes = grade.find(l => l.flavor_id === sb.id && l.pack_size === t.pack_size)
          const mudou = vazio
            ? Boolean(antes)
            : !antes || Number(antes.price) !== price || Number(antes.cash_price) !== cash
          if (mudou) {
            await salvarPrecoDoSabor({ flavor_id: sb.id, pack_size: t.pack_size, price, cash_price: cash })
          }
        }
      }

      // O piso do pacote e o sabor mais barato: e ele que o cardapio mostra
      // antes de o cliente escolher o recheio. Recalculado aqui para nao
      // prometer menos do que qualquer combinacao vai custar.
      const doGrupo = saboresDaFamilia(familia)
      if (doGrupo.length > 0) {
        const atualizada = await getGradePorSabor()
        for (const t of familia.tamanhos) {
          const linhas = atualizada.filter(l => l.pack_size === t.pack_size &&
            doGrupo.some(sb => sb.id === l.flavor_id))
          if (linhas.length === 0) continue
          const piso = Math.min(...linhas.map(l => Number(l.price)))
          const pisoPix = Math.min(...linhas.map(l => Number(l.cash_price)))
          if (piso !== Number(t.price) || pisoPix !== (t.cash_price ?? null)) {
            await updateProduct(t.id, { price: piso, cash_price: pisoPix })
          }
        }
      }

      toast.success('Preços atualizados!')
      setFamilia(null)
      load()
    } catch (erro) {
      toast.error(erro.message || 'Não consegui salvar.')
    } finally {
      setSalvandoFamilia(false)
    }
  }


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

      {cards.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 mb-6">
          {cards.map(f => (
            <div key={f.chave} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">{f.nome}</p>
                  <p className="text-xs text-gray-500">
                    {f.categoria} · {f.tamanhos.length} {f.tamanhos.length === 1 ? 'tamanho' : 'tamanhos'}
                  </p>
                </div>
                <button
                  onClick={() => abrirFamilia(f.familia ?? f, f.sabor)}
                  className="text-primary hover:underline text-sm shrink-0"
                >
                  Editar preços
                </button>
              </div>

              <table className="w-full text-sm mt-3">
                <tbody>
                  {f.tamanhos.map(t => (
                    <tr key={t.id} className="border-t border-gray-100">
                      <td className="py-1.5 text-gray-500 w-20">{t.pack_size} un</td>
                      <td className="py-1.5 font-medium">{formatCurrency(t.price)}</td>
                      <td className="py-1.5 text-gray-500">
                        {t.cash_price ? `pix ${formatCurrency(t.cash_price)}` : 'pix pelo %'}
                        {t.semPrecoProprio && <span className="text-amber-600 text-xs ml-1">(preço do pacote)</span>}
                      </td>
                      <td className="py-1.5 text-right">
                        <button
                          onClick={() => alternarAtivo(t)}
                          className="text-gray-400 hover:text-gray-900 text-xs whitespace-nowrap"
                        >
                          {t.active ? 'tirar do ar' : 'pôr no ar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {cards.length === 0 && avulsos.length === 0 ? (
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
                {avulsos.map(p => (
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

      <Modal
        isOpen={familia !== null}
        onClose={() => setFamilia(null)}
        title={familia ? `Preços · ${familia.saborFoco ? catalogText(familia.saborFoco.name) : familia.nome}` : ''}
      >
        {familia && (
          <form onSubmit={salvarFamilia} className="space-y-4">
            {!familia.saborFoco && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="pb-2 font-medium">Tamanho</th>
                  <th className="pb-2 font-medium">Cartão</th>
                  <th className="pb-2 font-medium">Pix</th>
                </tr>
              </thead>
              <tbody>
                {familia.tamanhos.map(t => (
                  <tr key={t.id}>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {t.pack_size} un
                      {!t.active && <span className="text-gray-400 text-xs ml-1">(fora do ar)</span>}
                    </td>
                    <td className="py-1.5 pr-3">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={precosFamilia[t.id]?.price ?? ''}
                        onChange={e => setPrecosFamilia(atual => ({
                          ...atual, [t.id]: { ...atual[t.id], price: e.target.value },
                        }))}
                        className="w-24 rounded-md border border-gray-300 px-2 py-1.5 focus:border-gray-900 focus:outline-none"
                      />
                    </td>
                    <td className="py-1.5">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="vazio = %"
                        value={precosFamilia[t.id]?.cash_price ?? ''}
                        onChange={e => setPrecosFamilia(atual => ({
                          ...atual, [t.id]: { ...atual[t.id], cash_price: e.target.value },
                        }))}
                        className="w-24 rounded-md border border-gray-300 px-2 py-1.5 focus:border-gray-900 focus:outline-none"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
            {!familia.saborFoco && (
              <p className="text-xs text-gray-500">
                Pix vazio: o produto segue o desconto padrão da loja em vez de um valor próprio.
              </p>
            )}

            {saboresDaFamilia(familia).length > 0 && (
              <div className="border-t border-gray-200 pt-4">
                <h3 className="font-semibold text-gray-900">Preço por sabor</h3>
                <p className="text-xs text-gray-500 mt-1 mb-3">
                  O preço acima é o piso do pacote. Quem monta com um recheio mais caro paga
                  o dele — meio a meio, meio preço de cada. Deixe vazio para o sabor seguir
                  o preço do pacote.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="pb-2 font-medium">Sabor</th>
                        {familia.tamanhos.map(t => (
                          <th key={t.id} className="pb-2 font-medium text-right">{t.pack_size} un</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(familia.saborFoco ? [familia.saborFoco] : saboresDaFamilia(familia)).map(sb => (
                        ['price', 'cash_price'].map((campo, i) => (
                          <tr key={`${sb.id}-${campo}`} className={i === 0 ? 'border-t border-gray-100' : ''}>
                            {i === 0 ? (
                              <td rowSpan={2} className="py-1.5 pr-3 align-top">
                                <span className="block">{catalogText(sb.name)}</span>
                                <span className="block text-xs text-gray-400">cartão / pix</span>
                              </td>
                            ) : null}
                            {familia.tamanhos.map(t => (
                              <td key={t.id} className="py-1 pl-2 text-right">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={precosSabor[`${sb.id}:${t.pack_size}`]?.[campo] ?? ''}
                                  onChange={e => setPrecosSabor(atual => ({
                                    ...atual,
                                    [`${sb.id}:${t.pack_size}`]: {
                                      ...atual[`${sb.id}:${t.pack_size}`],
                                      [campo]: e.target.value,
                                    },
                                  }))}
                                  className="w-20 text-right rounded-md border border-gray-300 px-2 py-1
                                             focus:border-gray-900 focus:outline-none"
                                />
                              </td>
                            ))}
                          </tr>
                        ))
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="secondary" onClick={() => setFamilia(null)}>Cancelar</Button>
              <Button type="submit" disabled={salvandoFamilia}>
                {salvandoFamilia ? 'Salvando...' : 'Salvar preços'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

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
