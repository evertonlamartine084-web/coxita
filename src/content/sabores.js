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
    combina: 'Num cento misto, ela costuma dividir espaço com risole de carne e bolinha de queijo — três texturas diferentes na mesma bandeja.',
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

  'coxinha-de-frango-com-catupiry': {
    tituloSeo: 'Coxinha com catupiry em Natal/RN',
    descricao: 'Coxinha de frango com catupiry em Natal/RN. Frango desfiado no dia e catupiry cremoso de verdade. Cento, meio cento ou 25 unidades.',
    chamada: 'A clássica, com o recheio que derrete.',
    texto: [
      'Mesmo frango da tradicional, desfiado e temperado no dia, com uma camada de catupiry que derrete no calor da fritura. O queijo entra em quantidade que aparece — não é um fio no meio da massa para poder escrever "com catupiry" no cardápio.',
      'É o sabor que some primeiro da bandeja em festa de criança, e o mais pedido quando o cliente está escolhendo dois sabores em vez de quatro.',
    ],
    combina: 'Vai bem ao lado de sabores mais secos, como kibe e enroladinho de salsicha, que equilibram o cremoso.',
    faq: [
      {
        pergunta: 'Qual a diferença para a coxinha de frango tradicional?',
        resposta: 'O recheio de frango é o mesmo. A do catupiry leva uma camada de queijo cremoso junto, o que deixa o salgado mais úmido por dentro.',
      },
    ],
  },

  'baiaozinho-de-camarao': {
    tituloSeo: 'Baiãozinho de camarão em Natal/RN',
    descricao: 'Baiãozinho de camarão em Natal/RN: baião de dois com camarão dentro do salgado. Receita da casa, camarão selecionado. Peça o seu cento.',
    chamada: 'Baião de dois que virou salgado.',
    texto: [
      'Esse é da casa. Baião de dois — feijão verde, arroz, queijo coalho — com camarão selecionado, tudo dentro de um salgado. Não é receita de catálogo de fornecedor; foi ajustada aqui até o ponto em que o camarão aparece sem o feijão desmanchar.',
      'É o sabor que surpreende quem não é de Natal, e o que os daqui pedem justamente por reconhecer. Em cento misto para visita de fora, costuma ser o primeiro a acabar.',
    ],
    combina: 'Num cento para receber gente de fora, vale montar com coxinha de frango e pastel sertanejo — o trio que mais conta de onde a gente é.',
    faq: [
      {
        pergunta: 'O baiãozinho leva camarão inteiro?',
        resposta: 'Leva camarão em pedaços, misturado ao baião de dois. É o formato que distribui o camarão por todas as unidades em vez de concentrar em algumas.',
      },
      {
        pergunta: 'Serve para quem tem alergia a frutos do mar?',
        resposta: 'Não. Esse leva camarão. Se alguém da festa tem alergia, avise no pedido que a gente separa as bandejas.',
      },
    ],
  },

  kibe: {
    tituloSeo: 'Kibe frito em Natal/RN',
    descricao: 'Kibe frito em Natal/RN: carne moída, trigo para quibe e hortelã na medida. Feito na hora, no cento, meio cento ou 25 unidades.',
    chamada: 'Carne, trigo e hortelã na medida.',
    texto: [
      'Carne moída com trigo para quibe, cebola e hortelã. A hortelã entra na quantidade que perfuma sem dominar — kibe com hortelã demais vira chá, e é um erro comum em salgado feito em escala.',
      'Frito até a casca ficar escura e firme. É o salgado mais seco da bandeja, o que faz dele o par natural dos recheios cremosos.',
    ],
    combina: 'Equilibra bem com coxinha de catupiry e bolinha de queijo no mesmo cento.',
    faq: [
      {
        pergunta: 'O kibe é frito ou assado?',
        resposta: 'Frito. É o formato que mantém a casca firme até a hora de servir.',
      },
    ],
  },

  'risole-de-carne': {
    tituloSeo: 'Risole de carne em Natal/RN',
    descricao: 'Risole de carne em Natal/RN: carne moída temperada, massa empanada e crocante. Monte seu cento a partir de 25 unidades.',
    chamada: 'Empanado, crocante, recheio que não some.',
    texto: [
      'Carne moída refogada com tomate, cebola e temperos, dentro de uma massa empanada que dá o crocante característico do risole. A carne é temperada na panela, não no recheio pronto — molho de carne bem feito é o que separa risole de salgado de padaria.',
      'É o formato que aguenta melhor a mesa: continua bom mesmo depois de meia hora servido, coisa que nem todo salgado faz.',
    ],
    combina: 'Divide bem o cento com coxinha de frango e croquete de carne, para quem prefere bandeja sem sabor de queijo.',
    faq: [
      {
        pergunta: 'Qual a diferença entre risole e pastel?',
        resposta: 'O risole é empanado e frito, com massa mais macia por dentro. O pastel tem massa fina e sequinha, que estala. São texturas diferentes.',
      },
    ],
  },

  'risole-de-frango': {
    tituloSeo: 'Risole de frango em Natal/RN',
    descricao: 'Risole de frango cremoso em Natal/RN. Frango desfiado em molho branco, massa empanada e crocante. Cento, meio cento ou 25 unidades.',
    chamada: 'Frango cremoso dentro do empanado.',
    texto: [
      'Frango desfiado em molho branco, o que dá o cremoso sem precisar de queijo. Dentro da massa empanada, o contraste funciona: casca crocante, recheio macio.',
      'É a escolha de quem quer algo cremoso mas não come catupiry, e a opção mais segura em festa com criança pequena — sem pimenta, sem tempero forte.',
    ],
    combina: 'Bom par para kibe e enroladinho de salsicha, que são os secos da bandeja.',
    faq: [
      {
        pergunta: 'O risole de frango leva queijo?',
        resposta: 'Não. O cremoso vem do molho branco, não de queijo. Serve para quem evita catupiry.',
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

  'croquete-de-carne': {
    tituloSeo: 'Croquete de carne em Natal/RN',
    descricao: 'Croquete de carne em Natal/RN: carne desfiada e empanada, casca firme. Feito na hora, a partir de 25 unidades.',
    chamada: 'Carne desfiada, casca firme.',
    texto: [
      'Carne desfiada e temperada, moldada e empanada. Diferente do risole, aqui a carne é desfiada em vez de moída — a textura é mais encorpada, e o salgado sustenta melhor.',
      'É o mais "de comer" da bandeja: em reunião longa ou evento que atravessa o horário do almoço, é o que segura melhor.',
    ],
    combina: 'Bom para bandeja de evento adulto, junto com kibe e risole de carne.',
    faq: [
      {
        pergunta: 'Qual a diferença entre croquete e risole de carne?',
        resposta: 'A carne. No croquete ela é desfiada e mais encorpada; no risole é moída, em molho. A massa do risole também é mais macia.',
      },
    ],
  },

  'empada-de-frango': {
    tituloSeo: 'Empada de frango em Natal/RN',
    descricao: 'Empada de frango em Natal/RN: massa amanteigada que desmancha, recheio de frango cremoso. Assada, não frita. A partir de 25 unidades.',
    chamada: 'Massa amanteigada, assada e não frita.',
    texto: [
      'Massa amanteigada que desmancha na boca, com frango cremoso dentro. É o único assado da lista — o que faz dela a alternativa para quem quer algo mais leve na bandeja, ou para quem não come frito.',
      'Por ser assada, aguenta bem a mesa e não perde textura como os fritos perdem.',
    ],
    combina: 'Entra bem em bandeja de reunião de trabalho e café da tarde, onde nem todo mundo quer frito.',
    faq: [
      {
        pergunta: 'A empada é assada mesmo?',
        resposta: 'É. Vai ao forno, não à fritura. É a opção da bandeja para quem está evitando frito.',
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
