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
    descricao: 'Doce de leite cremoso, espelhado, na massa amanteigada.',
    foto: foto('doce-de-leite'),
    fotoPrato: foto('doce-de-leite-prato'),
  },
  {
    slug: 'chocolate',
    nome: 'Chocolate',
    tipo: 'doce',
    descricao: 'Recheio escuro e brilhante de chocolate.',
    foto: foto('chocolate'),
    fotoPrato: foto('chocolate-prato'),
  },
]

export const CAIXA_DEGUSTACAO = {
  nome: 'Caixa Degustação',
  pecas: 13,
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
  },
}

export const saborPorSlug = (slug) => SABORES_GOURMET.find(s => s.slug === slug)
