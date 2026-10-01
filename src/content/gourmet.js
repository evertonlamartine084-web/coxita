/**
 * Linha Coxelli Gourmet: salgados e doces finos para presente e evento.
 *
 * Fonte única da página /gourmet e do HTML pré-renderizado dela. Nomes, descrições, preços e
 * pedido mínimo vêm dos cardápios em PDF da loja ("Salgados e Doces Finos" e "Box
 * personalizada", 01/10/2026). O pedido continua saindo pelo WhatsApp, agora com o total.
 *
 * Preço por unidade: `cartao` é crédito ou débito; `avista` é Pix ou dinheiro.
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
// `minimo`: pedido mínimo de unidades daquele sabor fora das boxes.
export const SABORES_GOURMET = [
  {
    slug: 'caprese',
    nome: 'Quiche de tomate confit',
    tipo: 'salgada',
    descricao: 'Massa sablée com creme de mussarela de búfala, tomate confit e manjericão fresco.',
    preco: { cartao: 1.78, avista: 1.54 },
    foto: foto('caprese'),
    fotoPrato: comCamada(foto('caprese-prato')),
  },
  {
    slug: 'frango',
    nome: 'Quiche de frango cremoso',
    tipo: 'salgada',
    descricao: 'Massa sablée com recheio de frango cremoso, coberto por ervas frescas e azeite.',
    preco: { cartao: 0.50, avista: 0.43 },
    foto: foto('frango'),
    fotoPrato: foto('frango-prato'),
  },
  {
    slug: 'camarao',
    nome: 'Quiche de camarão',
    tipo: 'salgada',
    descricao: 'Massa sablée com creme de mussarela de búfala e camarão alho e óleo.',
    preco: { cartao: 1.88, avista: 1.63 },
    foto: foto('camarao'),
    fotoPrato: foto('camarao-prato'),
  },
  {
    slug: 'sertanejo',
    nome: 'Quiche sertanejo',
    tipo: 'salgada',
    descricao: 'Massa sablée com carne de sol, queijo coalho, requeijão, nata, coentro e pimenta biquinho.',
    preco: { cartao: 1.13, avista: 0.98 },
    foto: foto('biquinho'),
    fotoPrato: foto('biquinho-prato'),
  },
  {
    slug: 'empadinha',
    nome: 'Empada de frango clássica',
    tipo: 'salgada',
    descricao: 'Massa sablée com recheio de frango cremoso, coberta por ervas frescas.',
    preco: { cartao: 0.43, avista: 0.37 },
    foto: foto('empadinha'),
    fotoPrato: foto('empadinha-prato'),
  },
  {
    slug: 'frutas',
    nome: 'Tartelete de frutas frescas',
    tipo: 'doce',
    descricao: 'Massa sablée com creme pâtissière, kiwi, morango e manga picados.',
    preco: { cartao: 0.85, avista: 0.74 },
    foto: foto('frutas'),
    fotoPrato: comCamada(foto('frutas-prato')),
  },
  {
    slug: 'doce-de-leite',
    nome: 'Empada de doce de leite',
    tipo: 'doce',
    descricao: 'Empada de massa sablée com doce de leite.',
    preco: { cartao: 0.70, avista: 0.61 },
    foto: foto('doce-de-leite'),
    fotoPrato: foto('doce-de-leite-prato'),
  },
  {
    slug: 'craquelin',
    nome: 'Choux au craquelin',
    tipo: 'doce',
    descricao: 'Massa choux com casquinha de craquelin, recheada com creme pâtissière.',
    preco: { cartao: 0.30, avista: 0.26 },
    minimo: 25,
    foto: foto('craquelin'),
    fotoPrato: foto('craquelin-prato'),
  },
  {
    slug: 'choux-chocolate',
    nome: 'Carolina',
    tipo: 'doce',
    descricao: 'Massa choux recheada com doce de leite e coberta com chocolate meio amargo.',
    preco: { cartao: 1.28, avista: 1.11 },
    minimo: 25,
    foto: foto('choux-chocolate'),
    fotoPrato: foto('choux-chocolate-prato'),
  },
  {
    slug: 'cannoli',
    nome: 'Cannoli tradicional',
    tipo: 'doce',
    descricao: 'Recheado com creme de ricota, cream cheese e cerejas.',
    preco: { cartao: 2.58, avista: 2.24 },
    minimo: 25,
    foto: foto('cannoli'),
    fotoPrato: foto('cannoli-prato'),
  },
]

export const CAIXA_DEGUSTACAO = {
  id: 'caixa',
  nome: 'Box personalizada 1',
  titulo: ['Box', 'personalizada'],   // a segunda palavra vai em itálico
  chamada: 'Box 1',
  pecas: 13,
  preco: { cartao: 24, avista: 22.5 },
  alt: 'Box personalizada 1 vista de cima, com as peças em fileiras',
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
    // a caixa e as flores já recortadas (fundo transparente, 29/09/2026): aparece solta sobre o
    // preto, sem moldura, no lugar da `principal`
    recorte: {
      src: '/fotos/gourmet/caixa-degustacao-recorte.webp',
      srcPequena: '/fotos/gourmet/caixa-degustacao-recorte-800.webp',
    },
  },
}

// Segunda box, das fotos de 27/09/2026: os outros cinco sabores, três de cada, na ordem das
// fileiras da foto de cima.
export const CAIXA_COQUETEL = {
  id: 'caixa-coquetel',
  nome: 'Box personalizada 2',
  titulo: ['Box', 'personalizada'],
  chamada: 'Box 2',
  pecas: 15,
  preco: { cartao: 34, avista: 32.5 },
  alt: 'Box personalizada 2 vista de cima: quiche sertanejo, quiche de camarão, choux au craquelin, carolinas e cannoli',
  composicao: [
    { slug: 'sertanejo', quantidade: 3 },
    { slug: 'camarao', quantidade: 3 },
    { slug: 'craquelin', quantidade: 3 },
    { slug: 'choux-chocolate', quantidade: 3 },
    { slug: 'cannoli', quantidade: 3 },
  ],
  fotos: {
    principal: comCamada(foto('caixa-coquetel')),
    // caixa e flores já recortadas (fundo transparente, 29/09/2026), soltas sobre o preto
    recorte: {
      src: '/fotos/gourmet/caixa-coquetel-recorte.webp',
      srcPequena: '/fotos/gourmet/caixa-coquetel-recorte-800.webp',
      largura: 1086,
      altura: 1402,
    },
  },
}

export const CAIXAS_PRONTAS = [CAIXA_DEGUSTACAO, CAIXA_COQUETEL]

export const saborPorSlug = (slug) => SABORES_GOURMET.find(s => s.slug === slug)
