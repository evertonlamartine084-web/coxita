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

/** Compra que veio da Receita e esperava conferência: grava blocos e nome da loja e lança nas planilhas. */
export const confirmarPendente = (compra_id, itens, emitente_nome) =>
  chamar({ acao: 'confirmar_pendente', compra_id, itens: itens.map(i => ({ ordem: i.ordem, categoria: i.categoria })), emitente_nome })

/**
 * Põe na fila do robô do PC da loja uma NF-e lida pelo código de barras. Se a chave já foi pedida
 * antes e deu erro, volta para pendente.
 */
export async function pedirNfe(chave) {
  const { data: ja } = await supabase.from('compras').select('id, conferida').eq('chave_acesso', chave).maybeSingle()
  if (ja) return { ja_lancada: true, conferida: ja.conferida }
  const { error } = await supabase.from('nfe_pedidas').upsert(
    { chave, status: 'pendente', mensagem: null, tentativas: 0, atualizada_em: new Date().toISOString() },
    { onConflict: 'chave' },
  )
  if (error) throw error
  return { pedida: true }
}

export async function listarPedidas() {
  const { data, error } = await supabase.from('nfe_pedidas').select('*')
    .neq('status', 'recebida').order('criada_em', { ascending: false }).limit(20)
  if (error) throw error
  return data ?? []
}

export async function apagarPedida(chave) {
  await supabase.from('nfe_pedidas').delete().eq('chave', chave)
}

/** Último sinal de vida do robô da Receita (PC da loja). */
export async function estadoDoRobo() {
  const { data } = await supabase.from('settings').select('value').eq('key', 'nfe_robo_estado').maybeSingle()
  try { return data?.value ? JSON.parse(data.value) : null } catch { return null }
}

/** Tenta de novo a gravação nas planilhas de uma compra que ficou com erro. */
export const replanilhar = (compra_id) => chamar({ acao: 'replanilhar', compra_id })

export async function listarCompras(limite = 60) {
  const { data, error } = await supabase
    .from('compras')
    .select('id, chave_acesso, numero, emitente_nome, emitente_nome_sefaz, emitente_cnpj, emitida_em, total, forma_pagamento, qtd_itens, url_qrcode, planilha_totais_linha, planilha_erro, origem, conferida, created_at, compras_itens(id, ordem, nome, quantidade, unidade, valor_unitario, valor_total, categoria, planilha_linha)')
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
