import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Seo from '../../components/ui/Seo'
import Reveal from '../../components/ui/Reveal'
import SplitText from '../../components/ui/SplitText'
import { getSettings, peekSettings } from '../../services/settings'
import { metaGourmet } from '../../content/paginas'
import {
  ANTECEDENCIA_HORAS, CAIXA_DEGUSTACAO, FOLGA_CAMADA, SABORES_GOURMET, saborPorSlug,
} from '../../content/gourmet'

/**
 * Coxelli Gourmet — a linha de tarteletes e empadinhas da marca, para presente e evento.
 *
 * É a Coxelli de sempre vestida de preto: o logo verdadeiro com "gourmet" ao lado, o laranja
 * da marca e as formas orgânicas dos posts e da sacola, com as fontes do próprio site. As duas tentativas anteriores
 * (serifa com dourado, depois confeitaria clara) pareceram genéricas justamente por inventar
 * uma identidade em vez de usar a da loja.
 *
 * Ainda sem preço: toda escolha vira uma mensagem de WhatsApp com a composição pronta, e a loja
 * confirma valor e data.
 */

const WHATSAPP_PADRAO = '(84) 99616-9478'

// Só a palavra "gourmet" usa esta serifa: fina e em itálico, ao lado do logo gordinho da marca
const FONTE_ASSINATURA = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,300;1,400&display=swap'

function useFonteAssinatura() {
  useEffect(() => {
    if (document.querySelector(`link[href="${FONTE_ASSINATURA}"]`)) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = FONTE_ASSINATURA
    document.head.appendChild(link)
  }, [])
}

/**
 * A palavra de destaque de cada título, na mesma letra fina e itálica do "gourmet" do logo:
 * tira o peso das caixas altas e amarra os títulos à assinatura. Laranja no fundo preto;
 * na seção laranja herda o preto do título.
 */
function Italico({ children, className = 'text-gourmet-terra' }) {
  return <span className={`italico-gourmet ${className}`}>{children}</span>
}

/** O logo normal da Coxelli com "gourmet" ao lado, delicado. */
function Assinatura({ tamanho = 'h-10 sm:h-12', className = '' }) {
  return (
    <span className={`inline-flex items-end gap-2.5 ${className}`}>
      <img src="/wordmark.png" alt="Coxelli" width={800} height={315} className={`${tamanho} w-auto`} />
      <span className="gourmet-assina mb-0.5 font-['Cormorant_Garamond',Georgia,serif] text-[1.7rem] font-light italic leading-none tracking-wide text-gourmet-ink sm:text-[2rem]">
        gourmet
      </span>
    </span>
  )
}

/** Se a página já desceu um pouco: é o que muda o menu fixo de transparente para com fundo. */
function useRolou() {
  const [rolou, setRolou] = useState(false)
  useEffect(() => {
    const ver = () => setRolou(window.scrollY > 24)
    ver()
    window.addEventListener('scroll', ver, { passive: true })
    return () => window.removeEventListener('scroll', ver)
  }, [])
  return rolou
}

