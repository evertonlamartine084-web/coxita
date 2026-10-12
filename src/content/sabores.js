/**
 * Texto editorial de cada sabor.
 *
 * Por que aqui e nao no banco: o banco guarda o que muda sozinho -- preco,
 * disponibilidade, ordem na vitrine. Isto aqui e copy, e copy se revisa em
 * diff, com historico de quem mudou e por que. Uma coluna `seo_text` no
 * Supabase viraria um textarea no admin que ninguem preenche, e pagina de
 * produto sem texto proprio e exatamente o que o Google chama de doorway page:
 * URL criada para capturar busca, sem nada dentro que justifique a visita.
 *
 * A chave e o slug gerado por `slugify(flavor.name)`. Sabor sem entrada aqui
 * continua funcionando -- a pagina cai na descricao curta do banco --, so nao
 * compete por busca. Ver `src/utils/slug.js`.
 *
 * Campos:
 *  - `tituloSeo`  <title> sem o sufixo da marca (o Seo.jsx acrescenta).
 *                 Cabe em ~60 caracteres contando o sufixo.
 *  - `descricao`  meta description, ~155 caracteres, com a intencao de busca.
 *  - `chamada`    linha de apoio embaixo do H1.
 *  - `texto`      paragrafos. E o conteudo que da substancia a pagina.
 *  - `combina`    sugestao de montagem -- vira link interno para outros sabores.
 *  - `faq`        vira FAQPage no JSON-LD e bloco visivel. Perguntas reais de
 *                 WhatsApp, nao pergunta inventada para encher schema.
 */

