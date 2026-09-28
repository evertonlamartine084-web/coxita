/**
 * Linha Coxelli Gourmet: tarteletes e empadinhas para presente e evento.
 *
 * Fonte única da página /gourmet e do HTML pré-renderizado dela. Os nomes e as descrições
 * vêm do que aparece nas fotos enviadas pela loja (27/09/2026) e ainda passam por revisão;
 * os preços ainda não existem, por isso todo pedido sai pelo WhatsApp com a composição
 * montada. Quando houver preço, é aqui que ele entra.
 */

/** Horas mínimas entre o pedido e a retirada. Valor provisório, a confirmar com a loja. */
export const ANTECEDENCIA_HORAS = 48

const foto = (nome) => ({
  src: `/fotos/gourmet/${nome}.jpg`,
  srcPequena: `/fotos/gourmet/${nome}-800.jpg`,
})

// Recorte das flores da foto (PNG só com transparência), para elas vazarem a moldura na página
const comFlores = (f) => ({ ...f, flores: f.src.replace('.jpg', '-flores.png') })

// Camada pronta das flores (PNG colorido com transparência): a foto inteira, sem o corte do
// enquadramento, com uma folga de FOLGA_CAMADA em cima onde a flor cortada pela câmera foi completada
export const FOLGA_CAMADA = 0.04
const comCamada = (f) => ({ ...f, camada: f.src.replace('.jpg', '-flores.png') })

// Ordem da página: os cinco salgados e depois os cinco doces (uma fileira de cada no computador).
// Sabores novos de 27/09/2026: sertanejo e camarão; choux e cannoli ainda a confirmar com a loja.
export const SABORES_GOURMET = [
  {
    slug: 'caprese',
    nome: 'Caprese',
    tipo: 'salgada',
    descricao: 'Creme branco, tomate-cereja confitado e folhas de manjericão.',
    foto: foto('caprese'),
    fotoPrato: comCamada(foto('caprese-prato')),
  },
  {
    slug: 'frango',
    nome: 'Frango cremoso',
    tipo: 'salgada',
    descricao: 'Frango desfiado cremoso, fio de azeite e ervas secas.',
    foto: foto('frango'),
    fotoPrato: foto('frango-prato'),
  },
  {
    slug: 'camarao',
    nome: 'Camarão',
    tipo: 'salgada',
    descricao: 'Camarão inteiro sobre creme branco, na massa sablée.',
    foto: foto('camarao'),
    fotoPrato: foto('camarao-prato'),
  },
  {
    slug: 'sertanejo',
    nome: 'Sertanejo',
    tipo: 'salgada',
    descricao: 'Carne de sol na nata com queijo coalho, finalizada com pimenta biquinho, na massa sablée.',
    foto: foto('biquinho'),
    fotoPrato: foto('biquinho-prato'),
  },
  {
    slug: 'empadinha',
    nome: 'Empadinha',
    tipo: 'salgada',
    descricao: 'Fechada, com a massa dourada no forno e ervas por cima.',
    foto: foto('empadinha'),
    fotoPrato: foto('empadinha-prato'),
  },
  {
    slug: 'frutas',
    nome: 'Frutas frescas',
    tipo: 'doce',
    descricao: 'Morango, manga e kiwi em cubos, sob uma rosa de creme.',
    foto: foto('frutas'),
    fotoPrato: comCamada(foto('frutas-prato')),
  },
  {
    slug: 'doce-de-leite',
    nome: 'Doce de leite',
    tipo: 'doce',
    descricao: 'Doce de leite cremoso, espelhado, na massa sablée.',
    foto: foto('doce-de-leite'),
    fotoPrato: foto('doce-de-leite-prato'),
  },
  {
    slug: 'craquelin',
    nome: 'Choux craquelin',
    tipo: 'doce',
    descricao: 'Carolina de massa choux com casquinha crocante de craquelin.',
    foto: foto('craquelin'),
    fotoPrato: foto('craquelin-prato'),
  },
  {
    slug: 'choux-chocolate',
    nome: 'Choux de chocolate',
    tipo: 'doce',
    descricao: 'Carolina de massa choux com cobertura brilhante de chocolate.',
    foto: foto('choux-chocolate'),
    fotoPrato: foto('choux-chocolate-prato'),
  },
  {
    slug: 'cannoli',
    nome: 'Cannoli',
    tipo: 'doce',
    descricao: 'Casquinha crocante com açúcar de confeiteiro e creme rosado com fruta vermelha.',
    foto: foto('cannoli'),
    fotoPrato: foto('cannoli-prato'),
  },
]

export const CAIXA_DEGUSTACAO = {
  id: 'caixa',
  nome: 'Caixa Degustação',
  titulo: ['Caixa', 'degustação'],   // a segunda palavra vai em itálico
  chamada: 'A caixa pronta',
  pecas: 13,
  alt: 'Caixa Degustação vista de cima, com as tarteletes em fileiras',
  // a composição da caixa das fotos, na ordem em que as fileiras aparecem
  composicao: [
    { slug: 'caprese', quantidade: 3 },
    { slug: 'frango', quantidade: 3 },
    { slug: 'frutas', quantidade: 3 },
    { slug: 'doce-de-leite', quantidade: 2 },
    { slug: 'empadinha', quantidade: 2 },
  ],
  fotos: {
    abertura: comFlores(foto('caixa-diagonal')),
    principal: comFlores(foto('caixa-aberta')),
    presente: foto('caixa-sacola'),
    detalhe: foto('caixa-perto'),
    altDetalhe: 'Caixa Degustação vista de perto, com as fileiras de tarteletes',
    cantoDetalhe: 'superior-esquerdo',   // em cima do lírio, sem cobrir tartelete
  },
}

// Segunda caixa pronta, das fotos de 27/09/2026: os cinco sabores novos, três de cada, na
// ordem das fileiras da foto de cima. O nome é provisório, a confirmar com a loja.
export const CAIXA_COQUETEL = {
  id: 'caixa-coquetel',
  nome: 'Caixa Coquetel',
  titulo: ['Caixa', 'coquetel'],
  chamada: 'Outra caixa pronta',
  pecas: 15,
  alt: 'Caixa Coquetel vista de cima: sertanejo, camarão, choux craquelin, choux de chocolate e cannoli',
  composicao: [
    { slug: 'sertanejo', quantidade: 3 },
    { slug: 'camarao', quantidade: 3 },
    { slug: 'craquelin', quantidade: 3 },
    { slug: 'choux-chocolate', quantidade: 3 },
    { slug: 'cannoli', quantidade: 3 },
  ],
  fotos: {
    principal: comCamada(foto('caixa-coquetel')),
    // no canto da principal: a mesma caixa fechada com laço, na frente da sacola
    detalhe: foto('caixa-coquetel-sacola'),
    altDetalhe: 'Caixa Coquetel fechada com laço dourado, na frente da sacola Coxelli',
    cantoDetalhe: 'inferior-direito',    // em cima das flores, sem cobrir sabor
  },
}

export const CAIXAS_PRONTAS = [CAIXA_DEGUSTACAO, CAIXA_COQUETEL]

export const saborPorSlug = (slug) => SABORES_GOURMET.find(s => s.slug === slug)
