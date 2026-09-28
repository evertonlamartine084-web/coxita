import { supabase } from './supabase'

/**
 * Cotação da taxa de entrega (R$ por km pelo caminho de carro, até o limite da loja). Com a chave
 * do Google no servidor, a distância sai pelo endereço com número; sem ela, pelo CEP.
 *
 * Quem calcula e grava a cotação é a função `calcular-entrega`; o pedido de entrega só é aceito
 * com o id que ela devolve. A coordenada do CEP é buscada aqui, no navegador, e vai junto:
 * os serviços de CEP bloqueiam o servidor, mas respondem normalmente ao celular do cliente.
 * O servidor ainda tenta a própria busca antes de usar a nossa.
 *
 * Devolve { id, km, taxa, dentro_area, max_km } ou lança Error('cep-nao-encontrado' | 'falha').
 */
export async function cotarEntrega({ cep, numero, rua, bairro }) {
  const limpo = String(cep).replace(/\D/g, '')
  let lat = null
  let lng = null
  try {
    const r = await fetch(`https://cep.awesomeapi.com.br/json/${limpo}`)
    if (r.ok) {
      const d = await r.json()
      lat = Number(d.lat) || null
      lng = Number(d.lng) || null
    }
  } catch {
    // sem a coordenada daqui o servidor ainda tenta a dele
  }

  const { data, error } = await supabase.functions.invoke('calcular-entrega', {
    body: { cep: limpo, numero, rua, bairro, lat, lng },
  })
  if (error) {
    // 404 do servidor = CEP que nenhum serviço achou
    const corpo = await error.context?.json?.().catch(() => null)
    throw new Error(corpo?.erro === 'cep-nao-encontrado' ? 'cep-nao-encontrado' : 'falha')
  }
  return data
}
