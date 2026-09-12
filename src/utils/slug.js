/**
 * Slug de URL a partir do nome do sabor.
 *
 * O banco nao guarda slug: guarda `name`. Derivar aqui, em vez de criar coluna,
 * mantem uma fonte de verdade so -- cadastrar um sabor no admin ja publica a
 * pagina dele, sem segundo campo para preencher (e para esquecer).
 *
 * A normalizacao remove acento antes de montar o slug, entao "Baiaozinho de
 * camarao" e "Baiãozinho de camarão" caem na mesma URL. Isso importa porque o
 * catalogo legado tem as duas grafias: o banco escreve sem acento e o
 * `catalogText` corrige na tela. Se o slug dependesse da grafia, arrumar um
 * acento no cadastro quebraria uma URL ja indexada.
 */
export function slugify(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** O sabor cujo nome gera este slug, ou undefined. */
export function saborPorSlug(sabores, slug) {
  return (sabores ?? []).find(s => slugify(s.name) === slug)
}

/** Caminho publico da pagina de um sabor. */
export function caminhoDoSabor(sabor) {
  return `/salgados/${slugify(sabor?.name)}`
}
