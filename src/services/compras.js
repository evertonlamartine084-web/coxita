import { supabase } from './supabase'

/**
 * Compras pelo cupom: a leitura da SEFAZ e a gravação nas planilhas ficam na função `cupom-ler`
 * (supabase/functions/cupom-ler). Aqui só a chamada e as consultas do histórico.
 */

async function chamar(corpo) {
  const { data, error } = await supabase.functions.invoke('cupom-ler', { body: corpo })
  if (error) {
    // a função devolve o motivo no corpo mesmo quando o status é de erro
    let detalhe = null
    try { detalhe = await error.context?.json?.() } catch { /* sem corpo */ }
    throw new Error(detalhe?.erro || error.message || 'Erro ao falar com a função.')
  }
  if (data?.erro) throw new Error(data.erro)
  return data
}

/** Abre a consulta pela URL do QR code. Devolve { precisa_codigo, sessao_id, captcha } ou a nota. */
export const abrirCupom = (url) => chamar({ acao: 'abrir', url })

/** Envia o código da imagem. Devolve { nota, itens } ou { codigo_errado, captcha }. */
export const confirmarCodigo = (sessao_id, codigo) => chamar({ acao: 'confirmar', sessao_id, codigo })

/** Grava no painel e nas planilhas. Devolve { compra_id, planilhas }. */
export const gravarCompra = (nota, itens, sessao_id) => chamar({ acao: 'gravar', nota, itens, sessao_id })

export async function listarCompras(limite = 60) {
  const { data, error } = await supabase
    .from('compras')
    .select('*, compras_itens(id, ordem, nome, quantidade, unidade, valor_unitario, valor_total, categoria, planilha_linha)')
    .order('emitida_em', { ascending: false, nullsFirst: false })
    .limit(limite)
  if (error) throw error
  return (data ?? []).map(c => ({ ...c, compras_itens: (c.compras_itens ?? []).sort((a, b) => a.ordem - b.ordem) }))
}

export async function apagarCompra(id) {
  const { error } = await supabase.from('compras').delete().eq('id', id)
  if (error) throw error
}

export const CATEGORIAS = [
  { valor: 'comida', rotulo: 'Comida' },
  { valor: 'limpeza', rotulo: 'Limpeza e embalagens' },
  { valor: 'outro', rotulo: 'Fora da planilha' },
]
