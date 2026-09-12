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

import { areaAtendida } from '../content/entrega'

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

/**
 * O servico que a pagina de ocasiao descreve, e onde ele e prestado.
 *
 * Sem isto, uma pagina de ocasiao e texto solto: o buscador le "salgados para
 * casamento" e nao tem como ligar aquilo a um fornecedor nem a uma cidade. O
 * `areaServed` carrega a area atendida (ver content/entrega.js), e
 * o `provider` aponta para a loja ja declarada no index.html -- e o mesmo
 * negocio, nao um segundo.
 */
export function servicoJsonLd({ nome, descricao, url, areaServed }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${url}#servico`,
    name: nome,
    description: descricao,
    serviceType: 'Entrega de salgados para eventos',
    provider: { '@id': `${SITE}/#loja` },
    // A pagina de bairro passa o proprio bairro: dizer "Natal" nas 36 apagaria
    // a diferenca entre elas, e e a diferenca que faz cada uma valer uma URL.
    areaServed: areaServed ?? areaAtendida(),
    hasOfferCatalog: { '@id': `${SITE}/cardapio#menu` },
  }
}
