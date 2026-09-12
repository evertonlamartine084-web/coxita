import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { HiArrowRight } from 'react-icons/hi'
import { getFlavors, peekFlavors } from '../../services/flavors'
import { getProducts, peekProducts } from '../../services/products'
import { ehPacote, pacotesDoSabor, unidadeDoPacote } from '../../utils/pacote'
import { catalogText } from '../../utils/catalogText'
import { saborPorSlug, caminhoDoSabor } from '../../utils/slug'
import { conteudoDoSabor } from '../../content/sabores'
import Breadcrumbs from '../../components/content/Breadcrumbs'
import Faq from '../../components/content/Faq'
import { breadcrumbJsonLd, faqJsonLd } from '../../utils/jsonld'
import Button from '../../components/ui/Button'
import Loading from '../../components/ui/Loading'
import Seo from '../../components/ui/Seo'

const SITE = 'https://coxelli.com.br'

/**
 * Pagina de um sabor.
 *
 * Existe por um motivo de busca: ninguem procura "cento de salgados" -- procura
 * "coxinha de frango em Natal", "pastel de carne de sol". O cardapio nao
 * responde a essas buscas porque e uma pagina so, com um titulo so. Aqui cada
 * recheio tem endereco proprio, texto proprio e os pacotes em que ele cabe.
 *
 * O preco nunca e escrito aqui: sai dos pacotes do banco. Preco de pagina de
 * conteudo que diverge do carrinho e reclamacao garantida -- e, no schema, o
 * bastante para o Google derrubar o rich result do site inteiro.
 */
