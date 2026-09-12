/**
 * Os 36 bairros oficiais de Natal/RN.
 *
 * Gerado uma vez a partir da lista da Prefeitura (quatro regioes
 * administrativas) com as coordenadas do OpenStreetMap, e conferido na mao.
 * Nao se regenera no build: bairro de cidade nao muda de lugar, e uma
 * dependencia de rede no build para buscar isso seria fragilidade de graca.
 *
 * `km` e a distancia em linha reta entre o centroide do bairro e o da Pajucara,
 * onde fica a loja. E o numero que diferencia uma pagina de bairro da outra --
 * sem um dado proprio por pagina, 36 paginas com o nome trocado sao exatamente
 * o que o Google chama de doorway page e trata como manipulacao.
 *
 * Linha reta, e nao rota de moto: serve para ordenar e situar ("a 4 km da
 * cozinha"), nunca para prometer prazo. Quem calcula entrega de verdade e o
 * checkout, com o endereco completo.
 *
 * `vizinhos` sao os quatro bairros mais proximos por distancia real, nao por
 * zona administrativa. Viram os links internos do rodape de cada pagina: quem
 * caiu na pagina errada acha a certa em um clique, e a malha de links liga os
 * 36 entre si em vez de deixar cada um dependurado so no indice.
 */

