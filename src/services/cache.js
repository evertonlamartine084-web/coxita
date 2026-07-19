/**
 * Cache em memoria para leituras do Supabase.
 *
 * Resolve dois problemas distintos:
 *
 * 1. Navegar entre telas refazia toda consulta do zero. Voltar para a home
 *    dentro do TTL agora nao gera nenhuma requisicao.
 * 2. Duas chamadas simultaneas para a mesma chave disparavam duas requisicoes.
 *    A segunda passa a aguardar a promessa ja em voo.
 *
 * O cache vive na memoria da aba: um F5 comeca limpo, o que e o comportamento
 * desejado para um cardapio que o dono edita pelo painel.
 */

const TTL_PADRAO = 60_000

/** chave -> { dados, gravadoEm, emVoo } */
const entradas = new Map()

function fresca(entrada, ttl) {
  return entrada?.gravadoEm !== undefined && Date.now() - entrada.gravadoEm < ttl
}

export function cached(chave, buscar, ttl = TTL_PADRAO) {
  const entrada = entradas.get(chave)

  if (fresca(entrada, ttl)) return Promise.resolve(entrada.dados)
  if (entrada?.emVoo) return entrada.emVoo

  const emVoo = buscar()
    .then(dados => {
      entradas.set(chave, { dados, gravadoEm: Date.now() })
      return dados
    })
    .catch(erro => {
      // Descarta so a promessa que falhou. Dados antigos, se existirem,
      // continuam servindo ate expirarem.
      const atual = entradas.get(chave)
      if (atual?.gravadoEm === undefined) entradas.delete(chave)
      else delete atual.emVoo
      throw erro
    })

  entradas.set(chave, { ...entrada, emVoo })
  return emVoo
}

/**
 * Le o cache de forma sincrona, sem disparar requisicao.
 * Serve para inicializar o estado de um componente e evitar o flash de
 * "Carregando..." quando os dados ja estao em maos.
 */
export function peek(chave, ttl = TTL_PADRAO) {
  const entrada = entradas.get(chave)
  return fresca(entrada, ttl) ? entrada.dados : undefined
}

/** Invalida toda chave que comeca com o prefixo. Chamar apos escrever. */
export function invalidar(prefixo) {
  for (const chave of [...entradas.keys()]) {
    if (chave.startsWith(prefixo)) entradas.delete(chave)
  }
}
