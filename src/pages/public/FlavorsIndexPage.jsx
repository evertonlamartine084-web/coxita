import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { HiArrowRight } from 'react-icons/hi'
import { getFlavors, peekFlavors } from '../../services/flavors'
import { catalogText } from '../../utils/catalogText'
import { caminhoDoSabor, slugify } from '../../utils/slug'
import { conteudoDoSabor } from '../../content/sabores'
import { LISTA_OCASIOES } from '../../content/ocasioes'
import Breadcrumbs from '../../components/content/Breadcrumbs'
import Faq from '../../components/content/Faq'
import { breadcrumbJsonLd, faqJsonLd } from '../../utils/jsonld'
import Button from '../../components/ui/Button'
import Loading from '../../components/ui/Loading'
import Seo from '../../components/ui/Seo'

const SITE = 'https://coxelli.com.br'
const CAMINHO = '/salgados'

const GRUPOS = [
  { slug: 'salgados', titulo: 'Salgados', subtitulo: 'Vão dentro dos pacotes de 25, 50, 75 ou 100. Misture até 4 sabores.' },
  { slug: 'pasteis', titulo: 'Pastéis', subtitulo: 'Cada pacote vem fechado num sabor, porque o recheio muda o preço.' },
]

const PERGUNTAS = [
  {
    pergunta: 'Quais salgados a Coxelli faz?',
    resposta: 'Coxinha de frango, coxinha com catupiry, baiãozinho de camarão, kibe, risole de carne e de frango, enroladinho de salsicha, bolinha de queijo, croquete de carne e empada de frango. Nos pastéis: frango, carne, sertanejo, pizza e queijo com presunto.',
  },
  {
    pergunta: 'Dá para misturar sabores no mesmo pacote?',
    resposta: 'Dá, nos pacotes de salgados: são escolhidos de 25 em 25 unidades, então o cento aceita até 4 sabores, o de 75 aceita 3 e o meio cento aceita 2. O cento de pastel vem fechado num sabor só.',
  },
  {
    pergunta: 'Onde vocês entregam em Natal?',
    resposta: 'A loja fica na Pajuçara e a gente entrega nos 36 bairros de Natal. Coloque seu endereço no checkout que o sistema calcula a taxa e o prazo do seu caso.',
  },
  {
    pergunta: 'Os salgados são feitos na hora?',
    resposta: 'São. A fritura é programada para perto do horário combinado da entrega, para o salgado chegar quente e crocante.',
  },
]

/**
 * Indice dos sabores -- e a pagina que disputa "salgados em Natal".
 *
 * Serve a duas leituras ao mesmo tempo. Para quem chega de busca generica, e um
 * cardapio explicado, com texto que o /cardapio nao tem espaco para carregar.
 * Para o buscador, e o hub que linka as quinze paginas de sabor: sem uma pagina
 * assim, cada sabor ficaria orfao, alcancavel so pelo sitemap -- e pagina que
 * nenhuma outra linka o Google trata como pagina que nem o dono acha
 * importante.
 */
