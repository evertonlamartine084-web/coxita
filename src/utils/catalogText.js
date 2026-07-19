const CORRECOES = [
  [/\bBaiaozinho\b/g, 'Baiãozinho'],
  [/\bbaiaozinho\b/g, 'baiãozinho'],
  [/\bCamarao\b/g, 'Camarão'],
  [/\bcamarao\b/g, 'camarão'],
  [/\bAgua\b/g, 'Água'],
  [/\bagua\b/g, 'água'],
  [/\bGuarana\b/g, 'Guaraná'],
  [/\bguarana\b/g, 'guaraná'],
  [/\bclassica\b/g, 'clássica'],
  [/\bhortela\b/g, 'hortelã'],
  [/\bmoida\b/g, 'moída'],
  [/\breunioes\b/g, 'reuniões'],
  [/\bacucar\b/g, 'açúcar'],
  [/\bdisponiveis\b/g, 'disponíveis'],
  [/\bdisponivel\b/g, 'disponível'],
  [/\bate\b/g, 'até'],
  [/\bgas\b/g, 'gás'],
]

/** Corrige a grafia do catálogo legado sem alterar identificadores ou dados. */
export function catalogText(value) {
  if (typeof value !== 'string') return value
  return CORRECOES.reduce((texto, [busca, troca]) => texto.replace(busca, troca), value)
}