function abrirWhatsApp(telefone, texto) {
  const numero = telefone.replace(/\D/g, '')
  window.open(`https://wa.me/55${numero}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener')
}

/** Data mínima dos campos de data: agora + antecedência, no fuso do navegador. */
function dataMinima() {
  const d = new Date(Date.now() + ANTECEDENCIA_HORAS * 3600_000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const dataPorExtenso = (iso) =>
  iso ? new Date(`${iso}T12:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) : ''

function Foto({ foto, alt, className = '', prioridade = false, sizes = '(min-width: 1024px) 45vw, 92vw', style }) {
  return (
    <img
      src={foto.srcPequena}
      srcSet={`${foto.srcPequena} 600w, ${foto.src} 1200w`}
      sizes={sizes}
      width={1200}
      height={1600}
      alt={alt}
      loading={prioridade ? 'eager' : 'lazy'}
      fetchPriority={prioridade ? 'high' : undefined}
      decoding="async"
      className={`foto h-full w-full object-cover ${className}`}
      style={style}
    />
  )
}

// Quanto a foto passa da moldura para cada lado: é a faixa onde as flores aparecem por fora
const VAZAMENTO = '-9%'

/**
 * Foto em que as flores vazam a moldura. A mesma foto vai em duas camadas do mesmo tamanho,
 * um pouco maiores que a moldura: a de baixo é cortada pela moldura arredondada, e a de cima
 * mostra só as flores (máscara `foto.flores`), então o que era flor na faixa cortada fica por
 * fora. As duas têm o mesmo tamanho e o mesmo `object-cover` (e a máscara usa `cover`), por isso
 * a flor de cima cai exatamente em cima da de baixo.
 */
function FotoVazada({ foto, alt, prioridade, sizes, className = '', delay, raio = 'rounded-[2rem]' }) {
  const mascara = {
    maskImage: `url(${foto.flores})`, WebkitMaskImage: `url(${foto.flores})`,
    maskSize: 'cover', WebkitMaskSize: 'cover',
    maskPosition: 'center', WebkitMaskPosition: 'center',
    maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat',
  }
  return (
    <Reveal delay={delay} className={`foto-entra relative ${className}`}>
      <div className={`absolute inset-0 overflow-hidden ${raio}`}>
        <div className="absolute" style={{ inset: VAZAMENTO }}>
          <Foto foto={foto} alt={alt} prioridade={prioridade} sizes={sizes} />
        </div>
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute" style={{ inset: VAZAMENTO }}>
        {foto.camada ? (
          // Camada pronta: a foto inteira (3:4) centralizada, que é onde o object-cover a põe;
          // ela passa do enquadramento em cima e embaixo, e é isso que deixa a flor aparecer inteira
          <div className="camada-flores absolute left-0 top-1/2 aspect-[3/4] w-full -translate-y-1/2">
            <img
              src={foto.camada} alt="" loading={prioridade ? 'eager' : 'lazy'} decoding="async"
              className="absolute left-0 w-full"
              style={{ top: `${-FOLGA_CAMADA * 100}%`, height: `${(1 + FOLGA_CAMADA) * 100}%`, transform: 'none' }}
            />
          </div>
        ) : (
          <Foto foto={foto} alt="" prioridade={prioridade} sizes={sizes} style={mascara} />
        )}
      </div>
    </Reveal>
  )
}

/**
 * Borda em onda da seção laranja: faz o laranja entrar e sair do preto com a curva das formas
 * da marca, em vez de um corte reto. Fica colada na seção, por fora dela.
 */
function Onda({ className = '' }) {
  return (
    <svg viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true" className={`pointer-events-none absolute left-0 h-8 w-full text-gourmet-terra sm:h-12 ${className}`}>
      <path fill="currentColor" d="M0 60V38C180 12 360 4 560 18s380 36 560 26 260-26 320-34V60z" />
    </svg>
  )
}

/** Título de seção: condensado e em caixa alta, como nos títulos do site da Coxelli. */
function Titulo({ children, apoio, id, claro = true }) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <h2 id={id} className={`font-display text-4xl font-extrabold uppercase leading-none sm:text-5xl ${claro ? 'text-gourmet-ink' : 'text-gourmet-paper'}`}>
        {children}
      </h2>
      {apoio && (
        <p className={`mx-auto mt-4 max-w-xl text-[1.05rem] leading-relaxed ${claro ? 'text-gourmet-cocoa' : 'text-gourmet-paper/80'}`}>{apoio}</p>
      )}
    </Reveal>
  )
}

function Contador({ valor, aoMudar, nome }) {
  const botao = 'flex size-9 cursor-pointer items-center justify-center rounded-full border-2 border-gourmet-paper text-lg font-bold text-gourmet-paper transition-colors hover:bg-gourmet-paper hover:text-gourmet-terra disabled:cursor-default disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-gourmet-paper'
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={`Quantidade de ${nome}`}>
      <button type="button" className={botao} onClick={() => aoMudar(valor - 1)} disabled={valor === 0} aria-label={`Menos ${nome}`}>−</button>
      <span key={valor} className="pop w-8 text-center font-display text-2xl font-bold tabular-nums" aria-live="polite">{valor}</span>
      <button type="button" className={botao} onClick={() => aoMudar(valor + 1)} aria-label={`Mais ${nome}`}>+</button>
    </div>
  )
}

