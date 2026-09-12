/**
 * Area de entrega -- fonte unica, para tela e para Schema.org.
 *
 * A regra real do negocio e um raio de 15 km a partir da loja, na Pajucara.
 * Por isso o texto nunca lista bairros: bairro citado vira promessa, e prometer
 * entrega onde a moto nao vai da em pedido cancelado no checkout. O raio e
 * honesto e cobre o caso todo.
 *
 * `CENTRO` e o centroide do bairro Pajucara (OpenStreetMap), nao a porta da
 * loja -- geocodificar o numero exato nao retornou resultado. Dentro de um raio
 * de 15 km, a diferenca de alguns quarteiroes e ruido; o valor serve para o
 * `GeoCircle` do schema dizer ao buscador *onde* o servico acontece, nao para
 * calcular frete. Quem cobra frete e o checkout, com o endereco de verdade.
 */

export const RAIO_KM = 15

/** Metros -- a unidade que o Schema.org espera em `geoRadius`. */
export const RAIO_METROS = RAIO_KM * 1000

export const CENTRO = { latitude: -5.7372347, longitude: -35.2360433 }

export const CIDADE = 'Natal'
export const BAIRRO = 'Pajuçara'

/** Uma frase, usada no corpo das paginas. */
export const RESUMO_ENTREGA =
  `A gente entrega num raio de ${RAIO_KM} km da loja, na ${BAIRRO}, em ${CIDADE}/RN.`

/**
 * `areaServed` em Schema.org.
 *
 * GeoCircle diz a area exata; a City junto mantem o sinal legivel para quem le
 * so o nome da cidade. Os dois no mesmo array nao se contradizem -- um e a
 * forma, outro e o rotulo.
 */
export function areaAtendida() {
  return [
    {
      '@type': 'GeoCircle',
      geoMidpoint: { '@type': 'GeoCoordinates', ...CENTRO },
      geoRadius: String(RAIO_METROS),
      description: `${RAIO_KM} km a partir da loja, na ${BAIRRO}`,
    },
    {
      '@type': 'City',
      name: CIDADE,
      sameAs: 'https://pt.wikipedia.org/wiki/Natal_(Rio_Grande_do_Norte)',
    },
  ]
}