export const BAIRROS = [
  {
    nome: 'Alecrim',
    slug: 'alecrim',
    zona: 'Zona Leste',
    km: 7.1,
    vizinhos: ['barro-vermelho', 'lagoa-seca', 'quintas', 'dix-sept-rosado'],
  },
  {
    nome: 'Areia Preta',
    slug: 'areia-preta',
    zona: 'Zona Leste',
    km: 7.5,
    vizinhos: ['petropolis', 'mae-luiza', 'praia-do-meio', 'rocas'],
  },
  {
    nome: 'Barro Vermelho',
    slug: 'barro-vermelho',
    zona: 'Zona Leste',
    km: 7.4,
    vizinhos: ['lagoa-seca', 'alecrim', 'tirol', 'cidade-alta'],
  },
  {
    nome: 'Cidade Alta',
    slug: 'cidade-alta',
    zona: 'Zona Leste',
    km: 6.1,
    vizinhos: ['ribeira', 'petropolis', 'barro-vermelho', 'rocas'],
  },
  {
    nome: 'Lagoa Seca',
    slug: 'lagoa-seca',
    zona: 'Zona Leste',
    km: 8.3,
    vizinhos: ['barro-vermelho', 'alecrim', 'tirol', 'lagoa-nova'],
  },
  {
    nome: 'Mãe Luiza',
    slug: 'mae-luiza',
    zona: 'Zona Leste',
    km: 8.5,
    vizinhos: ['areia-preta', 'tirol', 'petropolis', 'praia-do-meio'],
  },
  {
    nome: 'Petrópolis',
    slug: 'petropolis',
    zona: 'Zona Leste',
    km: 6.7,
    vizinhos: ['praia-do-meio', 'areia-preta', 'cidade-alta', 'rocas'],
  },
  {
    nome: 'Praia do Meio',
    slug: 'praia-do-meio',
    zona: 'Zona Leste',
    km: 6.5,
    vizinhos: ['petropolis', 'rocas', 'areia-preta', 'ribeira'],
  },
  {
    nome: 'Ribeira',
    slug: 'ribeira',
    zona: 'Zona Leste',
    km: 5.5,
    vizinhos: ['rocas', 'cidade-alta', 'petropolis', 'praia-do-meio'],
  },
  {
    nome: 'Rocas',
    slug: 'rocas',
    zona: 'Zona Leste',
    km: 5.7,
    vizinhos: ['ribeira', 'praia-do-meio', 'petropolis', 'santos-reis'],
  },
  {
    nome: 'Santos Reis',
    slug: 'santos-reis',
    zona: 'Zona Leste',
    km: 4.7,
    vizinhos: ['redinha', 'rocas', 'ribeira', 'praia-do-meio'],
  },
  {
    nome: 'Tirol',
    slug: 'tirol',
    zona: 'Zona Leste',
    km: 8.5,
    vizinhos: ['barro-vermelho', 'lagoa-seca', 'mae-luiza', 'areia-preta'],
  },
  {
    nome: 'Igapó',
    slug: 'igapo',
    zona: 'Zona Norte',
    km: 4.5,
    vizinhos: ['potengi', 'nossa-senhora-da-apresentacao', 'nordeste', 'salinas'],
  },
  {
    nome: 'Lagoa Azul',
    slug: 'lagoa-azul',
    zona: 'Zona Norte',
    km: 3.2,
    vizinhos: ['pajucara', 'nossa-senhora-da-apresentacao', 'potengi', 'igapo'],
  },
  {
    nome: 'Nossa Senhora da Apresentação',
    slug: 'nossa-senhora-da-apresentacao',
    zona: 'Zona Norte',
    km: 4.8,
    vizinhos: ['potengi', 'igapo', 'lagoa-azul', 'pajucara'],
  },
  {
    nome: 'Pajuçara',
    slug: 'pajucara',
    zona: 'Zona Norte',
    km: 0.0,
    vizinhos: ['potengi', 'lagoa-azul', 'redinha', 'salinas'],
  },
  {
    nome: 'Potengi',
    slug: 'potengi',
    zona: 'Zona Norte',
    km: 2.5,
    vizinhos: ['igapo', 'pajucara', 'nossa-senhora-da-apresentacao', 'lagoa-azul'],
  },
  {
    nome: 'Redinha',
    slug: 'redinha',
    zona: 'Zona Norte',
    km: 4.0,
    vizinhos: ['santos-reis', 'rocas', 'ribeira', 'praia-do-meio'],
  },
  {
    nome: 'Salinas',
    slug: 'salinas',
    zona: 'Zona Norte',
    km: 4.3,
    vizinhos: ['quintas', 'cidade-alta', 'nordeste', 'ribeira'],
  },
  {
    nome: 'Bom Pastor',
    slug: 'bom-pastor',
    zona: 'Zona Oeste',
    km: 8.1,
    vizinhos: ['nordeste', 'nossa-senhora-de-nazare', 'felipe-camarao', 'dix-sept-rosado'],
  },
  {
    nome: 'Cidade Nova',
    slug: 'cidade-nova',
    zona: 'Zona Oeste',
    km: 11.1,
    vizinhos: ['cidade-da-esperanca', 'felipe-camarao', 'candelaria', 'nossa-senhora-de-nazare'],
  },
  {
    nome: 'Cidade da Esperança',
    slug: 'cidade-da-esperanca',
    zona: 'Zona Oeste',
    km: 9.8,
    vizinhos: ['nossa-senhora-de-nazare', 'cidade-nova', 'dix-sept-rosado', 'candelaria'],
  },
  {
    nome: 'Dix-Sept Rosado',
    slug: 'dix-sept-rosado',
    zona: 'Zona Oeste',
    km: 8.0,
    vizinhos: ['nossa-senhora-de-nazare', 'quintas', 'alecrim', 'lagoa-seca'],
  },
  {
    nome: 'Felipe Camarão',
    slug: 'felipe-camarao',
    zona: 'Zona Oeste',
    km: 10.1,
    vizinhos: ['bom-pastor', 'cidade-nova', 'cidade-da-esperanca', 'guarapes'],
  },
  {
    nome: 'Guarapes',
    slug: 'guarapes',
    zona: 'Zona Oeste',
    km: 11.7,
    vizinhos: ['felipe-camarao', 'planalto', 'cidade-nova', 'bom-pastor'],
  },
  {
    nome: 'Nordeste',
    slug: 'nordeste',
    zona: 'Zona Oeste',
    km: 6.3,
    vizinhos: ['quintas', 'bom-pastor', 'salinas', 'dix-sept-rosado'],
  },
  {
    nome: 'Nossa Senhora de Nazaré',
    slug: 'nossa-senhora-de-nazare',
    zona: 'Zona Oeste',
    km: 8.9,
    vizinhos: ['cidade-da-esperanca', 'dix-sept-rosado', 'bom-pastor', 'lagoa-nova'],
  },
  {
    nome: 'Planalto',
    slug: 'planalto',
    zona: 'Zona Oeste',
    km: 13.0,
    vizinhos: ['guarapes', 'cidade-nova', 'felipe-camarao', 'pitimbu'],
  },
  {
    nome: 'Quintas',
    slug: 'quintas',
    zona: 'Zona Oeste',
    km: 6.7,
    vizinhos: ['dix-sept-rosado', 'alecrim', 'nordeste', 'bom-pastor'],
  },
  {
    nome: 'Candelária',
    slug: 'candelaria',
    zona: 'Zona Sul',
    km: 11.1,
    vizinhos: ['lagoa-nova', 'cidade-da-esperanca', 'cidade-nova', 'nossa-senhora-de-nazare'],
  },
  {
    nome: 'Capim Macio',
    slug: 'capim-macio',
    zona: 'Zona Sul',
    km: 13.9,
    vizinhos: ['neopolis', 'candelaria', 'ponta-negra', 'nova-descoberta'],
  },
  {
    nome: 'Lagoa Nova',
    slug: 'lagoa-nova',
    zona: 'Zona Sul',
    km: 9.8,
    vizinhos: ['candelaria', 'nova-descoberta', 'lagoa-seca', 'nossa-senhora-de-nazare'],
  },
  {
    nome: 'Neópolis',
    slug: 'neopolis',
    zona: 'Zona Sul',
    km: 14.7,
    vizinhos: ['capim-macio', 'pitimbu', 'candelaria', 'ponta-negra'],
  },
  {
    nome: 'Nova Descoberta',
    slug: 'nova-descoberta',
    zona: 'Zona Sul',
    km: 10.8,
    vizinhos: ['lagoa-nova', 'candelaria', 'lagoa-seca', 'tirol'],
  },
  {
    nome: 'Pitimbu',
    slug: 'pitimbu',
    zona: 'Zona Sul',
    km: 14.0,
    vizinhos: ['neopolis', 'planalto', 'cidade-nova', 'candelaria'],
  },
  {
    nome: 'Ponta Negra',
    slug: 'ponta-negra',
    zona: 'Zona Sul',
    km: 16.5,
    vizinhos: ['capim-macio', 'neopolis', 'nova-descoberta', 'pitimbu'],
  },
]

/** O bairro deste slug, ou null. */
export function bairroPorSlug(slug) {
  return BAIRROS.find(b => b.slug === slug) ?? null
}

/** Bairros agrupados na ordem das quatro regioes administrativas. */
export const ZONAS = ['Zona Norte', 'Zona Sul', 'Zona Leste', 'Zona Oeste']

export function bairrosDaZona(zona) {
  return BAIRROS.filter(b => b.zona === zona)
}
