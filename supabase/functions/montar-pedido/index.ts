import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Anthropic from "npm:@anthropic-ai/sdk"

/**
 * Lê a conversa do WhatsApp (aba Atendimento) e devolve o pedido montado para o painel conferir:
 * itens com sabores de 25 em 25, entrega ou retirada, endereço, horário, pagamento e dúvidas.
 * Não grava nada: quem cria o pedido é a pessoa, no NovoPedidoModal, depois de conferir.
 *
 * Chamada pelo painel logado (verify_jwt). Precisa do segredo ANTHROPIC_API_KEY.
 */

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  })

const texto = { type: ["string", "null"] }

// Saída estruturada: o modelo só consegue devolver neste formato.
const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["nome_cliente", "tipo_entrega", "endereco", "data", "hora", "pagamento", "troco_para", "itens", "observacoes", "duvidas"],
  properties: {
    nome_cliente: texto,
    tipo_entrega: { type: "string", enum: ["entrega", "retirada", "indefinido"] },
    endereco: {
      type: "object",
      additionalProperties: false,
      required: ["rua", "numero", "bairro", "cep", "complemento"],
      properties: { rua: texto, numero: texto, bairro: texto, cep: texto, complemento: texto },
    },
    data: { type: ["string", "null"], description: "AAAA-MM-DD" },
    hora: { type: ["string", "null"], description: "HH:MM, 24 h" },
    pagamento: { type: "string", enum: ["pix", "dinheiro", "credito", "debito", "nao_informado"] },
    troco_para: { type: ["number", "null"] },
    itens: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["produto_id", "quantidade", "sabores"],
        properties: {
          produto_id: { type: "string" },
          quantidade: { type: "integer" },
          sabores: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["sabor_id", "quantidade"],
              properties: { sabor_id: { type: "string" }, quantidade: { type: "integer" } },
            },
          },
        },
      },
    },
    observacoes: texto,
    duvidas: { type: "array", items: { type: "string" } },
  },
}

