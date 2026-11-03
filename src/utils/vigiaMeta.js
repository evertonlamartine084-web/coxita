import { formatCurrency } from './format'

/**
 * Vigia da Meta (supabase/sql/vigia-meta.sql): julga os anúncios no ar do teste de criativos.
 * O orçamento é do conjunto (R$ 20/dia no total, dividido pela Meta entre os anúncios), então as
 * regras olham o gasto de cada um desde o início do teste. Desligar fica com o dono.
 */

const real = (v) => formatCurrency(Number(v) || 0)
const NO_AR = ['ACTIVE', 'IN_PROCESS', 'PENDING_REVIEW', 'WITH_ISSUES']

export function julgarAnuncios(anuncios, cfg) {
  const noAr = anuncios.filter(a => NO_AR.includes(a.situacao))
  const custo = (a) => a.conversas ? a.gasto / a.conversas : null
  const comparaveis = noAr.filter(a => a.conversas >= 3)
  const melhor = comparaveis.sort((a, b) => custo(a) - custo(b))[0] ?? null
  return noAr.map(a => {
    const c = custo(a)
    let veredito = 'testando'
    let motivo = a.gasto < 1 ? 'começando a rodar' : `${real(a.gasto)} gastos, ${a.conversas} conversas`
    if (!a.conversas && a.gasto >= cfg.gasto_sem_conversa) {
      veredito = 'matar'
      motivo = `gastou ${real(a.gasto)} e não trouxe nenhuma conversa`
    } else if (melhor && a !== melhor && a.gasto >= cfg.gasto_para_comparar && c >= cfg.multiplo * custo(melhor)) {
      veredito = 'matar'
      motivo = `está saindo ${real(c)} por conversa, mais de ${cfg.multiplo}× o melhor (${melhor.anuncio}, ${real(custo(melhor))})`
    } else if (a === melhor && a.conversas >= cfg.conversas_para_vencer) {
      veredito = 'vencendo'
      motivo = `o mais barato: ${real(c)} por conversa em ${a.conversas} conversas`
    }
    return { ...a, custo: c, veredito, motivo }
  }).sort((a, b) => (a.custo ?? 1e9) - (b.custo ?? 1e9))
}

export function textoDoAlerta(a) {
  return a.veredito === 'matar'
    ? `🚨 *Vigia da Meta*\n\nO anúncio *${a.anuncio}* ${a.motivo}.\n\n👉 Sugestão: *desligar*. O orçamento continua o mesmo e vai para os outros.`
    : `🏆 *Vigia da Meta*\n\n*${a.anuncio}* está ganhando o teste: ${a.motivo}.`
}

export function textoDoPlacar(julgados, cfg) {
  const desde = new Date(`${cfg.inicio}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const icone = { matar: '🔴', vencendo: '🏆', testando: '🟡' }
  const linhas = [`📊 *Placar dos anúncios da Meta* (desde ${desde})`, '']
  julgados.forEach((a, i) => {
    linhas.push(`${icone[a.veredito]} ${i + 1}. *${a.anuncio}*: ${a.custo ? `${real(a.custo)} por conversa` : 'sem conversa'} · ${a.conversas} conversas · ${real(a.gasto)}`)
  })
  const total = julgados.reduce((s, a) => s + a.gasto, 0)
  linhas.push('', `Total: ${real(total)} · orçamento de R$ 20/dia dividido entre ${julgados.length} anúncios.`)
  if (julgados.some(a => a.veredito === 'matar')) linhas.push('🔴 = sugestão de desligar')
  return linhas.join('\n')
}
