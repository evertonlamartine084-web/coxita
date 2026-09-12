/**
 * Blocos de Schema.org que acompanham os componentes de conteudo.
 *
 * Vivem fora dos componentes por exigencia do Fast Refresh: arquivo que exporta
 * componente e funcao junto perde o hot reload. Separar tambem deixa explicito
 * que estas funcoes nao renderizam nada -- devolvem objeto para o `Seo.jsx`
 * injetar no <head>.
 *
 * Cada uma recebe a MESMA lista que o componente mostra na tela. Marcar no
 * schema o que nao esta visivel e o caminho curto para perder o rich result.
 */

const SITE = 'https://coxelli.com.br'

/** Trilha de navegacao. Troca a URL crua por "Início > Salgados > Coxinha" na busca. */
export function breadcrumbJsonLd(itens, site = SITE) {
  if (!itens?.length) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: itens.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.nome,
      item: `${site}${item.caminho}`,
    })),
  }
}

/** Perguntas e respostas, para o bloco expansivel do resultado de busca. */
export function faqJsonLd(itens, url) {
  if (!itens?.length) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${url}#faq`,
    mainEntity: itens.map(item => ({
      '@type': 'Question',
      name: item.pergunta,
      acceptedAnswer: { '@type': 'Answer', text: item.resposta },
    })),
  }
}
