import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { HiArrowRight } from 'react-icons/hi'
import { getFlavors, peekFlavors } from '../../services/flavors'
import { catalogText } from '../../utils/catalogText'
import { slugify } from '../../utils/slug'
import { LISTA_OCASIOES, ocasiaoPorSlug } from '../../content/ocasioes'
import { metaOcasiao } from '../../content/paginas'
import { conteudoDoSabor } from '../../content/sabores'
import Breadcrumbs from '../../components/content/Breadcrumbs'
import Faq from '../../components/content/Faq'
import { breadcrumbJsonLd, faqJsonLd, servicoJsonLd } from '../../utils/jsonld'
import CalculadoraSalgados from '../../components/content/CalculadoraSalgados'
import Button from '../../components/ui/Button'
import Loading from '../../components/ui/Loading'
import Seo from '../../components/ui/Seo'

const SITE = 'https://coxelli.com.br'

/**
 * Pagina de ocasiao: /salgados-para-festa, /salgados-para-aniversario...
 *
 * A ocasiao vem do proprio caminho, e nao de um parametro de rota, porque o
 * React Router so casa parametro que ocupe um segmento inteiro -- em
 * `/salgados-para-:ocasiao` o parametro fica no meio do segmento e a rota nunca
 * bate. O App registra uma rota por ocasiao a partir da mesma lista, entao aqui
 * basta reconhecer qual delas pediu a pagina.
 *
 * A guarda de ocasiao inexistente fica de pe mesmo assim: renomear um slug no
 * conteudo sem republicar deixaria a rota viva apontando para o nada, e cair em
 * noindex e melhor que quebrar a tela.
 */