export const CONTEUDO_SABORES = {
  'coxinha-de-frango': {
    tituloSeo: 'Coxinha de frango em Natal/RN',
    descricao: 'Coxinha de frango feita na hora em Natal/RN. Frango desfiado no dia, massa fina e crocante. Monte seu cento a partir de 25 unidades.',
    chamada: 'A que todo mundo pede primeiro.',
    texto: [
      'Frango desfiado no dia, refogado com cebola, alho e cheiro verde. Nada de frango processado ou desfiado na véspera — a diferença aparece no primeiro pedaço, e é por isso que ela continua sendo a mais pedida do cardápio.',
      'A massa é fina de propósito. Coxinha de massa grossa enche antes de a pessoa sentir o recheio, e quem come salgado de festa come mais de um. A nossa frita em minutos e chega crocante por fora, ainda quente por dentro.',
    ],
    combina: 'Num cento misto, ela costuma dividir espaço com travesseiro sertanejo e bolinha de queijo — três texturas diferentes na mesma bandeja.',
    faq: [
      {
        pergunta: 'A coxinha vem frita ou congelada?',
        resposta: 'Vem frita e pronta pra servir. A gente frita perto do horário combinado para o salgado chegar quente na sua casa.',
      },
      {
        pergunta: 'Posso pedir um cento só de coxinha de frango?',
        resposta: 'Pode. O cento aceita de um a quatro sabores — se você quiser as 100 unidades de coxinha de frango, é só colocar tudo nela na hora de montar.',
      },
    ],
  },

  'enroladinho-de-salsicha': {
    tituloSeo: 'Enroladinho de salsicha em Natal/RN',
    descricao: 'Enroladinho de salsicha em Natal/RN: massa leve enrolada na salsicha, feito na hora. O preferido das festas de criança. A partir de 25 unidades.',
    chamada: 'O que as crianças procuram na bandeja.',
    texto: [
      'Salsicha enrolada em massa leve e frita até dourar. Simples de propósito — é o salgado que a criança reconhece de longe e come sem perguntar o que tem dentro.',
      'Em festa infantil, é o primeiro a acabar. Vale calcular com folga quando a maior parte dos convidados tem menos de dez anos.',
    ],
    combina: 'Em festa de criança, o cento mais seguro é enroladinho, coxinha de frango e bolinha de queijo.',
    faq: [
      {
        pergunta: 'Quantos enroladinhos separar para festa infantil?',
        resposta: 'Se a maioria dos convidados é criança, vale destinar cerca de metade do cento a ele. É o sabor com maior chance de repetir.',
      },
    ],
  },

  'bolinha-de-queijo': {
    tituloSeo: 'Bolinha de queijo em Natal/RN',
    descricao: 'Bolinha de queijo em Natal/RN: queijo derretido por dentro, casca crocante. Feita na hora. Cento, meio cento ou 25 unidades.',
    chamada: 'Queijo derretido por dentro.',
    texto: [
      'Queijo dentro de uma massa que frita rápido e fica com a casca fina. Servida quente, o queijo puxa — que é o ponto inteiro desse salgado, e o motivo de ela não ser a melhor escolha para bandeja que vai ficar horas na mesa.',
      'Bandeja de bolinha de queijo se repõe ao longo da festa, em vez de sair tudo de uma vez.',
    ],
    combina: 'Vai bem com qualquer sabor de carne. Num cento misto, funciona como o "coringa" que agrada quem não come frango.',
    faq: [
      {
        pergunta: 'A bolinha de queijo continua boa depois de esfriar?',
        resposta: 'Fica boa, mas o melhor dela é quente, com o queijo puxando. Se puder, sirva essa bandeja mais perto da hora.',
      },
    ],
  },

  'pastel-de-frango': {
    tituloSeo: 'Pastel de frango em Natal/RN',
    descricao: 'Pastel de frango em Natal/RN: frango desfiado temperado no açafrão, massa fina que estala. Cento de pastel a partir de 25 unidades.',
    chamada: 'Frango no açafrão, massa que estala.',
    texto: [
      'Frango desfiado temperado com açafrão, que dá cor e um perfume que o frango puro não tem. A massa é fina e frita rápido, ficando sequinha — pastel que sai da fritura com massa mole é pastel com óleo frio, e isso a gente controla.',
      'O cento de pastel é fechado num sabor só. Cada sabor tem preço próprio, porque o recheio muda o custo — não faria sentido cobrar o mesmo pelo de frango e pelo sertanejo, que leva carne de sol.',
    ],
    combina: 'Se a ideia é variar, monte dois meios centos de sabores diferentes em vez de um cento único.',
    faq: [
      {
        pergunta: 'Posso misturar sabores no cento de pastel?',
        resposta: 'No cento de pastel, não — cada cento vem de um sabor só, porque o preço varia por recheio. Para variar, peça dois meios centos de sabores diferentes.',
      },
      {
        pergunta: 'O pastel chega crocante?',
        resposta: 'Chega. A gente frita perto do horário combinado e embala de forma que o vapor não amoleça a massa no caminho.',
      },
    ],
  },

  'pastel-de-carne': {
    tituloSeo: 'Pastel de carne em Natal/RN',
    descricao: 'Pastel de carne em Natal/RN: carne moída, queijo e cheiro verde, massa fina e crocante. Cento de pastel a partir de 25 unidades.',
    chamada: 'Carne, queijo e cheiro verde.',
    texto: [
      'Carne moída refogada com queijo e cheiro verde. O queijo entra no recheio, não como camada separada — derrete junto com a carne e segura a umidade, o que evita o pastel ressecado.',
      'É o mais pedido dos pastéis, e o que menos erra em bandeja de gente variada.',
    ],
    combina: 'Para um evento, o par mais seguro é meio cento de carne com meio cento de queijo e presunto.',
    faq: [
      {
        pergunta: 'O pastel de carne leva pimenta?',
        resposta: 'Não. O tempero é cebola, alho e cheiro verde. Serve para criança.',
      },
    ],
  },

  'pastel-sertanejo': {
    tituloSeo: 'Pastel de carne de sol em Natal/RN',
    descricao: 'Pastel sertanejo em Natal/RN: carne de sol desfiada com queijo coalho. O sabor mais nordestino da casa. Cento de pastel a partir de 25 unidades.',
    chamada: 'Carne de sol com queijo coalho.',
    texto: [
      'Carne de sol desfiada com queijo coalho — os dois ingredientes que definem comida daqui, dentro de um pastel. A carne é dessalgada e desfiada aqui; o coalho entra em cubos, que resistem à fritura e aparecem na mordida em vez de virar creme.',
      'É o pastel que a gente serve quando quer mostrar de onde é. Em evento com gente de fora, é o que rende conversa.',
    ],
    combina: 'Vale para casamento, evento de empresa e qualquer mesa em que a comida também é cartão de visita da cidade.',
    faq: [
      {
        pergunta: 'A carne de sol é salgada demais?',
        resposta: 'Não. Ela é dessalgada antes de ir para o recheio, e o queijo coalho equilibra o que sobra de sal.',
      },
      {
        pergunta: 'Por que o sertanejo custa mais que o de frango?',
        resposta: 'Carne de sol e queijo coalho custam mais que frango. O preço de cada cento acompanha o recheio em vez de espalhar o custo por todos os sabores.',
      },
    ],
  },

  'pastel-de-pizza': {
    tituloSeo: 'Pastel de pizza em Natal/RN',
    descricao: 'Pastel de pizza em Natal/RN: presunto, mussarela e orégano, massa fina e crocante. Cento de pastel a partir de 25 unidades.',
    chamada: 'Presunto, mussarela e orégano.',
    texto: [
      'Presunto, mussarela e orégano — a combinação de pizza dentro da massa fina do pastel. A mussarela derrete e o orégano perfuma na fritura, que é quando esse sabor se resolve.',
      'Agrada criança e adulto pelo mesmo motivo: é sabor conhecido, sem surpresa.',
    ],
    combina: 'Em festa infantil, funciona junto com o enroladinho de salsicha.',
    faq: [
      {
        pergunta: 'O pastel de pizza leva molho de tomate?',
        resposta: 'Leva o orégano e o queijo. Sem molho, para a massa não amolecer antes de chegar na sua mesa.',
      },
    ],
  },

  'pastel-de-queijo-e-presunto': {
    tituloSeo: 'Pastel de queijo e presunto em Natal/RN',
    descricao: 'Pastel de queijo e presunto em Natal/RN: o clássico, com queijo derretido de verdade. Cento de pastel a partir de 25 unidades.',
    chamada: 'O clássico que nunca sai de moda.',
    texto: [
      'Presunto e queijo derretido. É o pastel mais simples do cardápio e o mais difícil de fazer mal — desde que o queijo seja queijo de verdade e venha em quantidade, que é onde a maioria economiza.',
      'É a escolha segura de bandeja: não tem quem não coma.',
    ],
    combina: 'Bom para dividir evento com o sertanejo — um seguro, outro que apresenta a casa.',
    faq: [
      {
        pergunta: 'Dá para pedir só com queijo, sem presunto?',
        resposta: 'Dá. Escreva na observação do pedido que a gente separa.',
      },
    ],
  },
}

/** Conteudo editorial deste slug, ou null se o sabor ainda nao tem texto proprio. */
export function conteudoDoSabor(slug) {
  return CONTEUDO_SABORES[slug] ?? null
}