export default function FlavorPage() {
  const { slug } = useParams()

  const saboresEmCache = peekFlavors()
  const produtosEmCache = peekProducts()

  const [sabores, setSabores] = useState(() => saboresEmCache ?? [])
  const [produtos, setProdutos] = useState(() => produtosEmCache ?? [])
  const [loading, setLoading] = useState(!saboresEmCache || !produtosEmCache)

  useEffect(() => {
    Promise.all([getFlavors(), getProducts()])
      .then(([s, p]) => {
        setSabores(s)
        setProdutos(p)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const sabor = saborPorSlug(sabores, slug)
  const conteudo = conteudoDoSabor(slug)

  // Pacotes que aceitam este sabor, do menor para o maior: a pessoa le a partir
  // do compromisso menor, que e por onde ela decide experimentar.
  const pacotes = useMemo(() => {
    if (!sabor) return []
    return pacotesDoSabor(sabor, produtos.filter(ehPacote))
      .slice()
      .sort((a, b) => a.pack_size - b.pack_size)
  }, [sabor, produtos])

  const irmaos = useMemo(() => {
    if (!sabor) return []
    return sabores.filter(s => s.group_slug === sabor.group_slug && s.id !== sabor.id)
  }, [sabor, sabores])

  const nome = sabor ? catalogText(sabor.name) : ''
  const caminho = `/salgados/${slug}`
  const url = `${SITE}${caminho}`

  const trilha = useMemo(() => ([
    { nome: 'Início', caminho: '/' },
    { nome: 'Salgados', caminho: '/salgados' },
    { nome, caminho },
  ]), [nome, caminho])

  const dadosEstruturados = useMemo(() => {
    if (!sabor || pacotes.length === 0) return null

    const precos = pacotes.map(p => Number(p.price))
    const produto = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      '@id': `${url}#produto`,
      name: nome,
      description: conteudo?.descricao || catalogText(sabor.description || nome),
      ...(sabor.image_url ? { image: `${SITE}${sabor.image_url}` } : {}),
      brand: { '@type': 'Brand', name: 'Coxelli Salgados' },
      category: sabor.group_slug === 'pasteis' ? 'Pastéis' : 'Salgados',
      // AggregateOffer e nao Offer: o sabor nao tem preco -- os pacotes tem, e
      // sao varios. A faixa marcada e exatamente a que a tabela abaixo mostra.
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'BRL',
        lowPrice: Math.min(...precos).toFixed(2),
        highPrice: Math.max(...precos).toFixed(2),
        offerCount: pacotes.length,
        availability: 'https://schema.org/InStock',
        seller: { '@id': `${SITE}/#loja` },
      },
    }

    // Varios blocos num array so: o Seo.jsx injeta um <script> por pagina, e
    // JSON-LD aceita lista na raiz.
    return [
      produto,
      breadcrumbJsonLd(trilha),
      ...(conteudo?.faq ? [faqJsonLd(conteudo.faq, url)] : []),
    ]
  }, [sabor, pacotes, conteudo, nome, url, trilha])

  if (loading) return <Loading />

  // Slug que nao existe: pagina util em vez de tela morta, e fora do indice --
  // sabor desativado no admin nao pode continuar aparecendo na busca.
  if (!sabor) {
    return (
      <>
        <Seo titulo="Sabor não encontrado" caminho={caminho} noindex />
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <h1 className="font-display text-5xl font-black uppercase text-brown mb-4">
            Esse sabor saiu do cardápio
          </h1>
          <p className="text-text-light text-lg mb-8">
            Pode ter mudado de nome ou saído de linha. O cardápio tem o que está saindo da fritura hoje.
          </p>
          <Link to="/cardapio" className="no-underline">
            <Button size="lg" className="gap-2">
              Ver o cardápio
              <HiArrowRight size={18} />
            </Button>
          </Link>
        </div>
      </>
    )
  }

  const unidade = pacotes[0] ? unidadeDoPacote(pacotes[0]) : 'salgados'
  const descricaoCurta = catalogText(sabor.description || '')

  return (
    <>
      <Seo
        titulo={conteudo?.tituloSeo || nome}
        descricao={conteudo?.descricao || `${nome} feito na hora em Natal/RN. ${descricaoCurta}`.trim()}
        caminho={caminho}
        dadosEstruturados={dadosEstruturados}
      />

      <article className="min-h-screen">
        {/* ============ CABEÇALHO ============ */}
        <header className="bg-brand dots-sun border-b-[6px] border-brown">
          <div className="max-w-5xl mx-auto px-4 pt-6 pb-12 md:pb-16">
            <Breadcrumbs itens={trilha} />

            <div className="grid md:grid-cols-2 items-center gap-8 md:gap-12">
              <div>
                <p className="inline-block gingham-blue text-white border-2 border-brown px-3 py-1.5 font-display font-extrabold text-xs uppercase tracking-[0.1em] mb-5 shadow-[3px_3px_0_#5d2b04]">
                  {sabor.group_slug === 'pasteis' ? 'Pastéis' : 'Salgados'} · Natal/RN
                </p>

                <h1 className="font-display text-5xl sm:text-6xl font-black uppercase leading-[0.88] tracking-[-0.03em] text-brown mb-4">
                  {nome}
                </h1>

                {(conteudo?.chamada || descricaoCurta) && (
                  <p className="text-brown text-xl md:text-2xl font-semibold leading-snug mb-7">
                    {conteudo?.chamada || descricaoCurta}
                  </p>
                )}

                <Link to="/cardapio" className="no-underline">
                  <Button size="lg" className="gap-2">
                    Montar meu pedido
                    <HiArrowRight size={18} />
                  </Button>
                </Link>
              </div>

              {/* Moldura igual a do FlavorCard: a foto do sabor e a mesma peca
                  visual do cardapio, so que em tamanho de retrato. */}
              <div className="bg-cream border-[3px] border-brown shadow-[6px_6px_0_#5d2b04] p-3">
                <div className="border-2 border-brown bg-bg-warm">
                  {sabor.image_url ? (
                    <img
                      src={sabor.image_url}
                      alt={`${nome} da Coxelli Salgados`}
                      width="800"
                      height="600"
                      // Imagem principal da pagina: e o LCP. `eager` +
                      // fetchpriority tiram o atraso de uma imagem que sempre
                      // esta na primeira tela.
                      loading="eager"
                      fetchPriority="high"
                      className="block w-full aspect-[4/3] object-cover"
                    />
                  ) : (
                    <div className="w-full aspect-[4/3] flex items-center justify-center">
                      <img src="/logo.png" alt="" width="112" height="112" className="w-28 h-28 opacity-25 object-contain" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* ============ TEXTO ============ */}
        {conteudo?.texto && (
          <section className="max-w-3xl mx-auto px-4 py-12 md:py-16">
            <h2 className="font-display text-4xl md:text-5xl font-black uppercase tracking-tight text-brown mb-6">
              <span className="underline-hand">O que tem dentro</span>
            </h2>
            {conteudo.texto.map(paragrafo => (
              <p key={paragrafo.slice(0, 40)} className="text-text text-lg leading-relaxed mb-5">
                {paragrafo}
              </p>
            ))}
            {conteudo.combina && (
              <p className="text-text-light text-lg leading-relaxed border-l-4 border-primary pl-5 mt-8">
                {conteudo.combina}
              </p>
            )}
          </section>
        )}

        {/* ============ PACOTES ============ */}
        {pacotes.length > 0 && (
          <section className="bg-secondary dots-sun border-y-[6px] border-brown py-12 md:py-16">
            <div className="max-w-5xl mx-auto px-4">
              <h2 className="font-display text-4xl md:text-5xl font-black uppercase tracking-tight text-brown mb-2">
                <span className="underline-hand">Onde esse sabor cabe</span>
              </h2>
              <p className="text-brown/80 font-medium text-lg mb-8">
                {sabor.group_slug === 'pasteis'
                  ? 'Cada pacote vem fechado neste sabor.'
                  : `Escolha o tamanho e divida com outros sabores, de 25 em 25 ${unidade}.`}
              </p>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {pacotes.map(pacote => (
                  <Link
                    key={pacote.id}
                    to={`/cardapio?aba=${pacote.categories?.slug ?? 'centos'}`}
                    className="no-underline block bg-cream border-[3px] border-brown shadow-[5px_5px_0_#5d2b04] p-5 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[3px_3px_0_#5d2b04] transition-[transform,box-shadow] duration-[--duration-fast] ease-[--ease-interaction]"
                  >
                    <p className="font-display font-extrabold uppercase text-xs tracking-[0.12em] text-primary mb-1">
                      {pacote.pack_size} {unidadeDoPacote(pacote)}
                    </p>
                    <p className="font-display text-3xl font-black uppercase leading-none text-brown mb-2">
                      R$ {Number(pacote.price).toFixed(2).replace('.', ',')}
                    </p>
                    <p className="text-text-light text-sm leading-snug">
                      {catalogText(pacote.name)}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ============ FAQ ============ */}
        <Faq itens={conteudo?.faq} titulo={`Sobre o ${nome.toLowerCase()}`} />

        {/* ============ OUTROS SABORES ============ */}
        {irmaos.length > 0 && (
          <section className="max-w-5xl mx-auto px-4 pb-16">
            <h2 className="font-display text-3xl md:text-4xl font-black uppercase tracking-tight text-brown mb-6">
              Outros sabores
            </h2>
            <ul className="flex flex-wrap gap-2.5 list-none p-0 m-0">
              {irmaos.map(outro => (
                <li key={outro.id}>
                  <Link
                    to={caminhoDoSabor(outro)}
                    className="inline-block no-underline bg-cream border-2 border-brown shadow-[3px_3px_0_#5d2b04] px-4 py-2 font-display font-extrabold uppercase text-sm text-brown hover:bg-brand active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0_#5d2b04] transition-[background-color,transform,box-shadow] duration-[--duration-fast] ease-[--ease-interaction]"
                  >
                    {catalogText(outro.name)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </>
  )
}
