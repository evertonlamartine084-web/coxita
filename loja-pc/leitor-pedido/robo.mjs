/**
 * Robô leitor de pedido do Zap — roda no PC da loja, no Docker do WSL, como a Evolution, o robô
 * da Receita e o da transcrição. Sem IA paga: usa as regras de lerPedidoDoZap.js (a mesma cópia
 * de src/utils/lerPedidoDoZap.js que o painel usa no botão "Montar pedido").
 *
 * A cada volta pergunta à função zap-ler-pedido quais conversas têm mensagem nova, lê cada uma e
 * grava o pedido achado em zap_conversas.pedido_lido. O Atendimento mostra a faixa
 * "Pedido na conversa · Falta: ..." com o botão para conferir e criar.
 */
import * as local from './lerPedidoDoZap.js'

// regras: começa com a cópia da imagem e troca pela versão da função quando ela muda
let lerPedidoDoZap = local.lerPedidoDoZap
let versaoRegras = 'local'

const URL_FUNCAO = `${process.env.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/zap-ler-pedido`
const SEGREDO = process.env.LEITOR_SEGREDO
const INTERVALO = Number(process.env.INTERVALO_SEGUNDOS || 15) * 1000

const log = (...a) => console.log(new Date().toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' }), ...a)

async function chamar(acao, dados = {}) {
  const r = await fetch(URL_FUNCAO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-robo-segredo': SEGREDO },
    body: JSON.stringify({ acao, ...dados }),
    signal: AbortSignal.timeout(60000),
  })
  const corpo = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${acao}: HTTP ${r.status} ${corpo.erro ?? ''}`)
  return corpo
}

async function atualizarRegras() {
  try {
    const { versao, codigo } = await chamar('regras')
    if (!versao || versao === versaoRegras || !codigo) return
    const mod = await import(`data:text/javascript;base64,${Buffer.from(codigo).toString('base64')}`)
    if (typeof mod.lerPedidoDoZap !== 'function') throw new Error('regras sem lerPedidoDoZap')
    lerPedidoDoZap = mod.lerPedidoDoZap
    versaoRegras = versao
    log('regras atualizadas:', versao)
  } catch (e) {
    log('não consegui atualizar as regras:', e.message)
  }
}

let ultimoPulso = 0
let ultimaRegra = 0
log('robô leitor de pedido no ar')
for (;;) {
  try {
    if (Date.now() - ultimaRegra > 300000) {
      await atualizarRegras()
      ultimaRegra = Date.now()
    }
    if (Date.now() - ultimoPulso > 600000) {
      await chamar('pulso', { nota: `regras ${versaoRegras}` })
      ultimoPulso = Date.now()
    }
    const { conversas = [], produtos = [], sabores = [] } = await chamar('pendentes')
    for (const c of conversas) {
      const temCliente = c.mensagens.some(m => !m.de_mim)
      const r = temCliente ? lerPedidoDoZap(c.mensagens, produtos, sabores) : null
      // "Quero encomendar um cento" (mensagem do anúncio) sozinho não é pedido: precisa de mais
      // dois sinais além da quantidade
      const sinais = r ? [!r.faltando.includes('sabores'), !!r.data, r.tipo_entrega !== 'indefinido', r.pagamento !== 'nao_informado'].filter(Boolean).length : 0
      const leitura = r && r.itens.length && sinais >= 2 ? { ...r, ultima: c.mensagens[c.mensagens.length - 1]?.id ?? null } : null
      await chamar('gravar', { conversa: c.chave, leitura, ate: c.ate })
      if (leitura) log(c.chave, leitura.pronto ? 'PRONTO' : `falta ${leitura.faltando.join(', ')}`, `${leitura.itens.length} item(ns)`)
    }
  } catch (e) {
    log('erro:', e.message)
  }
  await new Promise(r => setTimeout(r, INTERVALO))
}
