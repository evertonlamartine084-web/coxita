import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import { bling, ErroBling } from "../_shared/bling.ts"

/**
 * bling-emitir-nota — emite a NFC-e de um pedido pelo Bling.
 *
 * Caminho: pedido de venda no Bling → NFC-e gerada a partir dele → envio à Sefaz. Passar pelo
 * pedido de venda, e não criar a nota direto, deixa a parte fiscal (natureza de operação, NCM,
 * CFOP, tributação) inteira no cadastro do Bling, onde o contador mexe; o site só diz "vendi
 * isto, a este preço, pago assim".
 *
 * Cada etapa grava o id que o Bling devolveu antes de seguir. Se uma falhar, chamar de novo
 * retoma dali: não cria segundo pedido de venda nem segunda nota para a mesma venda.
 *
 * Valores: itens pelo preço cheio, e o que o cliente deixou de pagar (cupom + à vista, que
 * `orders.discount` já soma) vai no desconto. A nota mostra que houve desconto, e o total
 * bate com o que foi cobrado.
 */

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } })

/** Tipos de pagamento do Bling (tabela da Sefaz), em ordem de preferência por forma do site. */
const TIPO_PAGAMENTO: Record<string, number[]> = {
  dinheiro: [1],
  credito: [3],
  cartao: [3], // cartão online pela Cielo é sempre crédito
  debito: [4],
  pix_online: [17, 20], // QR gerado por cobrança: Pix dinâmico
  pix: [20, 17], // chave ou QR fixo da loja: Pix estático
}

// NFC-e: 5 autorizada, 6 emitida DANFE — as duas querem dizer "nota vale"
const AUTORIZADA = [5, 6]
const REJEITADA = 4
const CANCELADA = 2

/** Um pedido "pendente" há mais que isto é tentativa que morreu no meio e pode ser retomada. */
const PENDENTE_ABANDONADO_MS = 5 * 60_000

const hojeSaoPaulo = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())

