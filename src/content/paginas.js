/**
 * Titulo, descricao e caminho de cada pagina publica -- em um lugar so.
 *
 * Existem dois consumidores, e e por isso que este arquivo existe:
 *
 *  1. As paginas React, que passam isto ao `<Seo>` e escrevem no <head> depois
 *     que o JavaScript roda.
 *  2. `scripts/prerender.mjs`, que escreve o mesmo no HTML durante o build,
 *     para quem nunca executa JavaScript -- o crawler do WhatsApp, o Bing, os
 *     robos de IA.
 *
 * Os imports daqui levam `.js` explicito: o Vite dispensa, o Node nao, e este
 * modulo roda nos dois.
 *
 * Se cada lado calculasse o proprio titulo, os dois divergiriam no primeiro
 * ajuste de copy, e a divergencia seria invisivel: a tela continuaria certa
 * enquanto o link compartilhado mostraria outra coisa. Funcoes puras, sem DOM e
 * sem rede, justamente para rodar nos dois ambientes.
 */

import { slugify } from '../utils/slug.js'
import { catalogText } from '../utils/catalogText.js'
import { conteudoDoSabor } from './sabores.js'
import { LISTA_OCASIOES } from './ocasioes.js'
import { BAIRROS } from './bairros.js'
import { CIDADE, UF, BAIRRO_DA_LOJA } from './entrega.js'

export const SITE = 'https://coxelli.com.br'
export const SUFIXO = 'Coxelli Salgados'

/** O que o <title> vira na aba e na busca. O `Seo.jsx` aplica o mesmo formato. */
export function tituloCompleto(titulo) {
  return `${titulo} · ${SUFIXO}`
}

export function metaHome() {
  return {
    caminho: '/',
    titulo: 'Salgados em Natal/RN, feitos na hora',
    h1: 'Salgado de festa. Recheio de verdade.',
    descricao: 'Coxelli Salgados, na Pajuçara, em Natal/RN. Monte seu cento de salgados, misture os sabores e receba pronto pra servir: coxinha, risole, pastelzinho e mais.',
  }
}

export function metaCardapio() {
  return {
    caminho: '/cardapio',
    titulo: 'Cardápio',
    h1: 'Cardápio',
    descricao: 'Centos, meios centos e combos de salgados em Natal/RN. Escolha o tamanho e misture os sabores como quiser.',
  }
}

export function metaIndiceDeSabores() {
  return {
    caminho: '/salgados',
    titulo: 'Salgados em Natal/RN — todos os sabores',
    h1: 'Todos os sabores, um por um',
    descricao: 'Os 15 sabores de salgado da Coxelli, na Pajuçara, em Natal/RN: coxinha, risole, kibe, baiãozinho de camarão, pastel sertanejo e mais. Feitos na hora.',
  }
}

/** `sabor` e a linha do banco. Sem entrada editorial, cai na descricao curta. */
export function metaSabor(sabor) {
  const slug = slugify(sabor.name)
  const nome = catalogText(sabor.name)
  const conteudo = conteudoDoSabor(slug)
  return {
    caminho: `/salgados/${slug}`,
    titulo: conteudo?.tituloSeo || nome,
    h1: nome,
    descricao:
      conteudo?.descricao ||
      `${nome} feito na hora em ${CIDADE}/${UF}. ${catalogText(sabor.description || '')}`.trim(),
  }
}

export function metaOcasiao(ocasiao) {
  return {
    caminho: `/${ocasiao.slug}`,
    titulo: ocasiao.tituloSeo,
    h1: ocasiao.h1,
    descricao: ocasiao.descricao,
  }
}

export function metaIndiceDeBairros() {
  return {
    caminho: '/salgados-em-natal',
    titulo: `Salgados em ${CIDADE}/${UF} — entrega nos 36 bairros`,
    h1: `Salgados em ${CIDADE}, nos 36 bairros`,
    descricao: `Cento de salgados feito na hora, entregue em toda ${CIDADE}/${UF}. Coxinha, risole, kibe, pastel e mais. A loja fica na ${BAIRRO_DA_LOJA}, Zona Norte.`,
  }
}

export function metaBairro(bairro) {
  const daCasa = bairro.slug === slugify(BAIRRO_DA_LOJA)
  return {
    caminho: `/salgados-em-${bairro.slug}`,
    titulo: `Salgados em ${bairro.nome}, ${CIDADE}/${UF}`,
    h1: `Salgados em ${bairro.nome}`,
    descricao: daCasa
      ? `Salgaderia em ${bairro.nome}, ${CIDADE}/${UF} — é aqui que a Coxelli fica. Cento de salgados feito na hora: coxinha, risole, pastel e mais.`
      : `Entrega de salgados em ${bairro.nome}, ${CIDADE}/${UF}. Cento, meio cento ou 25 unidades, fritos na hora e levados até a ${bairro.zona}.`,
  }
}

/**
 * Todas as rotas publicas que devem existir como HTML proprio.
 *
 * `sabores` vem do banco; sem ele a lista sai sem as paginas de sabor, e o
 * prerender avisa em vez de inventar. Carrinho, checkout e acompanhamento
 * ficam de fora de proposito: sao `noindex`, e pre-renderizar pagina que pede
 * para nao ser indexada e trabalho para ninguem.
 */
export function todasAsPaginas(sabores = []) {
  return [
    metaHome(),
    metaCardapio(),
    metaIndiceDeSabores(),
    ...LISTA_OCASIOES.map(metaOcasiao),
    metaIndiceDeBairros(),
    ...BAIRROS.map(metaBairro),
    ...sabores.map(metaSabor),
  ]
}
