/**
 * Paginas de ocasiao.
 *
 * Quem busca "salgado para aniversario" ainda nao decidiu onde comprar: esta
 * planejando. O cardapio nao responde a essa pessoa -- ele lista pacotes e
 * precos para quem ja decidiu. Estas paginas respondem a duvida que trava o
 * pedido (quantos salgados? quais sabores? com quanto tempo encomendo?) e so
 * depois levam ao pacote.
 *
 * `porPessoa` alimenta a calculadora de cada pagina. Os numeros nao sao chute:
 * saem do que a cozinha ja viu repetir. Festa infantil come menos por pessoa
 * do que evento adulto sem jantar, e evento com jantar depois come bem menos
 * -- errar isso para cima e o cliente jogar salgado fora, e para baixo e ele
 * passar vergonha. As duas coisas voltam como reclamacao.
 *
 * `sabores` sao slugs de `src/content/sabores.js`. Viram link interno: e o que
 * distribui autoridade da pagina de ocasiao para as de sabor, e o que mantem
 * as paginas de sabor fora da orfandade.
 */

export const OCASIOES = {
  festa: {
    slug: 'salgados-para-festa',
    tituloSeo: 'Salgados para festa em Natal/RN',
    descricao: 'Quantos salgados por pessoa, quais sabores escolher e com quanto tempo encomendar. Cento de salgados feito na hora em Natal/RN.',
    h1: 'Salgados para festa',
    chamada: 'Quanto pedir, o que escolher e quando encomendar.',
    porPessoa: 8,
    faixa: [6, 10],
    texto: [
      'A conta que mais dá errado em festa é a dos salgados. Pede-se de menos com medo de sobrar, e a bandeja esvazia na primeira hora — ou pede-se de mais e metade vai para a geladeira.',
      'A média que a gente vê se repetir é de 8 salgados por pessoa numa festa de algumas horas, sem refeição servida depois. Se a festa for curta ou tiver bolo e doces em quantidade, 6 resolve. Se for longa, começar cedo e não ter jantar, conte 10.',
    ],
    dicas: [
      ['Monte com 3 ou 4 sabores', 'Bandeja de um sabor só cansa. Com três, cada convidado acha o dele — e sobra menos, porque ninguém come dez unidades do mesmo recheio.'],
      ['Misture seco e cremoso', 'Kibe e enroladinho ao lado de coxinha com catupiry e bolinha de queijo. A variação de textura é o que faz a pessoa pegar o segundo.'],
      ['Encomende com 2 dias', 'Dá para fazer em cima da hora, mas com dois dias de antecedência a gente garante o sabor que você quer na quantidade que você quer.'],
    ],
    sabores: ['coxinha-de-frango', 'coxinha-de-frango-com-catupiry', 'risole-de-carne', 'bolinha-de-queijo'],
    faq: [
      {
        pergunta: 'Quantos salgados por pessoa em uma festa?',
        resposta: 'Conte 8 salgados por pessoa para uma festa de algumas horas sem refeição servida. Se houver jantar depois, 5 ou 6 bastam. Se a festa for longa e sem outra comida, suba para 10.',
      },
      {
        pergunta: 'Com quanto tempo preciso encomendar?',
        resposta: 'Dois dias de antecedência garantem qualquer combinação de sabores. Pedidos para o mesmo dia dependem do que já está programado na cozinha — chame no WhatsApp que a gente confirma na hora.',
      },
      {
        pergunta: 'Os salgados chegam quentes?',
        resposta: 'Chegam. A gente frita perto do horário combinado da entrega, não de manhã para entregar à tarde.',
      },
      {
        pergunta: 'Dá para misturar sabores no mesmo cento?',
        resposta: 'Dá. O cento aceita até 4 sabores, escolhidos de 25 em 25 unidades. O meio cento aceita 2 e o de 75 aceita 3.',
      },
    ],
  },

  aniversario: {
    slug: 'salgados-para-aniversario',
    tituloSeo: 'Salgados para aniversário em Natal/RN',
    descricao: 'Cento de salgados para aniversário em Natal/RN. Quantos pedir por convidado, quais sabores agradam criança e o que encomendar com antecedência.',
    h1: 'Salgados para aniversário',
    chamada: 'A bandeja que some primeiro, e como calcular a sua.',
    porPessoa: 8,
    faixa: [6, 10],
    texto: [
      'Aniversário tem bolo, doce e refrigerante disputando espaço com o salgado — mas é o salgado que some primeiro, principalmente na primeira hora, quando todo mundo chega junto.',
      'Para festa de criança, a conta muda: criança come menos por unidade, mas repete mais, e escolhe sempre os mesmos dois ou três sabores. Vale concentrar em enroladinho, coxinha de frango e bolinha de queijo em vez de espalhar em quatro sabores que metade não vai encostar.',
    ],
    dicas: [
      ['Festa infantil: menos sabores, mais do mesmo', 'Criança não experimenta. Enroladinho de salsicha, coxinha de frango e bolinha de queijo cobrem quase toda a mesa.'],
      ['Adulto na mesma festa? Separe um sabor', 'Um quarto do cento em risole de carne ou kibe resolve os pais, que não vão disputar enroladinho com as crianças.'],
      ['Conte a primeira hora', 'Metade do que você pedir sai na primeira hora. Se a festa for de quatro horas, esse é o pico a cobrir.'],
    ],
    sabores: ['enroladinho-de-salsicha', 'coxinha-de-frango', 'bolinha-de-queijo', 'pastel-de-pizza'],
    faq: [
      {
        pergunta: 'Quantos salgados para uma festa de aniversário de 30 pessoas?',
        resposta: 'Dois centos e meio, aproximadamente — cerca de 8 por pessoa. Se houver bolo, doces e refrigerante em quantidade, dois centos costumam bastar.',
      },
      {
        pergunta: 'Quais sabores as crianças mais comem?',
        resposta: 'Enroladinho de salsicha em primeiro lugar, seguido de coxinha de frango e bolinha de queijo. Sabores com tempero mais forte quase não saem em festa infantil.',
      },
      {
        pergunta: 'Vocês entregam no dia da festa, no horário?',
        resposta: 'Entregamos. Combine o horário no pedido que a gente programa a fritura para o salgado chegar quente.',
      },
    ],
  },

  casamento: {
    slug: 'salgados-para-casamento',
    tituloSeo: 'Salgados para casamento em Natal/RN',
    descricao: 'Salgados para casamento e noivado em Natal/RN. Quantidade por convidado, sabores que funcionam em recepção e prazo de encomenda.',
    h1: 'Salgados para casamento',
    chamada: 'Recepção que começa antes do jantar.',
    porPessoa: 6,
    faixa: [4, 8],
    texto: [
      'Em casamento, o salgado quase nunca é a comida principal — ele cobre a recepção, aquele intervalo entre a chegada dos convidados e o jantar. Por isso a conta é mais baixa: de 4 a 6 por pessoa dá conta, contra os 8 de uma festa comum.',
      'O que muda é a escolha dos sabores. Recepção pede salgado que continue apresentável depois de meia hora em bandeja, e que não suje a mão de quem está de roupa boa. Os empanados e assados se comportam melhor nisso que os muito cremosos.',
    ],
    dicas: [
      ['Conte só a recepção', 'Se tem jantar servido, 4 a 6 por pessoa bastam. Sem jantar, suba para 8 e trate como festa.'],
      ['Prefira os que aguentam mesa', 'Risole, croquete, kibe e empada continuam bons depois de meia hora. Bolinha de queijo quer ser servida quente.'],
      ['Um sabor que fale daqui', 'Em casamento com convidado de fora, o pastel sertanejo e o baiãozinho de camarão viram assunto. Comida também apresenta a cidade.'],
    ],
    sabores: ['risole-de-frango', 'croquete-de-carne', 'empada-de-frango', 'pastel-sertanejo'],
    faq: [
      {
        pergunta: 'Quantos salgados por pessoa em casamento?',
        resposta: 'De 4 a 6 por pessoa quando há jantar servido depois. Sem jantar, conte 8, como em qualquer festa.',
      },
      {
        pergunta: 'Vocês atendem eventos grandes, de 200 convidados ou mais?',
        resposta: 'Atendemos, com antecedência combinada. Chame no WhatsApp com a data e o número de convidados que a gente fecha a programação da cozinha.',
      },
      {
        pergunta: 'Quais salgados aguentam melhor a bandeja?',
        resposta: 'Os empanados — risole e croquete — e a empada, que é assada. Eles mantêm textura por mais tempo que os de queijo derretido.',
      },
    ],
  },

  empresa: {
    slug: 'salgados-para-empresa',
    tituloSeo: 'Salgados para evento de empresa em Natal/RN',
    descricao: 'Salgados para reunião, treinamento e confraternização de empresa em Natal/RN. Emitimos nota fiscal. Quantidade por participante e prazo.',
    h1: 'Salgados para empresa',
    chamada: 'Reunião, treinamento e confraternização.',
    porPessoa: 5,
    faixa: [4, 8],
    texto: [
      'Coffee break de reunião e treinamento come menos que festa: de 4 a 5 por pessoa, porque a pessoa come em pé, entre uma coisa e outra, e volta para a sala. Confraternização de fim de ano é outra conta — aí vale tratar como festa, com 8.',
      'O que o evento corporativo pede e a festa não pede é previsibilidade: hora certa de entrega, nota fiscal e um sabor que não obrigue ninguém a escolher entre comer e continuar apresentável na reunião seguinte.',
    ],
    dicas: [
      ['Coffee break: 4 a 5 por pessoa', 'Confraternização com bebida e sem jantar: 8, como festa.'],
      ['Inclua a empada', 'É assada, não é frita e não suja a mão. Em reunião, é o que mais sai.'],
      ['Nota fiscal e horário fechado', 'Emitimos nota. Combine o horário da entrega no pedido e a fritura é programada para ele.'],
    ],
    sabores: ['empada-de-frango', 'risole-de-frango', 'kibe', 'croquete-de-carne'],
    faq: [
      {
        pergunta: 'Vocês emitem nota fiscal para empresa?',
        resposta: 'Emitimos. Informe os dados da empresa no pedido, ou mande pelo WhatsApp que a gente cuida da emissão.',
      },
      {
        pergunta: 'Quantos salgados por pessoa em coffee break?',
        resposta: 'De 4 a 5 por participante em reunião ou treinamento. Confraternização com bebida e sem jantar pede 8, como festa.',
      },
      {
        pergunta: 'Dá para entregar em horário fixo?',
        resposta: 'Dá. Combine o horário no pedido — a fritura é programada para o salgado chegar quente naquele horário.',
      },
    ],
  },
}

export const LISTA_OCASIOES = Object.values(OCASIOES)

/** A ocasiao servida neste caminho (`salgados-para-festa`), ou null. */
export function ocasiaoPorSlug(slug) {
  return LISTA_OCASIOES.find(o => o.slug === slug) ?? null
}