const reais = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  // Emitir documento fiscal é operação do painel
  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  })
  const { data: { user } } = await anon.auth.getUser()
  if (!user) return json({ erro: "não autorizado" }, 401)

  let orderId: string | undefined
  try {
    ;({ order_id: orderId } = await req.json())
  } catch {
    return json({ erro: "corpo inválido" }, 400)
  }
  if (!orderId) return json({ erro: "order_id é obrigatório" }, 400)

  // Trava: só uma emissão por pedido de cada vez. Dois cliques, ou a automática e o botão ao
  // mesmo tempo, não podem virar duas notas. O update condicional é atômico no banco.
  const abandonado = new Date(Date.now() - PENDENTE_ABANDONADO_MS).toISOString()
  const { data: travado } = await supabase
    .from("orders")
    .update({ bling_nfe_status: "pendente", bling_nfe_erro: null, bling_nfe_em: new Date().toISOString() })
    .eq("id", orderId)
    .or(`bling_nfe_status.is.null,bling_nfe_status.eq.erro,and(bling_nfe_status.eq.pendente,bling_nfe_em.lt.${abandonado})`)
    .select("id")
    .maybeSingle()

  if (!travado) {
    const { data: atual } = await supabase
      .from("orders")
      .select("bling_nfe_status, bling_nfe_numero")
      .eq("id", orderId)
      .maybeSingle()
    if (!atual) return json({ erro: "pedido não encontrado" }, 404)
    if (atual.bling_nfe_status === "emitida") {
      return json({ ok: true, status: "emitida", numero: atual.bling_nfe_numero })
    }
    if (atual.bling_nfe_status === "cancelada") return json({ erro: "a nota deste pedido foi cancelada" }, 409)
    return json({ erro: "a nota deste pedido já está sendo emitida; aguarde e atualize" }, 409)
  }

  const registrar = (campos: Record<string, unknown>) =>
    supabase.from("orders").update(campos).eq("id", orderId)

  try {
    const { data: pedido, error } = await supabase
      .from("orders")
      .select(`
        id, order_number, status, customer_name, customer_phone, customer_cpf, payment_method,
        subtotal, delivery_fee, discount, total, bling_pedido_id, bling_nfe_id,
        order_items(product_id, product_name, quantity, unit_price, total_price, products(bling_codigo))
      `)
      .eq("id", orderId)
      .single()
    if (error || !pedido) throw new ErroBling("pedido não encontrado", 404)
    if (pedido.status === "cancelado") throw new ErroBling("pedido cancelado não recebe nota", 409)

    let pedidoVendaId = pedido.bling_pedido_id ? Number(pedido.bling_pedido_id) : null
    let notaId = pedido.bling_nfe_id ? Number(pedido.bling_nfe_id) : null

    // ─── 1. pedido de venda ────────────────────────────────────────────────
    if (!pedidoVendaId && !notaId) {
      const corpo = await montarPedidoVenda(supabase, pedido)
      const criado = await bling(supabase, "POST", "/pedidos/vendas", corpo)
      pedidoVendaId = Number(criado?.data?.id)
      if (!pedidoVendaId) throw new ErroBling("o Bling não devolveu o id do pedido de venda", 0, criado)
      await registrar({ bling_pedido_id: String(pedidoVendaId) })
    }

    // ─── 2. NFC-e a partir do pedido ───────────────────────────────────────
    if (!notaId) {
      const gerada = await bling(supabase, "POST", `/pedidos/vendas/${pedidoVendaId}/gerar-nfce`)
      notaId = Number(gerada?.data?.idNotaFiscal ?? gerada?.idNotaFiscal)
      if (!notaId) throw new ErroBling("o Bling não devolveu o id da nota", 0, gerada)
      await registrar({ bling_nfe_id: String(notaId) })
    }

    // ─── 3. envio à Sefaz ─────────────────────────────────────────────────
    // Consulta antes de enviar: numa retomada a nota pode já ter sido autorizada, e reenviar
    // nota autorizada dá erro.
    let nota = (await bling(supabase, "GET", `/nfce/${notaId}`))?.data ?? {}
    if (!AUTORIZADA.includes(nota.situacao) && nota.situacao !== CANCELADA) {
      await bling(supabase, "POST", `/nfce/${notaId}/enviar`)
      nota = (await bling(supabase, "GET", `/nfce/${notaId}`))?.data ?? {}
    }

    if (AUTORIZADA.includes(nota.situacao)) {
      await registrar({
        bling_nfe_status: "emitida",
        bling_nfe_numero: nota.numero ? String(nota.numero) : null,
        bling_nfe_chave: nota.chaveAcesso ?? null,
        bling_nfe_danfe: nota.linkDanfe ?? nota.linkPDF ?? null,
        bling_nfe_erro: null,
        bling_nfe_em: new Date().toISOString(),
      })
      return json({ ok: true, status: "emitida", numero: nota.numero, danfe: nota.linkDanfe ?? nota.linkPDF ?? null })
    }

    if (nota.situacao === CANCELADA) {
      await registrar({ bling_nfe_status: "cancelada", bling_nfe_em: new Date().toISOString() })
      return json({ erro: "a nota deste pedido está cancelada no Bling" }, 409)
    }

    // Rejeitada, ou ainda sem resposta da Sefaz: fica como erro para o botão poder tentar de novo
    const motivo = nota.situacao === REJEITADA
      ? "a Sefaz rejeitou a nota; veja o motivo na nota dentro do Bling"
      : `a nota ainda não foi autorizada (situação ${nota.situacao ?? "desconhecida"}); tente de novo em instantes`
    throw new ErroBling(motivo, 0, nota)
  } catch (e) {
    const detalhe = e instanceof ErroBling && e.detalhe ? ` ${JSON.stringify(e.detalhe).slice(0, 300)}` : ""
    const mensagem = (e instanceof Error && e.message) || String(e) || `falha sem mensagem:${detalhe}`
    console.error(`bling-emitir-nota pedido ${orderId}:`, mensagem, e instanceof ErroBling ? JSON.stringify(e.detalhe) : "")
    await registrar({ bling_nfe_status: "erro", bling_nfe_erro: mensagem.slice(0, 500), bling_nfe_em: new Date().toISOString() })
    return json({ erro: mensagem }, 422)
  }
})

