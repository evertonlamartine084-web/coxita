import { SUGESTOES_LEVA_JUNTO, MAXIMO_LEVA_JUNTO } from '../content/levaJunto'

const ehBebida = (p) => p?.categories?.slug === 'bebidas'

/** Uma sugestão por família (um refri, um churros), e nenhuma da família que já está no carrinho. */
const familia = (p) => (ehBebida(p) ? 'bebida' : /churros/i.test(p.name) ? 'churros' : String(p.id))

/**
 * O que oferecer, na ordem da lista: some o que já está no carrinho, o sabor que a pessoa já
 * levou e as famílias que já estão lá: quem tem churros ou refri não recebe outro.
 */
export function escolherSugestoes(produtos, itens) {
  const noCarrinho = new Set(itens.map(i => String(i.id)))
  const saboresNoCarrinho = new Set(itens.map(i => i.fixed_flavor_id).filter(Boolean))
  const porNome = new Map(produtos.map(p => [p.name, p]))
  const familias = new Set(itens.filter(i => ehBebida(i) || /churros/i.test(i.name ?? '')).map(familia))
  const escolhidos = []
  for (const nome of SUGESTOES_LEVA_JUNTO) {
    const p = porNome.get(nome)
    if (!p || noCarrinho.has(String(p.id))) continue
    if (p.fixed_flavor_id && saboresNoCarrinho.has(p.fixed_flavor_id)) continue
    if (familias.has(familia(p))) continue
    familias.add(familia(p))
    escolhidos.push(p)
    if (escolhidos.length === MAXIMO_LEVA_JUNTO) break
  }
  return escolhidos
}
