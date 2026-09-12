import { useEffect } from 'react'

const SITE = 'https://coxelli.com.br'
const SUFIXO = 'Coxelli Salgados'

/**
 * Título, descrição e canonical por página.
 *
 * O site é uma SPA: o navegador carrega um `index.html` só e troca o conteúdo por JavaScript.
 * Sem isto, toda rota herda o mesmo título da home — o Google indexa cardápio, home e tudo mais
 * como se fossem a mesma página, e a aba do navegador nunca diz onde a pessoa está.
 *
 * Não usa biblioteca: são três nós no <head>, e uma dependência a mais para isso não se paga.
 */
export default function Seo({ titulo, descricao, caminho, noindex = false, dadosEstruturados }) {
  useEffect(() => {
    if (titulo) document.title = `${titulo} · ${SUFIXO}`

    const meta = (seletor, criar, valor) => {
      if (!valor) return
      let el = document.head.querySelector(seletor)
      if (!el) {
        el = criar()
        document.head.appendChild(el)
      }
      el.setAttribute(el.tagName === 'LINK' ? 'href' : 'content', valor)
    }

    meta('meta[name="description"]', () => {
      const m = document.createElement('meta'); m.name = 'description'; return m
    }, descricao)

    meta('link[rel="canonical"]', () => {
      const l = document.createElement('link'); l.rel = 'canonical'; return l
    }, caminho ? `${SITE}${caminho}` : null)

    // og:title acompanha o título da página, senão o compartilhamento de /cardapio anuncia a home
    meta('meta[property="og:title"]', () => {
      const m = document.createElement('meta'); m.setAttribute('property', 'og:title'); return m
    }, titulo ? `${titulo} · ${SUFIXO}` : null)

    // Páginas de compra e de pedido não devem entrar em busca: são etapas particulares.
    // O robots.txt já pede isso, mas ele é uma orientação — a meta é uma instrução.
    // JSON-LD da pagina, alem do bloco fixo da loja no index.html. Marcado com
    // data-seo para nao encostar naquele: um remove o outro se compartilharem seletor.
    const anterior = document.head.querySelector('script[data-seo="pagina"]')
    if (anterior) anterior.remove()
    if (dadosEstruturados) {
      const script = document.createElement('script')
      script.type = 'application/ld+json'
      script.dataset.seo = 'pagina'
      script.textContent = JSON.stringify(dadosEstruturados)
      document.head.appendChild(script)
    }

    let robots = document.head.querySelector('meta[name="robots"]')
    if (noindex) {
      if (!robots) {
        robots = document.createElement('meta')
        robots.name = 'robots'
        document.head.appendChild(robots)
      }
      robots.setAttribute('content', 'noindex, nofollow')
    } else if (robots) {
      robots.remove()
    }
  }, [titulo, descricao, caminho, noindex, dadosEstruturados])

  return null
}
