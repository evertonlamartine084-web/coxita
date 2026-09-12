import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { HiArrowRight } from 'react-icons/hi'
import { getFlavors, peekFlavors } from '../../services/flavors'
import { catalogText } from '../../utils/catalogText'
import { slugify } from '../../utils/slug'
import { bairroPorSlug, BAIRROS } from '../../content/bairros'
import { BAIRRO_DA_LOJA, CIDADE, UF } from '../../content/entrega'
import { metaBairro } from '../../content/paginas'
import { LISTA_OCASIOES } from '../../content/ocasioes'
import { conteudoDoSabor } from '../../content/sabores'
import Breadcrumbs from '../../components/content/Breadcrumbs'
import Faq from '../../components/content/Faq'
import { breadcrumbJsonLd, faqJsonLd, servicoJsonLd } from '../../utils/jsonld'
import Button from '../../components/ui/Button'
import Loading from '../../components/ui/Loading'
import Seo from '../../components/ui/Seo'

const SITE = 'https://coxelli.com.br'

/**
 * Pagina de um bairro: /salgados-em-tirol, /salgados-em-ponta-negra...
 *
 * Trinta e seis paginas com o nome do bairro trocado seriam doorway pages --
 * o Google reconhece o padrao e trata como manipulacao. O que salva a pagina e
 * ela dizer algo verdadeiro e diferente sobre AQUELE bairro: a distancia real
 * ate a cozinha, a zona, se e a mesma zona da loja, e quais bairros ficam ao
 * lado. Esses dados existem em content/bairros.js e nenhum deles se repete.
 *
 * O texto tambem muda de forma, nao so de numero: um bairro vizinho da loja nao
 * recebe a mesma frase de um do outro lado da cidade. Ver `comoFalarDaDistancia`.
 */
