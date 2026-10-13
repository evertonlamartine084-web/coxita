import { FOTOS_PEQUENAS } from '../content/fotosPequenas'

/**
 * srcset de uma foto de /fotos/ que tem versoes de 400 e 600 px (scripts/fotos-pequenas.py).
 * O card do celular mostra a foto com uns 200 px: sem isto o navegador baixava os 900 px da
 * original. Foto fora da lista (nova, de outro lugar) devolve undefined e segue com o src.
 */
export function srcSetDaFoto(url) {
  const m = String(url ?? '').match(/^(?:https:\/\/coxelli\.com\.br)?\/fotos\/([^/]+)\.webp$/)
  if (!m || !FOTOS_PEQUENAS.has(m[1])) return undefined
  return `/fotos/${m[1]}-400.webp 400w, /fotos/${m[1]}-600.webp 600w, /fotos/${m[1]}.webp 900w`
}

/** Largura da foto nos cards do cardapio: 2 colunas no celular, 3 a partir de 1024 px. */
export const TAMANHO_NO_CARD = '(min-width: 1024px) 340px, 48vw'
