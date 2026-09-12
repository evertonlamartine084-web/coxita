/**
 * Area de entrega -- fonte unica, para tela e para Schema.org.
 *
 * A cobertura e Natal inteira, os 36 bairros. Uma versao anterior falava em
 * raio de 15 km a partir da loja; o raio saiu porque deixava Ponta Negra
 * (16,5 km) de fora no papel enquanto a entrega ia. Area declarada menor que a
 * real custa os pedidos que ela exclui.
 *
 * `CENTRO` e o centroide do bairro Pajucara (OpenStreetMap), nao a porta da
 * loja -- geocodificar o numero exato nao retornou resultado em nenhuma base.
 * Serve para o `geo` da loja situar o negocio no mapa, nao para medir entrega:
 * quem calcula isso e o checkout, com o endereco completo.
 */

export const CIDADE = 'Natal'
export const UF = 'RN'
export const BAIRRO_DA_LOJA = 'Pajuçara'

export const CENTRO = { latitude: -5.7372347, longitude: -35.2360433 }

/** Uma frase, usada no corpo das paginas. */
export const RESUMO_ENTREGA =
  `A gente entrega em toda ${CIDADE}, nos 36 bairros — a loja fica na ${BAIRRO_DA_LOJA}, na Zona Norte.`

/**
 * `areaServed` em Schema.org.
 *
 * Cidade inteira, sem GeoCircle. O circulo dizia um raio que nao era mais a
 * regra, e area errada no schema e pior que area ausente: o buscador passa a
 * excluir o negocio de buscas em bairros que ele atende.
 */
export function areaAtendida() {
  return {
    '@type': 'City',
    name: CIDADE,
    sameAs: 'https://pt.wikipedia.org/wiki/Natal_(Rio_Grande_do_Norte)',
  }
}