export default function BairroPage() {
  const { pathname } = useLocation()
  const slug = pathname.replace(/^\/salgados-em-/, '').replace(/\/+$/, '')
  const bairro = bairroPorSlug(slug)

  const saboresEmCache = peekFlavors()
  const [sabores, setSabores] = useState(() => saboresEmCache ?? [])
  const [loading, setLoading] = useState(!saboresEmCache)

  useEffect(() => {
    getFlavors().then(setSabores).catch(console.error).finally(() => setLoading(false))
  }, [])

  const caminho = `/salgados-em-${slug}`
  const url = `${SITE}${caminho}`

  const trilha = useMemo(() => ([
    { nome: 'Início', caminho: '/' },
    { nome: `Salgados em ${CIDADE}`, caminho: '/salgados-em-natal' },
    { nome: bairro?.nome ?? 'Bairro', caminho },
  ]), [bairro, caminho])

  const vizinhos = useMemo(() => {
    if (!bairro) return []
    return bairro.vizinhos.map(v => BAIRROS.find(b => b.slug === v)).filter(Boolean)
  }, [bairro])

  // Quatro sabores para a vitrine. Sempre os mesmos quatro em toda a cidade:
  // o que muda de bairro para bairro e a entrega, nao o que sai da fritadeira.
  const destaques = useMemo(() => sabores.slice(0, 4), [sabores])

  const faq = useMemo(() => (bairro ? perguntasDoBairro(bairro) : []), [bairro])

  const dadosEstruturados = useMemo(() => {
    if (!bairro) return null
    return [
      servicoJsonLd({
        nome: `Salgados em ${bairro.nome}, ${CIDADE}/${UF}`,
        descricao: `Entrega de salgados feitos na hora em ${bairro.nome}, ${CIDADE}/${UF}.`,
        url,
        // Aqui o areaServed e o bairro, nao a cidade: e a pagina do bairro que
        // disputa "salgados no bairro X", e dizer "Natal" nas 36 apagaria a
        // diferenca entre elas.
        areaServed: {
          '@type': 'Place',
          name: `${bairro.nome}, ${CIDADE}, ${UF}`,
          containedInPlace: { '@type': 'City', name: CIDADE },
        },
      }),
      breadcrumbJsonLd(trilha),
      faqJsonLd(faq, url),
    ]
  }, [bairro, trilha, url, faq])

  if (loading) return <Loading />

  if (!bairro) {
    return (
      <>
        <Seo titulo="Bairro não encontrado" caminho={caminho} noindex />
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <h1 className="font-display text-5xl font-black uppercase text-brown mb-4">
            Não achamos esse bairro
          </h1>
          <p className="text-text-light text-lg mb-8">
            A gente entrega em toda {CIDADE}. Veja a lista dos 36 bairros.
          </p>
          <Link to="/salgados-em-natal" className="no-underline">
            <Button size="lg" className="gap-2">
              Ver todos os bairros
              <HiArrowRight size={18} />
            </Button>
          </Link>
        </div>
      </>
    )
  }

  const daCasa = bairro.slug === slugify(BAIRRO_DA_LOJA)
  const mesmaZona = bairro.zona === 'Zona Norte'
  // Mesmo titulo e descricao que o prerender escreve no build. Ver content/paginas.js.
  const meta = metaBairro(bairro)

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
          <div className="max-w-5xl mx-auto px-4 pt-6 pb-12 md:pb-14">
            <Breadcrumbs itens={trilha} />

            <p className="inline-block gingham-blue text-white border-2 border-brown px-3 py-1.5 font-display font-extrabold text-xs uppercase tracking-[0.1em] mb-5 shadow-[3px_3px_0_#5d2b04]">
              {bairro.zona} · {CIDADE}/{UF}
            </p>

            <h1 className="font-display text-5xl sm:text-6xl md:text-7xl font-black uppercase leading-[0.85] tracking-[-0.03em] text-brown mb-5 max-w-3xl">
              Salgados em {bairro.nome}
            </h1>

            <p className="text-brown text-xl md:text-2xl font-semibold leading-snug max-w-2xl mb-4">
              {daCasa
                ? 'É aqui que a gente fica. A cozinha é no bairro.'
                : comoFalarDaDistancia(bairro)}
            </p>

            <p className="text-brown/85 text-lg leading-relaxed max-w-2xl mb-7">
              {textoDoBairro(bairro, daCasa, mesmaZona)}
            </p>

            <Link to="/cardapio" className="no-underline">
              <Button size="lg" className="gap-2">
                Montar meu pedido
                <HiArrowRight size={18} />
              </Button>
            </Link>
          </div>
        </header>

        {/* ============ O QUE CHEGA ============ */}
        {destaques.length > 0 && (
          <section className="max-w-5xl mx-auto px-4 py-12 md:py-14">
            <h2 className="font-display text-4xl md:text-5xl font-black uppercase tracking-tight text-brown mb-2">
              <span className="underline-hand">O que chega em {bairro.nome}</span>
            </h2>
            <p className="text-text-light text-lg leading-relaxed mb-8 max-w-2xl">
              O cardápio é o mesmo em toda {CIDADE}: 15 sabores, montados de 25 em 25 unidades.
            </p>

            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 list-none p-0 m-0">
              {destaques.map(sabor => {
                const nome = catalogText(sabor.name)
                const conteudo = conteudoDoSabor(slugify(sabor.name))
                return (
                  <li key={sabor.id}>
                    <Link
                      to={`/salgados/${slugify(sabor.name)}`}
                      className="no-underline flex flex-col h-full bg-surface border-[3px] border-brown shadow-[5px_5px_0_#5d2b04] p-5 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[3px_3px_0_#5d2b04] transition-[transform,box-shadow] duration-[--duration-fast] ease-[--ease-interaction]"
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

            <Link
              to="/salgados"
              className="inline-flex items-center gap-1.5 mt-6 font-display font-extrabold uppercase text-sm tracking-[0.08em] text-primary no-underline hover:text-brown"
            >
              Ver os 15 sabores
              <HiArrowRight size={14} />
            </Link>
          </section>
        )}

        {/* ============ OCASIÕES ============ */}
        <section className="bg-secondary dots-sun border-y-[6px] border-brown py-12 md:py-14">
          <div className="max-w-5xl mx-auto px-4">
            <h2 className="font-display text-4xl md:text-5xl font-black uppercase tracking-tight text-brown mb-2">
              <span className="underline-hand">Vai ter evento em {bairro.nome}?</span>
            </h2>
            <p className="text-brown/80 font-medium text-lg mb-8 max-w-2xl">
              A quantidade certa muda com a ocasião. Cada uma tem a conta pronta.
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

        {/* ============ PEDIDO ============ */}
        {/* O header e sticky e ja carrega "Pedir agora", mas quem rola ate aqui
            esta lendo, nao olhando para o topo. Este bloco e o unico ponto da
            pagina onde o pedido aparece por extenso, com o bairro no titulo. */}
        <section className="max-w-4xl mx-auto px-4 py-14 md:py-16">
          <div className="bg-brand dots-sun border-[3px] border-brown shadow-[7px_7px_0_#5d2b04] p-7 md:p-10 text-center">
            <h2 className="font-display text-4xl md:text-5xl font-black uppercase leading-[0.9] text-brown mb-3">
              Peça para {bairro.nome}
            </h2>
            <p className="text-brown/85 text-lg leading-relaxed max-w-xl mx-auto mb-7">
              De 25 a 100 salgados, com até 4 sabores no mesmo pacote. Você monta, a gente frita na
              hora e leva até a {bairro.zona}.
            </p>
            <Link to="/cardapio" className="no-underline">
              <Button size="lg" className="gap-2">
                Montar meu pedido
                <HiArrowRight size={18} />
              </Button>
            </Link>
          </div>
        </section>

        {/* ============ FAQ ============ */}
        <Faq itens={faq} titulo={`Entrega em ${bairro.nome}`} />

        {/* ============ VIZINHOS ============ */}
        <section className="max-w-5xl mx-auto px-4 pb-16">
          <h2 className="font-display text-3xl md:text-4xl font-black uppercase tracking-tight text-brown mb-2">
            Aqui do lado
          </h2>
          <p className="text-text-light leading-relaxed mb-6">
            Os bairros mais próximos de {bairro.nome}. A gente entrega em todos.
          </p>
          <ul className="flex flex-wrap gap-2.5 list-none p-0 m-0 mb-8">
            {vizinhos.map(v => (
              <li key={v.slug}>
                <Link
                  to={`/salgados-em-${v.slug}`}
                  className="inline-block no-underline bg-cream border-2 border-brown shadow-[3px_3px_0_#5d2b04] px-4 py-2 font-display font-extrabold uppercase text-sm text-brown hover:bg-brand active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0_#5d2b04] transition-[background-color,transform,box-shadow] duration-[--duration-fast] ease-[--ease-interaction]"
                >
                  {v.nome}
                </Link>
              </li>
            ))}
          </ul>

          <Link
            to="/salgados-em-natal"
            className="font-display font-extrabold uppercase text-sm tracking-[0.08em] text-primary no-underline hover:text-brown inline-flex items-center gap-1.5"
          >
            Ver os 36 bairros de {CIDADE}
            <HiArrowRight size={14} />
          </Link>
        </section>
      </article>
    </>
  )
}

/**
 * A frase de apoio embaixo do H1.
 *
 * Muda de forma, e nao so de numero: "aqui do lado" e "do outro lado da cidade"
 * sao leituras diferentes da mesma distancia, e sao o que impede as 36 paginas
 * de serem a mesma frase com o nome trocado.
 */
function comoFalarDaDistancia(bairro) {
  if (bairro.km <= 3) return `Aqui do lado da cozinha, a ${virgula(bairro.km)} km.`
  if (bairro.km <= 6) return `A ${virgula(bairro.km)} km da cozinha, na ${bairro.zona === 'Zona Norte' ? 'mesma zona' : 'vizinhança'}.`
  if (bairro.km <= 11) return `A ${virgula(bairro.km)} km da nossa cozinha, na Pajuçara.`
  return `Do outro lado da cidade — ${virgula(bairro.km)} km — e a entrega vai do mesmo jeito.`
}

/** Paragrafo de contexto. Varia com a zona e com a posicao relativa a loja. */
function textoDoBairro(bairro, daCasa, mesmaZona) {
  if (daCasa) {
    return `A Coxelli é da ${bairro.nome}: a cozinha fica aqui, e daqui sai tudo que a gente entrega em ${CIDADE}. Se você é do bairro, seu pedido é o que tem o caminho mais curto entre a fritadeira e a mesa.`
  }
  if (mesmaZona) {
    return `${bairro.nome} é ${bairro.zona}, igual à Pajuçara, onde fica a cozinha — são ${virgula(bairro.km)} km entre um ponto e outro. Salgado frito na hora e levado enquanto ainda está quente, sem atravessar a cidade.`
  }
  return `${bairro.nome} fica na ${bairro.zona}, a ${virgula(bairro.km)} km da cozinha, na Pajuçara. A fritura é programada para o horário que você combinar — o que importa não é a distância, é o salgado sair da panela na hora certa para chegar quente.`
}

/** Perguntas da pagina. O texto muda por bairro; a pergunta, nao. */
function perguntasDoBairro(bairro) {
  return [
    {
      pergunta: `Vocês entregam em ${bairro.nome}?`,
      resposta: `Entregamos. ${bairro.nome} fica na ${bairro.zona} de ${CIDADE}, a cerca de ${virgula(bairro.km)} km da nossa cozinha, na Pajuçara. Coloque o endereço no checkout que o sistema calcula a taxa e o prazo do seu caso.`,
    },
    {
      pergunta: `Quanto tempo demora para chegar em ${bairro.nome}?`,
      resposta: `Depende do horário e do trânsito, e por isso o prazo aparece no checkout com o seu endereço, em vez de uma promessa genérica. O que a gente garante é a fritura: ela é programada para o horário combinado, não feita de manhã para entregar à tarde.`,
    },
    {
      pergunta: `Dá para encomendar um cento para uma festa em ${bairro.nome}?`,
      resposta: `Dá, e é o pedido mais comum. O cento aceita até 4 sabores, escolhidos de 25 em 25 unidades. Com dois dias de antecedência a gente garante qualquer combinação.`,
    },
  ]
}

/** 13.9 -> "13,9". Numero com ponto no meio de uma frase em portugues le como erro. */
function virgula(n) {
  return String(n).replace('.', ',')
}
