import { formatCurrency } from './format'

/**
 * Resumo da manhã para o grupo da loja (supabase/sql/resumo-da-manha.sql): pedidos do dia, o que
 * falta receber, estoque baixo, o que saiu ontem e as ofertas do Onde comprar. Sem gasto de anúncio.
 */

export const HORA_DO_RESUMO = 7

const real = (v) => formatCurrency(Number(v) || 0)
const FORMA = { pix: 'Pix', dinheiro: 'dinheiro', credito: 'crédito', debito: 'débito', cartao: 'cartão', pix_online: 'Pix pelo site' }

function pagamento(p) {
  if (p.pago) return '✅ pago'
  const sinal = Number(p.sinal) || 0
  const forma = FORMA[p.forma] ? ` (${FORMA[p.forma]})` : ''
  return sinal > 0 ? `sinal ${real(sinal)} pago, falta ${real(Number(p.total) - sinal)}${forma}` : `falta pagar${forma}`
}

export function textoDoResumo(r) {
  const dia = new Date(`${r.dia}T12:00:00`)
  const semana = dia.toLocaleDateString('pt-BR', { weekday: 'long' })
  const linhas = [`☀️ *Bom dia! Resumo de ${semana}, ${dia.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}*`]

  linhas.push('', `📦 *Pedidos de hoje (${r.pedidos.length})*`)
  if (!r.pedidos.length) linhas.push('Nenhum pedido para hoje até agora.')
  for (const p of r.pedidos) {
    const onde = p.entrega ? `🛵 ${p.bairro || 'entrega'}` : '🏠 retirada'
    linhas.push(`• ${p.hora || 'sem horário'} · #${p.numero} ${p.nome} · ${onde} · ${real(p.total)} · ${pagamento(p)}`)
    if (p.itens) linhas.push(`   ${p.itens}`)
  }

  if (r.a_receber.length) {
    linhas.push('', '💰 *A receber (hoje e próximos 7 dias)*')
    for (const p of r.a_receber) linhas.push(`• ${p.dia} · #${p.numero} ${p.nome} · ${real(p.total)} · ${pagamento(p)}`)
  }

  if (r.estoque_baixo.length) {
    linhas.push('', '⚠️ *Estoque baixo*')
    for (const s of r.estoque_baixo) linhas.push(`• ${s.sabor}: ${s.quantidade} un`)
  }

  const o = r.ontem
  linhas.push('', `📊 *Ontem:* ${o.pedidos} ${o.pedidos === 1 ? 'pedido entregue' : 'pedidos entregues'} · ${real(o.valor)}`)
  if (o.sabores.length) linhas.push(`Mais saíram: ${o.sabores.map(s => `${s.sabor} ${s.quantidade}`).join(', ')}`)

  if (r.ofertas.length) {
    linhas.push('', '🛒 *Ofertas de hoje (Onde comprar)*')
    for (const x of r.ofertas) {
      const menos = Math.round((1 - x.preco_unidade / x.pago) * 100)
      linhas.push(`• ${x.insumo}: ${real(x.preco_unidade)} o ${x.unit} no ${x.mercado} (vocês pagam ${real(x.pago)}, −${menos}%)`)
      const tamanho = Number(x.tamanho).toLocaleString('pt-BR', { maximumFractionDigits: 3 })
      linhas.push(`   ${x.produto} · ${real(x.preco)} por ${tamanho} ${x.unit}`)
    }
  }
  return linhas.join('\n')
}