/** Corpo do pedido de venda. Tudo o que depende do cadastro do Bling é resolvido aqui. */
async function montarPedidoVenda(supabase: any, pedido: any) {
  const itens = pedido.order_items ?? []
  if (itens.length === 0) throw new ErroBling("pedido sem itens")

  const semCodigo = itens.filter((i: any) => !i.products?.bling_codigo).map((i: any) => i.product_name)
  if (semCodigo.length) {
    throw new ErroBling(`sem código do Bling no cadastro do site: ${[...new Set(semCodigo)].join(", ")}`)
  }

  // Os valores têm de fechar com o que foi cobrado, senão a nota sai com total diferente
  const somaItens = reais(itens.reduce((s: number, i: any) => s + Number(i.total_price), 0))
  const esperado = reais(somaItens + reais(pedido.delivery_fee) - reais(pedido.discount))
  if (Math.abs(esperado - reais(pedido.total)) > 0.009) {
    throw new ErroBling(
      `valores não fecham: itens ${somaItens} + frete ${reais(pedido.delivery_fee)} − desconto ${reais(pedido.discount)} ≠ total ${reais(pedido.total)}`,
    )
  }

  const codigos = [...new Set<string>(itens.map((i: any) => i.products.bling_codigo))]
  const produtos = await produtosPorCodigo(supabase, codigos)
  const faltando = codigos.filter((c) => !produtos.has(c))
  if (faltando.length) throw new ErroBling(`produto não cadastrado no Bling: ${faltando.join(", ")}`)

  const hoje = hojeSaoPaulo()
  return {
    numeroLoja: String(pedido.order_number),
    data: hoje,
    dataSaida: hoje,
    dataPrevista: hoje,
    contato: { id: await contatoDoCliente(supabase, pedido) },
    itens: itens.map((i: any) => ({
      produto: { id: produtos.get(i.products.bling_codigo) },
      codigo: i.products.bling_codigo,
      descricao: i.product_name,
      unidade: "UN",
      quantidade: Number(i.quantity),
      valor: reais(i.unit_price),
    })),
    desconto: { valor: reais(pedido.discount), unidade: "REAL" },
    transporte: { fretePorConta: 0, frete: reais(pedido.delivery_fee) },
    parcelas: [{
      dataVencimento: hoje,
      valor: reais(pedido.total),
      formaPagamento: { id: await formaDePagamento(supabase, pedido.payment_method) },
    }],
    observacoes: `Pedido nº ${pedido.order_number} do site`,
  }
}

async function produtosPorCodigo(supabase: any, codigos: string[]) {
  const qs = codigos.map((c) => `codigos[]=${encodeURIComponent(c)}`).join("&")
  const r = await bling(supabase, "GET", `/produtos?${qs}`)
  const mapa = new Map<string, number>()
  for (const p of r?.data ?? []) if (p?.codigo) mapa.set(p.codigo, p.id)
  return mapa
}

/**
 * Com CPF, o contato é a pessoa — procurado pelo documento, criado se ainda não existe. Sem CPF,
 * todos caem num único "Consumidor final", que a NFC-e aceita sem identificação.
 */
async function contatoDoCliente(supabase: any, pedido: any): Promise<number> {
  const cpf = String(pedido.customer_cpf ?? "").replace(/\D/g, "")
  if (cpf.length === 11) {
    const achado = await bling(supabase, "GET", `/contatos?numeroDocumento=${cpf}`)
    if (achado?.data?.[0]?.id) return achado.data[0].id
    const criado = await bling(supabase, "POST", "/contatos", {
      nome: pedido.customer_name || "Cliente",
      tipo: "F",
      numeroDocumento: cpf,
      situacao: "A",
      celular: pedido.customer_phone ?? undefined,
      indicadorIe: 9, // não contribuinte
    })
    return criado.data.id
  }

  const NOME = "Consumidor final"
  const achado = await bling(supabase, "GET", `/contatos?pesquisa=${encodeURIComponent(NOME)}`)
  const existente = (achado?.data ?? []).find((c: any) => c.nome === NOME && !c.numeroDocumento)
  if (existente) return existente.id
  const criado = await bling(supabase, "POST", "/contatos", { nome: NOME, tipo: "F", situacao: "A", indicadorIe: 9 })
  return criado.data.id
}

/** Forma de pagamento ativa no Bling cujo tipo corresponde ao do site; a padrão tem preferência. */
async function formaDePagamento(supabase: any, metodo: string): Promise<number> {
  const tipos = TIPO_PAGAMENTO[metodo]
  if (!tipos) throw new ErroBling(`forma de pagamento sem correspondência no Bling: ${metodo}`)
  const r = await bling(supabase, "GET", "/formas-pagamentos?situacao=1&limite=100")
  const ativas = r?.data ?? []
  for (const tipo of tipos) {
    const doTipo = ativas.filter((f: any) => f.tipoPagamento === tipo)
    const escolhida = doTipo.find((f: any) => f.padrao === 1) ?? doTipo[0]
    if (escolhida) return escolhida.id
  }
  throw new ErroBling(`nenhuma forma de pagamento ativa no Bling para "${metodo}"; cadastre uma em Configurações › Formas de pagamento`)
}