export default function OccasionPage() {
  const { pathname } = useLocation()
  const slug = pathname.replace(/^\/+|\/+$/g, '')
  const ocasiao = ocasiaoPorSlug(slug)

  const saboresEmCache = peekFlavors()
  const [sabores, setSabores] = useState(() => saboresEmCache ?? [])
  const [loading, setLoading] = useState(!saboresEmCache)

  useEffect(() => {
    getFlavors()
      .then(setSabores)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const caminho = `/${slug}`
  const url = `${SITE}${caminho}`

  const trilha = useMemo(() => ([
    { nome: 'Início', caminho: '/' },
    { nome: 'Salgados', caminho: '/salgados' },
    { nome: ocasiao?.h1 ?? 'Ocasião', caminho },
  ]), [ocasiao, caminho])

  // Os sabores que a ocasiao recomenda, na ordem em que foram recomendados --
  // a ordem e editorial, nao a `sort_order` da vitrine.
  const sugeridos = useMemo(() => {
    if (!ocasiao) return []
    const porSlug = new Map(sabores.map(s => [slugify(s.name), s]))
    return ocasiao.sabores.map(slug => porSlug.get(slug)).filter(Boolean)
  }, [ocasiao, sabores])

  const dadosEstruturados = useMemo(() => {
    if (!ocasiao) return null
    return [
      servicoJsonLd({ nome: ocasiao.tituloSeo, descricao: ocasiao.descricao, url }),
      breadcrumbJsonLd(trilha),
      faqJsonLd(ocasiao.faq, url),
    ]
  }, [ocasiao, trilha, url])

  // Mesmo titulo e descricao que o prerender escreve no build.
  const meta = ocasiao ? metaOcasiao(ocasiao) : null

  if (loading) return <Loading />

  if (!ocasiao) {
    return (
      <>
        <Seo titulo="Página não encontrada" caminho={caminho} noindex />
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <h1 className="font-display text-5xl font-black uppercase text-brown mb-4">
            Essa página não existe
          </h1>
          <p className="text-text-light text-lg mb-8">
            Mas a gente tem salgado para essas aqui:
          </p>
          <ul className="flex flex-wrap justify-center gap-2.5 list-none p-0 m-0">
            {LISTA_OCASIOES.map(o => (
              <li key={o.slug}>
                <Link
                  to={`/${o.slug}`}
                  className="inline-block no-underline bg-cream border-2 border-brown shadow-[3px_3px_0_#5d2b04] px-4 py-2 font-display font-extrabold uppercase text-sm text-brown hover:bg-brand transition-colors duration-[--duration-fast] ease-[--ease-interaction]"
                >
                  {o.h1}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </>
    )
  }

  return (
    <>
      <Seo
        titulo={meta.titulo}
        descricao={meta.descricao}
        caminho={meta.caminho}
        dadosEstruturados={dadosEstruturados}
      />

      <article className="min-h-screen">
        {/* ============ CABEÇALHO ============ */}
        <header className="bg-brand dots-sun border-b-[6px] border-brown">
          <div className="max-w-5xl mx-auto px-4 pt-6 pb-12 md:pb-16">
            <Breadcrumbs itens={trilha} />

            <h1 className="font-display text-5xl sm:text-6xl md:text-7xl font-black uppercase leading-[0.85] tracking-[-0.03em] text-brown mb-4 max-w-3xl">
              {ocasiao.h1}
            </h1>
            <p className="text-brown text-xl md:text-2xl font-semibold leading-snug mb-8 max-w-2xl">
              {ocasiao.chamada}
            </p>

            <div className="grid lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-14 items-start">
              {/* A calculadora vem antes do texto no celular e ao lado dele no
                  desktop. E a duvida que trouxe a pessoa ate aqui -- deixar dois
                  paragrafos na frente dela, na tela onde a maioria chega, e
                  enterrar a resposta embaixo do argumento. */}
              <div className="order-2 lg:order-1">
                {ocasiao.texto.map(paragrafo => (
                  <p key={paragrafo.slice(0, 40)} className="text-brown/85 text-lg leading-relaxed mb-4">
                    {paragrafo}
                  </p>
                ))}
              </div>

              <div className="order-1 lg:order-2">
                <CalculadoraSalgados
                  porPessoa={ocasiao.porPessoa}
                  faixa={ocasiao.faixa}
                  titulo="Faça a conta da sua"
                />
              </div>
            </div>
          </div>
        </header>

        {/* ============ DICAS ============ */}
        <section className="max-w-4xl mx-auto px-4 py-12 md:py-16">
          <h2 className="font-display text-4xl md:text-5xl font-black uppercase tracking-tight text-brown mb-8">
            <span className="underline-hand">Antes de encomendar</span>
          </h2>

          <div className="grid gap-px bg-brown/20 border-2 border-brown/20">
            {ocasiao.dicas.map(([titulo, texto]) => (
              <div key={titulo} className="bg-bg p-6 md:p-7">
                <h3 className="font-display font-extrabold uppercase text-xl md:text-2xl text-brown leading-tight mb-2">
                  {titulo}
                </h3>
                <p className="text-text-light text-lg leading-relaxed">{texto}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ============ SABORES SUGERIDOS ============ */}
        {sugeridos.length > 0 && (
          <section className="bg-secondary dots-sun border-y-[6px] border-brown py-12 md:py-16">
            <div className="max-w-5xl mx-auto px-4">
              <h2 className="font-display text-4xl md:text-5xl font-black uppercase tracking-tight text-brown mb-2">
                <span className="underline-hand">O que costuma funcionar</span>
              </h2>
              <p className="text-brown/80 font-medium text-lg mb-8 max-w-2xl">
                Não é regra — é o que a gente vê sair mais nesse tipo de evento.
              </p>

              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 list-none p-0 m-0">
                {sugeridos.map(sabor => {
                  const nome = catalogText(sabor.name)
                  const conteudo = conteudoDoSabor(slugify(sabor.name))
                  return (
                    <li key={sabor.id}>
                      <Link
                        to={`/salgados/${slugify(sabor.name)}`}
                        className="no-underline flex flex-col h-full bg-cream border-[3px] border-brown shadow-[5px_5px_0_#5d2b04] p-5 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[3px_3px_0_#5d2b04] transition-[transform,box-shadow] duration-[--duration-fast] ease-[--ease-interaction]"
                      >
                        <h3 className="font-display text-xl font-black uppercase leading-tight text-brown mb-1.5">
                          {nome}
                        </h3>
                        <p className="text-text-light text-sm leading-snug flex-1">
                          {conteudo?.chamada || catalogText(sabor.description || '')}
                        </p>
                        <span className="inline-flex items-center gap-1.5 font-display font-extrabold uppercase text-xs tracking-[0.08em] text-primary mt-3">
                          Ver o sabor
                          <HiArrowRight size={13} />
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          </section>
        )}

        {/* ============ FAQ ============ */}
        <Faq itens={ocasiao.faq} />

        {/* ============ OUTRAS OCASIÕES ============ */}
        <section className="max-w-4xl mx-auto px-4 pb-16">
          <h2 className="font-display text-2xl font-black uppercase tracking-tight text-brown mb-4">
            Outras ocasiões
          </h2>
          <ul className="flex flex-wrap gap-2.5 list-none p-0 m-0 mb-10">
            {LISTA_OCASIOES.filter(o => o.slug !== ocasiao.slug).map(o => (
              <li key={o.slug}>
                <Link
                  to={`/${o.slug}`}
                  className="inline-block no-underline bg-cream border-2 border-brown shadow-[3px_3px_0_#5d2b04] px-4 py-2 font-display font-extrabold uppercase text-sm text-brown hover:bg-brand active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0_#5d2b04] transition-[background-color,transform,box-shadow] duration-[--duration-fast] ease-[--ease-interaction]"
                >
                  {o.h1}
                </Link>
              </li>
            ))}
          </ul>

          <div className="text-center">
            <Link to="/cardapio" className="no-underline">
              <Button size="lg" className="gap-2">
                Montar meu pedido
                <HiArrowRight size={18} />
              </Button>
            </Link>
          </div>
        </section>
      </article>
    </>
  )
}