const rotuloCampo = 'mb-1.5 block text-sm font-medium text-gourmet-cocoa'
const campo = 'w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-base text-gourmet-ink outline-none transition-colors placeholder:text-gourmet-cocoa/60 focus:border-gourmet-terra'
const botao = 'inline-flex min-h-12 cursor-pointer items-center justify-center rounded-full bg-gourmet-terra px-8 font-display text-lg font-bold uppercase tracking-wide text-gourmet-paper transition-[background-color,translate,box-shadow] duration-300 hover:-translate-y-0.5 hover:bg-gourmet-ink hover:shadow-[0_10px_30px_-10px_rgb(242_140_40/0.6)] active:translate-y-0 disabled:translate-y-0 disabled:shadow-none disabled:cursor-default disabled:opacity-40 disabled:hover:bg-gourmet-terra'

export default function GourmetPage() {
  useFonteAssinatura()
  const meta = metaGourmet()
  const [settings, setSettings] = useState(() => peekSettings() ?? {})
  useEffect(() => { getSettings().then(setSettings).catch(() => {}) }, [])
  const telefone = settings.whatsapp || WHATSAPP_PADRAO
  const [minimo] = useState(dataMinima)
  const rolou = useRolou()

  return (
    <div className="min-h-screen overflow-x-clip bg-gourmet-paper text-gourmet-ink [color-scheme:dark]">
      <Seo titulo={meta.titulo} descricao={meta.descricao} caminho={meta.caminho} />

      {/* Fixo no topo. Transparente no começo da página; ao descer, ganha fundo escuro desfocado
          e fica mais baixo, para o logo e o menu continuarem à mão sem cobrir as fotos */}
      <header className={`sticky top-0 z-30 transition-[background-color,box-shadow] duration-500 ${rolou ? 'bg-gourmet-paper/70 shadow-[0_1px_0_rgb(255_255_255/0.06)] backdrop-blur-lg' : ''}`}>
        <div className={`mx-auto flex max-w-6xl items-center justify-between px-5 transition-[padding] duration-500 sm:px-8 ${rolou ? 'py-2.5' : 'py-5'}`}>
          <Link to="/gourmet" className="no-underline" aria-label="Coxelli Gourmet">
            <Assinatura />
          </Link>
          <nav className="flex items-center gap-6 font-display text-base font-semibold uppercase tracking-wide" aria-label="Seções">
            <a href="#sabores" className="hidden text-gourmet-cocoa no-underline hover:text-gourmet-terra md:inline">Sabores</a>
            <a href="#monte" className="hidden text-gourmet-cocoa no-underline hover:text-gourmet-terra md:inline">Monte a sua</a>
            <a href="#eventos" className="hidden text-gourmet-cocoa no-underline hover:text-gourmet-terra md:inline">Eventos</a>
            <Link to="/" className="text-gourmet-cocoa no-underline hover:text-gourmet-terra">Salgados</Link>
          </nav>
        </div>
      </header>

      <main>
        {/* No computador a abertura ocupa a tela inteira, descontado o menu (5.5rem) */}
        <section className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-6 sm:px-8 lg:min-h-[calc(100svh-5.5rem)] lg:grid-cols-[1fr_1.05fr] lg:py-10">
          <div className="text-center lg:text-left">
            <Reveal as="p" className="font-display text-lg font-bold uppercase tracking-[0.2em] text-gourmet-terra">Sob encomenda</Reveal>
            {/* SplitText só divide texto puro: a palavra em itálico entra depois, com o atraso dela */}
            <h1 aria-label="Tarteletes e empadinhas para ocasiões especiais" className="mt-3 font-display text-5xl font-extrabold uppercase leading-[0.95] sm:text-6xl lg:text-7xl">
              <SplitText aria-hidden="true" delay={150} passo={70}>Tarteletes e empadinhas para ocasiões</SplitText>{' '}
              <span aria-hidden="true" className="palavra italico-gourmet text-gourmet-terra" style={{ '--palavra-delay': '500ms' }}>especiais</span>
            </h1>
            <Reveal as="p" delay={550} className="mx-auto mt-6 max-w-md text-lg leading-relaxed text-gourmet-cocoa lg:mx-0">
              Salgadas e doces, feitas à mão e arrumadas em caixa com laço. Para presentear,
              receber em casa ou servir num evento.
            </Reveal>
            <Reveal delay={700} className="mt-9 flex flex-col items-center gap-4 sm:flex-row sm:justify-center lg:justify-start">
              <a href="#caixa" className={`${botao} no-underline`}>Encomendar</a>
              <a href="#eventos" className="group font-display text-lg font-bold uppercase tracking-wide text-gourmet-ink no-underline transition-colors hover:text-gourmet-terra">
                Orçamento para evento <span aria-hidden="true" className="inline-block transition-transform duration-300 group-hover:translate-x-1.5">→</span>
              </a>
            </Reveal>
          </div>

          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <FotoVazada
              delay={250}
              className="aspect-[4/5]"
              foto={CAIXA_DEGUSTACAO.fotos.abertura}
              alt="Caixa Coxelli Gourmet aberta: tarteletes caprese à frente, frango, frutas, doce de leite e empadinhas atrás"
              prioridade
            />
          </div>
        </section>

        <section id="sabores" aria-labelledby="titulo-sabores" className="scroll-mt-6 bg-[linear-gradient(to_bottom,var(--color-gourmet-paper),var(--color-gourmet-ivory)_18%,var(--color-gourmet-ivory)_82%,var(--color-gourmet-paper))] px-5 py-24 sm:px-8 sm:py-32">
          <Titulo id="titulo-sabores" apoio="Três salgados e três doces, do tamanho de uma mordida.">Os <Italico>sabores</Italico></Titulo>
          <ul className="mx-auto mt-14 grid max-w-6xl list-none grid-cols-2 gap-x-4 gap-y-10 p-0 sm:grid-cols-3 sm:gap-x-8 sm:gap-y-14">
            {SABORES_GOURMET.map((sabor, i) => (
              <Reveal as="li" key={sabor.slug} delay={(i % 3) * 120} className="foto-entra">
                {/* Com mouse, a foto na mão dá lugar à foto no prato. A do prato só existe em aparelho
                    com mouse (`hidden` no resto): assim o celular nem baixa a foto que nunca veria. */}
                <div className="group relative aspect-[4/5] overflow-hidden rounded-3xl">
                  <Foto
                    foto={sabor.foto}
                    alt={`${sabor.nome}: ${sabor.descricao}`}
                    sizes="(min-width: 640px) 30vw, 46vw"
                    className="motion-safe:group-hover:scale-[1.04]"
                  />
                  <div aria-hidden="true" className="absolute inset-0 hidden opacity-0 transition-opacity duration-[1200ms] ease-in-out group-hover:opacity-100 [@media(hover:hover)]:block">
                    <Foto foto={sabor.fotoPrato} alt="" sizes="(min-width: 640px) 30vw, 46vw" className="motion-safe:group-hover:scale-[1.04]" />
                  </div>
                </div>
                <p className="mt-4 font-display text-sm font-bold uppercase tracking-[0.18em] text-gourmet-terra">
                  {sabor.tipo === 'doce' ? 'Doce' : 'Salgada'}
                </p>
                <h3 className="mt-1 font-display text-2xl font-extrabold uppercase leading-tight sm:text-3xl">{sabor.nome}</h3>
                <p className="mt-2 text-[0.95rem] leading-relaxed text-gourmet-cocoa">{sabor.descricao}</p>
              </Reveal>
            ))}
          </ul>
        </section>

        <CaixaDegustacao telefone={telefone} minimo={minimo} />
        <MonteSuaCaixa telefone={telefone} minimo={minimo} />
        <Eventos telefone={telefone} minimo={minimo} />
      </main>

      <footer className="px-5 py-12 text-center sm:px-8">
        <div aria-hidden="true" className="mx-auto mb-12 h-px max-w-3xl bg-[linear-gradient(to_right,transparent,rgb(255_255_255/0.14),transparent)]" />
        <Assinatura tamanho="h-10" className="justify-center" />
        <p className="mt-5 text-[0.95rem] text-gourmet-cocoa">
          Encomendas com pelo menos {ANTECEDENCIA_HORAS} horas de antecedência.
        </p>
        <p className="mt-1 text-[0.95rem] text-gourmet-cocoa">{settings.address || 'Pajuçara, Natal/RN'}</p>
        <p className="mt-5">
          <a href={`https://wa.me/55${telefone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="font-display text-lg font-bold uppercase tracking-wide text-gourmet-terra no-underline hover:text-gourmet-ink">
            WhatsApp {telefone}
          </a>
        </p>
      </footer>
    </div>
  )
}

function CaixaDegustacao({ telefone, minimo }) {
  const [data, setData] = useState('')
  const caixa = CAIXA_DEGUSTACAO

  const pedir = () => {
    const linhas = [
      'Olá! Quero encomendar da linha Coxelli Gourmet:',
      '',
      `${caixa.nome} (${caixa.pecas} unidades)`,
      ...caixa.composicao.map(c => `${c.quantidade} ${saborPorSlug(c.slug).nome}`),
      '',
      data ? `Para ${dataPorExtenso(data)}` : 'Data a combinar',
    ]
    abrirWhatsApp(telefone, linhas.join('\n'))
  }

  return (
    <section id="caixa" aria-labelledby="titulo-caixa" className="scroll-mt-6 px-5 py-20 sm:px-8 sm:py-28">
      {/* No computador a foto estica até a altura do texto: começa no "A caixa pronta" e termina
          com a última linha, em vez de ficar centralizada com sobra em cima e embaixo */}
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2 lg:items-stretch lg:gap-20">
        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <FotoVazada
            className="aspect-[4/5] lg:absolute lg:inset-0 lg:aspect-auto"
            foto={caixa.fotos.principal}
            alt="Caixa Degustação vista de cima, com as tarteletes em fileiras"
          />
        </div>

        <Reveal className="text-center lg:text-left">
          <p className="font-display text-lg font-bold uppercase tracking-[0.2em] text-gourmet-terra">A caixa pronta</p>
          <h2 id="titulo-caixa" className="mt-2 font-display text-5xl font-extrabold uppercase leading-none sm:text-6xl">Caixa <Italico>degustação</Italico></h2>
          <p className="mt-3 text-lg text-gourmet-cocoa">{caixa.pecas} unidades, salgadas e doces</p>

          <ul className="mx-auto mt-8 max-w-sm list-none space-y-3 p-0 text-lg lg:mx-0">
            {caixa.composicao.map((c, i) => (
              <Reveal as="li" key={c.slug} delay={200 + i * 90} className="flex items-baseline gap-4 border-b border-white/10 pb-3">
                <span className="w-6 font-display text-2xl font-extrabold text-gourmet-terra tabular-nums">{c.quantidade}</span>
                <span>{saborPorSlug(c.slug).nome}</span>
              </Reveal>
            ))}
          </ul>

          <p className="mx-auto mt-7 max-w-sm leading-relaxed text-gourmet-cocoa lg:mx-0">
            Em caixa branca com visor, fechada com laço, dentro da sacola Coxelli.
          </p>

          <div className="mx-auto mt-9 max-w-sm text-left lg:mx-0">
            <label className="block">
              <span className={rotuloCampo}>Para quando?</span>
              <input type="date" min={minimo} value={data} onChange={e => setData(e.target.value)} className={campo} />
            </label>
            <button type="button" onClick={pedir} className={`${botao} mt-5 w-full`}>Encomendar pelo WhatsApp</button>
            <p className="mt-3 text-center text-sm text-gourmet-cocoa">O valor é confirmado na conversa.</p>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function MonteSuaCaixa({ telefone, minimo }) {
  const [qtd, setQtd] = useState({})
  const [data, setData] = useState('')
  const total = Object.values(qtd).reduce((s, n) => s + n, 0)
  const mudar = (slug, n) => setQtd(q => ({ ...q, [slug]: Math.max(0, n) }))

  const pedir = () => {
    const linhas = [
      'Olá! Quero montar uma caixa da linha Coxelli Gourmet:',
      '',
      ...SABORES_GOURMET.filter(s => qtd[s.slug] > 0).map(s => `${qtd[s.slug]} ${s.nome}`),
      `Total: ${total} unidades`,
      '',
      data ? `Para ${dataPorExtenso(data)}` : 'Data a combinar',
    ]
    abrirWhatsApp(telefone, linhas.join('\n'))
  }

  // Seção laranja, como as peças da marca: texto e controles em preto sobre o laranja Coxelli
  return (
    <section id="monte" aria-labelledby="titulo-monte" className="relative scroll-mt-6 bg-gourmet-terra px-5 py-20 text-gourmet-paper sm:px-8 sm:py-24">
      <Onda className="bottom-full translate-y-px" />
      <Onda className="top-full -translate-y-px rotate-180" />
      <Titulo id="titulo-monte" claro={false} apoio="Escolha quantas unidades de cada sabor. A gente arruma na caixa e confirma com você.">
        Monte a <Italico className="">sua</Italico> caixa
      </Titulo>

      <div className="mx-auto mt-12 max-w-xl">
        <ul className="m-0 list-none p-0">
          {SABORES_GOURMET.map(sabor => (
            <li key={sabor.slug} className="flex items-center gap-4 border-b-2 border-gourmet-paper/15 py-3.5">
              <div className="size-14 shrink-0 overflow-hidden rounded-full border-2 border-gourmet-paper">
                <Foto foto={sabor.foto} alt="" sizes="56px" className="object-[50%_40%]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="m-0 font-display text-2xl font-extrabold uppercase leading-none">{sabor.nome}</p>
                <p className="m-0 mt-1 text-sm font-medium">{sabor.tipo === 'doce' ? 'Doce' : 'Salgada'}</p>
              </div>
              <Contador valor={qtd[sabor.slug] ?? 0} aoMudar={n => mudar(sabor.slug, n)} nome={sabor.nome} />
            </li>
          ))}
        </ul>

        <div className="mt-6 flex items-baseline justify-between">
          <span className="font-display text-xl font-bold uppercase">Sua caixa</span>
          <span className="font-display text-4xl font-extrabold tabular-nums">{total} <span className="text-2xl">{total === 1 ? 'unidade' : 'unidades'}</span></span>
        </div>

        <label className="mt-6 block">
          <span className="mb-1.5 block text-sm font-semibold">Para quando?</span>
          <input
            type="date" min={minimo} value={data} onChange={e => setData(e.target.value)}
            className="w-full rounded-xl border-2 border-gourmet-paper/25 bg-gourmet-paper/10 px-4 py-3 text-base text-gourmet-paper outline-none [color-scheme:light] focus:border-gourmet-paper"
          />
        </label>

        <button
          type="button" onClick={pedir} disabled={total === 0}
          className="mt-5 inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-full bg-gourmet-paper px-8 font-display text-lg font-bold uppercase tracking-wide text-gourmet-terra transition-colors hover:bg-gourmet-ivory disabled:cursor-default disabled:opacity-40"
        >
          Enviar minha caixa pelo WhatsApp
        </button>
        <p className="mt-3 text-center text-sm font-medium">
          {total === 0 ? 'Escolha ao menos um sabor.' : 'O valor é confirmado na conversa.'}
        </p>
      </div>
    </section>
  )
}

function Eventos({ telefone, minimo }) {
  const [form, setForm] = useState({ nome: '', data: '', pessoas: '', tipo: '', obs: '' })
  const [sabores, setSabores] = useState([])
  const mudar = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const alternar = (slug) => setSabores(s => (s.includes(slug) ? s.filter(x => x !== slug) : [...s, slug]))

  const pedir = (e) => {
    e.preventDefault()
    const linhas = [
      'Olá! Quero um orçamento da linha Coxelli Gourmet para um evento.',
      '',
      form.nome && `Nome: ${form.nome}`,
      form.tipo && `Evento: ${form.tipo}`,
      form.data && `Data: ${dataPorExtenso(form.data)}`,
      form.pessoas && `Convidados: ${form.pessoas}`,
      sabores.length > 0 && `Sabores: ${sabores.map(s => saborPorSlug(s).nome).join(', ')}`,
      form.obs && `\n${form.obs}`,
    ].filter(Boolean)
    abrirWhatsApp(telefone, linhas.join('\n'))
  }

  return (
    <section id="eventos" aria-labelledby="titulo-eventos" className="scroll-mt-6 px-5 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto grid max-w-6xl gap-14 lg:grid-cols-2 lg:gap-20">
        <Reveal>
          <p className="font-display text-lg font-bold uppercase tracking-[0.2em] text-gourmet-terra">Eventos</p>
          <h2 id="titulo-eventos" className="mt-2 font-display text-5xl font-extrabold uppercase leading-none sm:text-6xl">
            Para a mesa da sua <Italico>festa</Italico>
          </h2>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-gourmet-cocoa">
            Casamentos, aniversários, coquetéis e encontros de empresa. Conte a data e quantas pessoas
            vão estar lá, e a gente monta a proposta.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4">
            <FotoVazada
              delay={150} className="aspect-[4/5]" raio="rounded-3xl"
              foto={saborPorSlug('caprese').fotoPrato} alt="Tarteletes caprese servidas em prato branco" sizes="(min-width: 1024px) 22vw, 46vw"
            />
            <FotoVazada
              delay={300} className="mt-8 aspect-[4/5]" raio="rounded-3xl"
              foto={saborPorSlug('frutas').fotoPrato} alt="Tarteletes de frutas em fileira num prato branco" sizes="(min-width: 1024px) 22vw, 46vw"
            />
          </div>
        </Reveal>

        <Reveal as="form" delay={150} onSubmit={pedir} className="self-center">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className={rotuloCampo}>Seu nome</span>
              <input value={form.nome} onChange={mudar('nome')} className={campo} autoComplete="name" />
            </label>
            <label className="block">
              <span className={rotuloCampo}>Data do evento</span>
              <input type="date" min={minimo} required value={form.data} onChange={mudar('data')} className={campo} />
            </label>
            <label className="block">
              <span className={rotuloCampo}>Número de convidados</span>
              <input type="number" min="1" inputMode="numeric" required value={form.pessoas} onChange={mudar('pessoas')} className={campo} placeholder="Ex.: 80" />
            </label>
            <label className="block sm:col-span-2">
              <span className={rotuloCampo}>Tipo de evento</span>
              <input value={form.tipo} onChange={mudar('tipo')} className={campo} placeholder="Casamento, aniversário, coquetel…" />
            </label>
          </div>

          <fieldset className="mt-6 border-0 p-0">
            <legend className={rotuloCampo}>Sabores que você gostaria de ter</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {SABORES_GOURMET.map(s => {
                const ativo = sabores.includes(s.slug)
                return (
                  <button
                    key={s.slug} type="button" onClick={() => alternar(s.slug)} aria-pressed={ativo}
                    className={`cursor-pointer rounded-full border px-4 py-2 text-[0.95rem] font-medium transition-colors ${ativo ? 'border-gourmet-terra bg-gourmet-terra text-gourmet-paper' : 'border-white/15 text-gourmet-ink hover:border-gourmet-terra'}`}
                  >
                    {s.nome}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <label className="mt-6 block">
            <span className={rotuloCampo}>Algo mais que devemos saber</span>
            <textarea value={form.obs} onChange={mudar('obs')} rows={3} className={`${campo} resize-none`} placeholder="Local, horário, restrições…" />
          </label>

          <button type="submit" className={`${botao} mt-8 w-full`}>Pedir orçamento pelo WhatsApp</button>
        </Reveal>
      </div>
    </section>
  )
}