const SISTEMA = `Você ajuda a equipe da Coxelli Salgados (Natal/RN) a lançar no sistema o pedido que o cliente fez pelo WhatsApp.
Leia a conversa e devolva o pedido mais recente que o cliente fechou ou está fechando, usando só os produtos e sabores do catálogo (pelos ids).

Regras do cardápio:
- Pacotes (pack_size) são montados de 25 em 25 unidades: a soma dos sabores de cada pacote é exatamente o pack_size, cada sabor em múltiplos de 25. "Cento" = 100, "meio cento" = 50.
- Pacote com sabor_fixo já vem com o sabor; deixe "sabores" vazio nele.
- Se o cliente pediu "1 cento misto" sem dizer os sabores, ou uma divisão que não fecha em 25, monte o mais próximo possível e explique em "duvidas".
- Nomes do dia a dia: "coxinha" = Coxinha de frango; "queijo"/"bolinha" = Bolinha de queijo; "carne" = Bolinha de carne; "sertanejo"/"travesseiro" = Travesseiro sertanejo; "pizza"/"bombinha" = Bombinha de pizza; "calabresa" = Croquete de calabresa; "presunto"/"queijo e presunto" = Croquete de queijo e presunto; "enroladinho"/"salsicha" = Enroladinho de salsicha. "Congelado" é o produto congelado, não o frito.
- Refrigerante, quiche, empada e outros itens por unidade: produto sem pack_size, "quantidade" = quantas unidades, "sabores" vazio.
- "quantidade" de um pacote é quantos pacotes iguais; dois centos com sabores diferentes são dois itens.

Demais campos: só preencha o que a conversa diz; o resto fica null ("indefinido" no tipo de entrega, "nao_informado" no pagamento). Datas relativas ("amanhã", "sábado") viram AAAA-MM-DD a partir da data de hoje informada. Coloque em "duvidas" tudo que a equipe precisa confirmar com o cliente, em frases curtas. Não invente preço, endereço nem horário.`

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true })
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ erro: "sem_chave" }, 503)

  // Só o painel logado: o token do usuário tem de valer.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  const { data: usuario } = await supabase.auth.getUser(token)
  if (!usuario?.user) return json({ erro: "não autorizado" }, 401)

  const { conversa } = await req.json().catch(() => ({}))
  if (!conversa) return json({ erro: "conversa obrigatória" }, 400)

  const tresDias = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const [{ data: msgs }, { data: produtos }, { data: sabores }, { data: conv }] = await Promise.all([
    supabase.from("zap_mensagens").select("de_mim, tipo, texto, responde_texto, criada_em")
      .eq("conversa", conversa).gte("criada_em", tresDias).order("criada_em", { ascending: false }).limit(40),
    supabase.from("products").select("id, name, price, pack_size, flavor_group, fixed_flavor_id, categories(name)").eq("active", true),
    supabase.from("flavors").select("id, name, group_slug").eq("active", true),
    supabase.from("zap_conversas").select("nome").eq("chave", conversa).maybeSingle(),
  ])
  if (!msgs?.length) return json({ erro: "sem_mensagens" }, 422)

  const fuso = "America/Fortaleza"
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: fuso })
  const diaSemana = new Date().toLocaleDateString("pt-BR", { timeZone: fuso, weekday: "long" })
  const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: fuso, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })

  const catalogo = {
    produtos: (produtos ?? []).map((p: Record<string, unknown>) => ({
      id: p.id, nome: p.name, categoria: (p.categories as { name?: string } | null)?.name ?? null,
      pack_size: p.pack_size, grupo_de_sabores: p.flavor_group, sabor_fixo: p.fixed_flavor_id, preco: p.price,
    })),
    sabores: (sabores ?? []).map((s: Record<string, unknown>) => ({ id: s.id, nome: s.name, grupo: s.group_slug })),
  }
  const transcricao = [...msgs].reverse().map((m: Record<string, unknown>) => {
    const quem = m.de_mim ? "Loja" : "Cliente"
    const corpo = m.tipo === "texto" ? m.texto : `[${m.tipo}]${m.texto ? ` ${m.texto}` : ""}`
    const citada = m.responde_texto ? ` (respondendo a: "${m.responde_texto}")` : ""
    return `[${hora(m.criada_em as string)}] ${quem}${citada}: ${corpo}`
  }).join("\n")

  const client = new Anthropic()
  let resposta
  try {
    // Haiku 5.5: ~40x mais barato que o Opus (pedido do dono, 14/10/2026) e suficiente para tirar o
    // pedido de uma conversa curta; a equipe confere tudo antes de criar. Haiku não tem fallback
    // de recusa no servidor.
    resposta = await client.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 8000,
      output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMA } },
      system: [{ type: "text", text: SISTEMA }, { type: "text", text: `Catálogo (JSON):\n${JSON.stringify(catalogo)}`, cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content: `Hoje é ${diaSemana}, ${hoje}. Nome salvo do cliente: ${conv?.nome ?? "desconhecido"}.\n\nConversa:\n${transcricao}`,
      }],
    } as never)
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ erro: "ocupado" }, 429)
    if (e instanceof Anthropic.AuthenticationError) return json({ erro: "chave_invalida" }, 503)
    if (e instanceof Anthropic.APIError) return json({ erro: `api ${e.status}` }, 502)
    return json({ erro: "falha" }, 500)
  }

  if (resposta.stop_reason === "refusal") return json({ erro: "recusou" }, 422)
  const bloco = resposta.content.find((b: { type: string }) => b.type === "text") as { text: string } | undefined
  let pedido
  try { pedido = JSON.parse(bloco?.text ?? "") } catch { return json({ erro: "resposta_invalida" }, 502) }

  // Confere tudo contra o catálogo: id que não existe sai, sabor fora do grupo sai, pacote que
  // não fecha vira dúvida (o painel abre o seletor de sabores para esse).
  const porId = new Map((produtos ?? []).map((p: Record<string, unknown>) => [String(p.id), p]))
  const saborPorId = new Map((sabores ?? []).map((s: Record<string, unknown>) => [String(s.id), s]))
  const duvidas: string[] = [...(pedido.duvidas ?? [])]
  const itens = []
  for (const it of pedido.itens ?? []) {
    const p = porId.get(String(it.produto_id)) as Record<string, unknown> | undefined
    if (!p) continue
    const pack = Number(p.pack_size) || 0
    let sabs = (it.sabores ?? [])
      .filter((s: { sabor_id: string; quantidade: number }) => {
        const f = saborPorId.get(String(s.sabor_id)) as Record<string, unknown> | undefined
        return f && (!p.flavor_group || f.group_slug === p.flavor_group) && s.quantidade > 0
      })
      .map((s: { sabor_id: string; quantidade: number }) => ({
        id: String(s.sabor_id), name: (saborPorId.get(String(s.sabor_id)) as Record<string, unknown>).name, quantity: s.quantidade,
      }))
    let fechou = true
    if (pack && !p.fixed_flavor_id) {
      const soma = sabs.reduce((t: number, s: { quantity: number }) => t + s.quantity, 0)
      fechou = soma === pack && sabs.every((s: { quantity: number }) => s.quantity % 25 === 0)
      if (!fechou) { duvidas.push(`${p.name}: os sabores não fecham ${pack} — escolha no painel.`); sabs = [] }
    } else sabs = []
    itens.push({ produto_id: String(p.id), quantidade: Math.max(1, Number(it.quantidade) || 1), sabores: sabs, montar_sabores: !!(pack && !p.fixed_flavor_id && !fechou) })
  }

  return json({ pedido: { ...pedido, itens, duvidas } })
})
