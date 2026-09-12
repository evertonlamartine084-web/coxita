import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { HiArrowRight } from 'react-icons/hi'
import { BAIRROS, ZONAS, bairrosDaZona } from '../../content/bairros'
import { CIDADE, UF, BAIRRO_DA_LOJA } from '../../content/entrega'
import { LISTA_OCASIOES } from '../../content/ocasioes'
import { slugify } from '../../utils/slug'
import Breadcrumbs from '../../components/content/Breadcrumbs'
import Faq from '../../components/content/Faq'
import { breadcrumbJsonLd, faqJsonLd, servicoJsonLd } from '../../utils/jsonld'
import Button from '../../components/ui/Button'
import Seo from '../../components/ui/Seo'

const SITE = 'https://coxelli.com.br'
const CAMINHO = '/salgados-em-natal'

const PERGUNTAS = [
  {
    pergunta: 'Vocês entregam em toda Natal?',
    resposta: 'Entregamos, nos 36 bairros da cidade. A cozinha fica na Pajuçara, Zona Norte, e de lá sai tudo. Coloque seu endereço no checkout que o sistema calcula a taxa e o prazo.',
  },
  {
    pergunta: 'Qual o pedido mínimo?',
    resposta: 'O menor pacote é o de 25 salgados. Dá para somar bebidas e outros pacotes no mesmo pedido.',
  },
  {
    pergunta: 'Os salgados chegam quentes?',
    resposta: 'Chegam. A fritura é programada para perto do horário combinado da entrega, não feita de manhã para entregar à tarde — e isso vale para qualquer bairro.',
  },
  {
    pergunta: 'Com quanto tempo preciso encomendar?',
    resposta: 'Dois dias de antecedência garantem qualquer combinação de sabores em qualquer quantidade. Para o mesmo dia, depende do que já está programado na cozinha: chame no WhatsApp que a gente confirma na hora.',
  },
]

/**
 * Indice dos bairros -- a pagina que disputa "salgados em Natal" e o hub das 36.
 *
 * Sem ela cada pagina de bairro dependeria do rodape e do sitemap para existir.
 * Aqui elas ficam agrupadas pelas quatro regioes administrativas, que e como
 * quem mora na cidade procura: ninguem varre uma lista alfabetica de 36 nomes,
 * a pessoa vai direto na zona dela.
 */
export default function BairrosIndexPage() {
  const trilha = useMemo(() => ([
    { nome: 'Início', caminho: '/' },
    { nome: `Salgados em ${CIDADE}`, caminho: CAMINHO },
  ]), [])

  const dadosEstruturados = useMemo(() => ([
    servicoJsonLd({
      nome: `Entrega de salgados em ${CIDADE}/${UF}`,
      descricao: `Salgados feitos na hora, entregues nos 36 bairros de ${CIDADE}/${UF}.`,
      url: `${SITE}${CAMINHO}`,
    }),
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      '@id': `${SITE}${CAMINHO}#bairros`,
      name: `Bairros de ${CIDADE} atendidos pela Coxelli`,
      numberOfItems: BAIRROS.length,
      itemListElement: BAIRROS.map((b, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: `Salgados em ${b.nome}`,
        url: `${SITE}/salgados-em-${b.slug}`,
      })),
    },
    breadcrumbJsonLd(trilha),
    faqJsonLd(PERGUNTAS, `${SITE}${CAMINHO}`),
  ]), [trilha])

  const slugDaLoja = slugify(BAIRRO_DA_LOJA)

  return (
    <>
      <Seo
        titulo={`Salgados em ${CIDADE}/${UF} — entrega nos 36 bairros`}
        descricao={`Cento de salgados feito na hora, entregue em toda ${CIDADE}/${UF}. Coxinha, risole, kibe, pastel e mais. A loja fica na ${BAIRRO_DA_LOJA}, Zona Norte.`}
        caminho={CAMINHO}
        dadosEstruturados={dadosEstruturados}
      />

      <div className="min-h-screen">
        {/* ============ CABEÇALHO ============ */}
        <header className="bg-brand dots-sun border-b-[6px] border-brown">
          <div className="max-w-5xl mx-auto px-4 pt-6 pb-12 md:pb-14">
            <Breadcrumbs itens={trilha} />

            <h1 className="font-display text-5xl sm:text-6xl md:text-7xl font-black uppercase leading-[0.85] tracking-[-0.03em] text-brown mb-5 max-w-3xl">
              Salgados em {CIDADE}, nos 36 bairros
            </h1>
            <p className="text-brown text-xl md:text-2xl font-semibold leading-snug max-w-2xl mb-4">
              A cozinha fica na {BAIRRO_DA_LOJA}. O salgado vai até você.
            </p>
            <p className="text-brown/85 text-lg leading-relaxed max-w-2xl">
              Da Redinha a Ponta Negra, de Felipe Camarão ao Tirol: a gente entrega na cidade
              inteira. Cada bairro tem sua página, com a distância até a cozinha e o que muda na
              entrega. Escolha o seu.
            </p>
          </div>
        </header>

        {/* ============ BAIRROS POR ZONA ============ */}
        {ZONAS.map(zona => {
          const daZona = bairrosDaZona(zona)
          if (daZona.length === 0) return null

          return (
            <section key={zona} className="max-w-5xl mx-auto px-4 py-10 md:py-12">
              <h2 className="font-display text-4xl md:text-5xl font-black uppercase tracking-tight text-brown mb-2">
                <span className="underline-hand">{zona}</span>
              </h2>
              <p className="text-text-light text-lg leading-relaxed mb-7">
                {zona === 'Zona Norte'
                  ? `É onde a Coxelli fica — a cozinha é na ${BAIRRO_DA_LOJA}.`
                  : `${daZona.length} bairros, todos atendidos.`}
              </p>

              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0 m-0">
                {daZona.map(bairro => (
                  <li key={bairro.slug}>
                    <Link
                      to={`/salgados-em-${bairro.slug}`}
                      className="no-underline flex items-baseline justify-between gap-3 bg-surface border-[3px] border-brown shadow-[4px_4px_0_#5d2b04] px-4 py-3 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#5d2b04] transition-[transform,box-shadow] duration-[--duration-fast] ease-[--ease-interaction]"
                    >
                      <span className="font-display font-extrabold uppercase text-lg leading-tight text-brown">
                        {bairro.nome}
                      </span>
                      <span className="font-semibold text-xs text-text-light whitespace-nowrap">
                        {bairro.slug === slugDaLoja ? 'a cozinha' : `${String(bairro.km).replace('.', ',')} km`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}

        {/* ============ OCASIÕES ============ */}
        <section className="bg-secondary dots-sun border-y-[6px] border-brown py-12 md:py-14">
          <div className="max-w-5xl mx-auto px-4">
            <h2 className="font-display text-4xl md:text-5xl font-black uppercase tracking-tight text-brown mb-2">
              <span className="underline-hand">Para que é o seu?</span>
            </h2>
            <p className="text-brown/80 font-medium text-lg mb-8 max-w-2xl">
              A quantidade muda com a ocasião. Cada página tem a conta pronta.
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
                    <p className="text-text-light text-sm leading-relaxed">{ocasiao.chamada}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ============ FAQ ============ */}
        <Faq itens={PERGUNTAS} />

        <section className="max-w-5xl mx-auto px-4 pb-16 text-center">
          <Link to="/cardapio" className="no-underline">
            <Button size="lg" className="gap-2">
              Ver o cardápio
              <HiArrowRight size={18} />
            </Button>
          </Link>
        </section>
      </div>
    </>
  )
}
