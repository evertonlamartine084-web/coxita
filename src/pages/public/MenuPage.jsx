import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { HiSearch, HiX, HiHeart } from 'react-icons/hi'
import { getProducts, peekProducts } from '../../services/products'
import { getCategories, peekCategories } from '../../services/categories'
import { getFlavors, peekFlavors } from '../../services/flavors'
import { useFavoritesStore } from '../../store/favoritesStore'
import { ehPacote, pacotesDoSabor } from '../../utils/pacote'
import { catalogText } from '../../utils/catalogText'
import ProductCard from '../../components/product/ProductCard'
import FlavorCard from '../../components/product/FlavorCard'
import FlavorToCart from '../../components/product/FlavorToCart'
import Loading from '../../components/ui/Loading'
import Seo from '../../components/ui/Seo'

export default function MenuPage() {
  const produtosEmCache = peekProducts()
  const categoriasEmCache = peekCategories()
  const saboresEmCache = peekFlavors()

  const [products, setProducts] = useState(() => produtosEmCache ?? [])
  const [categories, setCategoriesData] = useState(() => categoriasEmCache ?? [])
  const [flavors, setFlavors] = useState(() => saboresEmCache ?? [])
  // A home linka direto para ?aba=pasteis. Ler na inicializacao (e nao por
  // efeito) evita o flash de "Todos" antes de trocar.
  const [params] = useSearchParams()
  const [activeCategory, setActiveCategory] = useState(() => params.get('aba') || 'all')
  const [search, setSearch] = useState('')
  const [saborNoCarrinho, setSaborNoCarrinho] = useState(null)
  const [loading, setLoading] = useState(!produtosEmCache || !categoriasEmCache)
  const favorites = useFavoritesStore(s => s.favorites)

  useEffect(() => {
    Promise.all([getProducts(), getCategories(), getFlavors()])
      .then(([prods, cats, sabores]) => {
        setProducts(prods)
        setCategoriesData(cats)
        setFlavors(sabores)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // O cardapio vende pacote; os sabores de pastel seguem no JSON-LD como secao
  // sem preco, e a pagina de cada um continua no ar em /salgados/<sabor>.
  const pasteis = flavors.filter(f => f.group_slug === 'pasteis')

  const pacotes = products.filter(ehPacote)

  // Pacote nao diz o que vai dentro: quem compra escolhe pelo recheio. Entao
  // toda aba de pacote mostra tambem os sabores que ele aceita, e clicar num
  // deles leva ao pacote com esse sabor.
  //
  // O grupo sai dos proprios produtos da aba, nao de slug escrito a mao --
  // renomear a categoria no admin nao quebra a tela. Aba com dois grupos
  // ("Todos") nao ganha a secao: sairia o catalogo de sabores inteiro repetido.
  const pacotesDaAba = products.filter(
    p => p.categories?.slug === activeCategory && ehPacote(p)
  )
  const gruposDaAba = [...new Set(pacotesDaAba.map(p => p.flavor_group).filter(Boolean))]
  const saboresDaAba =
    gruposDaAba.length === 1 ? flavors.filter(f => f.group_slug === gruposDaAba[0]) : []

  // Pacote de sabor unico ja tem preco por sabor: escolher o tamanho e a
  // escolha inteira, nao ha o que montar de 25 em 25.
  const abaDeSaborUnico = pacotesDaAba.length > 0 && pacotesDaAba.every(p => p.fixed_flavor_id)


  // Cardapio em Schema.org. O index.html ja declara a loja e aponta hasMenu para
  // ca; sem isto o Google sabe que existe um cardapio mas nao o que tem dentro.
  // Preco sai do proprio produto -- marcar valor diferente do exibido e o tipo de
  // divergencia que derruba rich result.
  const menuJsonLd = (() => {
    if (products.length === 0) return null

    const porCategoria = new Map()
    for (const p of products) {
      const nome = p.categories?.name || 'Outros'
      if (!porCategoria.has(nome)) porCategoria.set(nome, [])
      porCategoria.get(nome).push({
        '@type': 'MenuItem',
        name: catalogText(p.name),
        ...(p.description ? { description: catalogText(p.description) } : {}),
        ...(p.image_url ? { image: `https://coxelli.com.br${p.image_url}` } : {}),
        offers: {
          '@type': 'Offer',
          price: Number(p.price).toFixed(2),
          priceCurrency: 'BRL',
          availability: 'https://schema.org/InStock',
        },
      })
    }

    const secoes = [...porCategoria].map(([nome, itens]) => ({
      '@type': 'MenuSection',
      name: nome,
      hasMenuItem: itens,
    }))

    // Sabores nao tem preco proprio: entram como secao sem Offer, que e o jeito
    // certo de dizer "isto existe no cardapio, mas nao se compra avulso".
    if (pasteis.length > 0) {
      secoes.push({
        '@type': 'MenuSection',
        name: 'Pastéis',
        description: 'Sabores para montar os pacotes',
        hasMenuItem: pasteis.map(f => ({
          '@type': 'MenuItem',
          name: catalogText(f.name),
          ...(f.description ? { description: catalogText(f.description) } : {}),
          ...(f.image_url ? { image: `https://coxelli.com.br${f.image_url}` } : {}),
        })),
      })
    }

    return {
      '@context': 'https://schema.org',
      '@type': 'Menu',
      '@id': 'https://coxelli.com.br/cardapio#menu',
      name: 'Cardápio Coxelli',
      inLanguage: 'pt-BR',
      provider: { '@id': 'https://coxelli.com.br/#loja' },
      hasMenuSection: secoes,
    }
  })()

  const filtered = products.filter(p => {
    const matchCategory = activeCategory === 'all'
      ? true
      : activeCategory === 'favoritos'
        ? favorites.includes(p.id)
        : p.categories?.slug === activeCategory
    const busca = search.toLowerCase().trim()
    const matchSearch = !busca || p.name.toLowerCase().includes(busca) || p.description?.toLowerCase().includes(busca)
    return matchCategory && matchSearch
  })

  // A busca vale para os dois: procurar "queijo" com a aba aberta tem que achar
  // tanto o pacote quanto o sabor.
  const saboresFiltrados = saboresDaAba.filter(f => {
    const busca = search.toLowerCase().trim()
    return !busca || f.name.toLowerCase().includes(busca) || f.description?.toLowerCase().includes(busca)
  })

  // Numa aba dessas, listar os pacotes junto com os sabores e dizer a mesma
  // coisa duas vezes: os quatro tamanhos de sertanejo ja aparecem quando o
  // cliente clica no sabor. Fica so a lista com foto, que e a mais curta e a
  // que mostra o produto. Os pacotes seguem em "Todos" e na busca.
  const escondeOsPacotes = abaDeSaborUnico && saboresDaAba.length > 0
  const produtosVisiveis = escondeOsPacotes ? [] : filtered

  if (loading) return <Loading />

  return (
    <>
        <Seo
          titulo="Cardápio"
          descricao="Centos, meios centos e combos de salgados em Natal/RN. Escolha o tamanho e misture os sabores como quiser."
          caminho="/cardapio"
          dadosEstruturados={menuJsonLd}
        />
      <div className="min-h-screen">
        {/* Page header */}
        <div className="bg-secondary dots-sun border-b-[6px] border-brown pt-8 pb-7">
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex items-center gap-4 mb-6">
              <img width={512} height={512} src="/logo.png" alt="" className="w-16 h-16 object-contain bg-cream rounded-full border-2 border-brown" />
              <div>
                <h1 className="font-display text-5xl md:text-6xl font-black uppercase leading-none text-brown">Cardápio</h1>
                <p className="text-brown font-semibold text-base mt-0.5">Escolha o tamanho. Depois, misture os sabores.</p>
              </div>
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <HiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-text-light" size={18} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar no cardápio..."
                className="w-full pl-11 pr-10 py-3 border-[3px] border-brown rounded-sm outline-none focus:border-festa transition-colors font-body font-medium text-base bg-cream shadow-[3px_3px_0_#5d2b04]"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-light hover:text-text cursor-pointer"
                >
                  <HiX size={18} />
                </button>
              )}
            </div>

            {/* Category filter pills */}
            <div className="flex gap-2 overflow-x-auto pb-2 px-1 scrollbar-hide">
              <CategoryPill
                active={activeCategory === 'all'}
                onClick={() => setActiveCategory('all')}
              >
                Todos
              </CategoryPill>
              {favorites.length > 0 && (
                <CategoryPill
                  active={activeCategory === 'favoritos'}
                  onClick={() => setActiveCategory('favoritos')}
                >
                  <HiHeart className="inline -mt-0.5 mr-1" size={14} />
                  Favoritos
                </CategoryPill>
              )}
              {categories.map(cat => (
                <CategoryPill
                  key={cat.id}
                  active={activeCategory === cat.slug}
                  onClick={() => setActiveCategory(cat.slug)}
                >
                  {cat.name}
                </CategoryPill>
              ))}
            </div>
          </div>
        </div>

        {/* Products grid */}
        <div className="max-w-6xl mx-auto px-4 py-8">
          {produtosVisiveis.length === 0 && saboresFiltrados.length === 0 ? (
            <div className="text-center py-16">
              <img width={512} height={512} src="/logo.png" alt="" className="w-20 h-20 object-contain mx-auto mb-4 opacity-30" />
              <p className="text-text-light font-display text-lg">Nenhum produto nesta categoria.</p>
            </div>
          ) : (
            <>
              {produtosVisiveis.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
                  {produtosVisiveis.map(p => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              )}

              {saboresFiltrados.length > 0 && (
                <div className={produtosVisiveis.length > 0 ? 'mt-12' : ''}>
                  <h2 className="font-display text-2xl uppercase text-brown mb-1">Escolha os sabores</h2>
                  <p className="text-text-light text-sm mb-5">
                    {abaDeSaborUnico
                      ? 'Clique num sabor para escolher o tamanho do pacote.'
                      : 'Todo pacote é montado de 25 em 25. Clique num sabor para começar.'}
                  </p>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
                    {saboresFiltrados.map(sabor => (
                      <FlavorCard
                        key={sabor.id}
                        sabor={sabor}
                        aoAdicionar={
                          pacotesDoSabor(sabor, pacotes).length > 0 ? setSaborNoCarrinho : undefined
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {saborNoCarrinho && (
        <FlavorToCart
          sabor={saborNoCarrinho}
          pacotes={pacotesDoSabor(saborNoCarrinho, pacotes)}
          aoFechar={() => setSaborNoCarrinho(null)}
        />
      )}
    </>
  )
}

function CategoryPill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 whitespace-nowrap text-sm font-extrabold font-display uppercase tracking-wide border-2 border-brown transition-colors duration-200 cursor-pointer ${
        active
          ? 'gingham-blue text-white shadow-[3px_3px_0_#5d2b04]'
          : 'bg-cream text-brown hover:bg-brand'
      }`}
    >
      {children}
    </button>
  )
}