export default function FlavorsIndexPage() {
  const saboresEmCache = peekFlavors()
  const [sabores, setSabores] = useState(() => saboresEmCache ?? [])
  const [loading, setLoading] = useState(!saboresEmCache)

  useEffect(() => {
    getFlavors()
      .then(setSabores)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const trilha = useMemo(() => ([
    { nome: 'Início', caminho: '/' },
    { nome: 'Salgados', caminho: CAMINHO },
  ]), [])

  const dadosEstruturados = useMemo(() => {
    if (sabores.length === 0) return null
    return [
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        '@id': `${SITE}${CAMINHO}#lista`,
        name: 'Sabores de salgados da Coxelli',
        numberOfItems: sabores.length,
        itemListElement: sabores.map((s, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: catalogText(s.name),
          url: `${SITE}${caminhoDoSabor(s)}`,
        })),
      },
      breadcrumbJsonLd(trilha),
      faqJsonLd(PERGUNTAS, `${SITE}${CAMINHO}`),
    ]
  }, [sabores, trilha])

  if (loading) return <Loading />

  return (
    <>
      <Seo
        titulo="Salgados em Natal/RN — todos os sabores"
        descricao="Os 15 sabores de salgado da Coxelli, na Pajuçara, em Natal/RN: coxinha, risole, kibe, baiãozinho de camarão, pastel sertanejo e mais. Feitos na hora."
        caminho={CAMINHO}
        dadosEstruturados={dadosEstruturados}
      />

      <div className="min-h-screen">
        {/* ============ CABEÇALHO ============ */}
        <header className="bg-brand dots-sun border-b-[6px] border-brown">
          <div className="max-w-5xl mx-auto px-4 pt-6 pb-12 md:pb-14">
            <Breadcrumbs itens={trilha} />

            <h1 className="font-display text-5xl sm:text-6xl md:text-7xl font-black uppercase leading-[0.85] tracking-[-0.03em] text-brown mb-5 max-w-3xl">
              Todos os sabores, um por um
            </h1>
            <p className="text-brown text-xl md:text-2xl font-semibold leading-snug max-w-2xl mb-4">
              Quinze recheios feitos na Pajuçara, em Natal. Cada um tem sua página, com o que vai
              dentro e em que pacote ele cabe.
            </p>
            <p className="text-brown/80 text-lg leading-relaxed max-w-2xl">
              Os salgados são escolhidos de 25 em 25 unidades — então um cento pode ter até quatro
              sabores diferentes na mesma bandeja. Os pastéis funcionam diferente: cada pacote vem
              fechado num sabor, porque o recheio muda o custo.
            </p>
          </div>
        </header>

        {/* ============ SABORES POR GRUPO ============ */}
        {GRUPOS.map(grupo => {
          const doGrupo = sabores.filter(s => s.group_slug === grupo.slug)
          if (doGrupo.length === 0) return null

          return (
            <section key={grupo.slug} className="max-w-5xl mx-auto px-4 py-12 md:py-14">
              <h2 className="font-display text-4xl md:text-5xl font-black uppercase tracking-tight text-brown mb-2">
                <span className="underline-hand">{grupo.titulo}</span>
              </h2>
              <p className="text-text-light text-lg leading-relaxed mb-8 max-w-2xl">
                {grupo.subtitulo}
              </p>

              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 list-none p-0 m-0">
                {doGrupo.map(sabor => {
                  const nome = catalogText(sabor.name)
                  const conteudo = conteudoDoSabor(slugify(sabor.name))
                  return (
                    <li key={sabor.id}>
                      <Link
                        to={caminhoDoSabor(sabor)}
                        className="no-underline flex flex-col h-full bg-surface border-[3px] border-brown shadow-[5px_5px_0_#5d2b04] overflow-hidden hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[3px_3px_0_#5d2b04] transition-[transform,box-shadow] duration-[--duration-fast] ease-[--ease-interaction]"
                      >
                        <div className="bg-cream p-2.5 pr-3 pb-3">
                          <div className="border-2 border-brown bg-bg-warm shadow-[2px_2px_0_#5d2b04]">
                            {sabor.image_url ? (
                              <img
                                src={sabor.image_url}
                                alt={nome}
                                width="400"
                                height="300"
                                loading="lazy"
                                className="block w-full aspect-[4/3] object-cover"
                              />
                            ) : (
                              <div className="w-full aspect-[4/3] flex items-center justify-center">
                                <img src="/logo.png" alt="" width="64" height="64" className="w-16 h-16 opacity-25 object-contain" />
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="px-4 pb-4 flex flex-col flex-1">
                          <h3 className="font-display font-extrabold uppercase text-xl leading-tight text-brown mb-1.5">
                            {nome}
                          </h3>
                          <p className="text-text-light text-sm leading-snug flex-1">
                            {conteudo?.chamada || catalogText(sabor.description || '')}
                          </p>
                          <span className="inline-flex items-center gap-1.5 font-display font-extrabold uppercase text-xs tracking-[0.08em] text-primary mt-3">
                            Ver o sabor
                            <HiArrowRight size={13} />
                          </span>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}

        {/* ============ OCASIÕES ============ */}
        {/* Quem chegou aqui por "salgados em Natal" ainda pode estar planejando
            em vez de comprando. Estes links levam a quem responde isso. */}
        <section className="bg-secondary dots-sun border-y-[6px] border-brown py-12 md:py-16">
          <div className="max-w-5xl mx-auto px-4">
            <h2 className="font-display text-4xl md:text-5xl font-black uppercase tracking-tight text-brown mb-2">
              <span className="underline-hand">Vai servir para quê?</span>
            </h2>
            <p className="text-brown/80 font-medium text-lg mb-8 max-w-2xl">
              A quantidade certa muda com a ocasião. Escolha a sua que a gente faz a conta.
            </p>

            <ul className="grid gap-4 sm:grid-cols-2 list-none p-0 m-0">
              {LISTA_OCASIOES.map(ocasiao => (
                <li key={ocasiao.slug}>
                  <Link
                    to={`/${ocasiao.slug}`}
                    className="no-underline block h-full bg-cream border-[3px] border-brown shadow-[5px_5px_0_#5d2b04] p-5 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[3px_3px_0_#5d2b04] transition-[transform,box-shadow] duration-[--duration-fast] ease-[--ease-interaction]"
                  >
                    <h3 className="font-display text-2xl font-black uppercase leading-none text-brown mb-1.5">
                      {ocasiao.h1}
                    </h3>
                    <p className="text-text-light text-sm leading-relaxed">
                      {ocasiao.chamada}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ============ FAQ ============ */}
        <Faq itens={PERGUNTAS} />

        {/* ============ CTA ============ */}
        <section className="max-w-5xl mx-auto px-4 pb-16 text-center">
          <Link to="/cardapio" className="no-underline">
            <Button size="lg" className="gap-2">
              Ver os pacotes e preços
              <HiArrowRight size={18} />
            </Button>
          </Link>
        </section>
      </div>
    </>
  )
}
