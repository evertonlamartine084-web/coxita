/**
 * Robô que lê a conversa do WhatsApp e monta o pedido sozinho (04/11/2026), sem IA paga: só
 * regras, rodando no navegador. Troca o "Montar pedido" que chamava a Anthropic.
 *
 * Devolve o mesmo formato que a função montar-pedido devolvia, para o NovoPedidoModal abrir
 * preenchido, e mais `faltando` (o que a conversa ainda não disse) e `pronto`.
 *
 * Como lê:
 * - Sabores: a ÚLTIMA mensagem com sabores vale ("25 coxinha / 25 queijo"). Sabores sem número
 *   ("Coxinha, Bolinha de carne, Enroladinho") dividem a quantidade em partes de 25. Lista de
 *   sabores mandada pela loja sem número é o cardápio, não o pedido, e é ignorada.
 * - Quantidade: "cento", "meio cento", "2 centos", "200 salgados"; "mais 50" soma. Se os sabores
 *   vieram com número, a soma deles manda.
 * - Data e hora: só o que o CLIENTE escreveu ("hoje", "amanhã", "sábado", "16/10", "17h",
 *   "5 da tarde", ou só "18" logo depois da loja perguntar o horário).
 * - Entrega/retirada, endereço e pagamento: a última menção vale; comprovante mandado = Pix.
 *
 * Tudo é conferido por uma pessoa no NovoPedidoModal antes de criar o pedido.
 */

const FUSO = 'America/Fortaleza'

export const normalizar = (t) =>
  String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    // "centro de salgados" é o jeito mais comum de escrever "cento" na conversa
    .replace(/\bcentros?\b/g, (c) => c.replace('centro', 'cento'))

// Ordem importa: os nomes mais longos saem primeiro e são apagados da linha, para "pastel de
// pizza" não virar também "bombinha de pizza" e "queijo e presunto" não virar "bolinha de queijo".
const APELIDOS = [
  ['coxinha de nutela', /coxinhas? (de |com )?nutell?a|\bnutell?a\b/],
  ['churros de doce de leite', /churros? (de |com )?doce de leite/],
  ['churros de brigadeiro', /churros? (de |com )?brigadeiro/],
  ['pastel de queijo e presunto', /past(el|eis|eiz) de queijo (e |com )?presunto/],
  ['pastel de frango', /past(el|eis|eiz) de frango/],
  ['pastel de carne', /past(el|eis|eiz) de carne/],
  ['pastel de pizza', /past(el|eis|eiz) de pizza/],
  ['pastel sertanejo', /past(el|eis|eiz) (de )?(sertanej[oa]|carne de sol)/],
  ['croquete de queijo e presunto', /((croquetes?|crocretes?|risoles?|risoli) (de )?)?queijo (e |com )?presunto|(risoles?|risoli)( de queijo)?|\bpresunto\b/],
  ['croquete de calabresa', /(croquetes? (de )?)?calabresa/],
  ['travesseiro sertanejo', /travesseiros?( sertanejos?)?|(bolinhas?|bolinhos?) sertanej[oa]s?|\bsertanej[oa]s?\b|carne de sol/],
  // o cardápio mandado pela loja chama de "coxinha de carne": é a bolinha de carne
  ['bolinha de carne', /(bolinhas?|bolinhos?|coxinhas?) de carne|\bcarne\b/],
  ['bolinha de queijo', /(bolinhas?|bolinhos?) de queijo( cheddar)?|queijo cheddar|\bqueijo\b|\bbolinhas?\b/],
  ['coxinha de frango', /coxinhas?( de frango)?|\bfrango\b/],
  ['enroladinho de salsicha', /enroladinhos?( de salsicha)?|\bsalsichas?\b/],
  ['bombinha de pizza', /bombinhas?( de pizza)?|\bpizza\b/],
  // "croquete" sozinho: o mais pedido é o de queijo e presunto; vira dúvida.
  ['croquete de queijo e presunto?', /\b(croquetes?|crocretes?)\b/],
]

const NUMEROS_ESCRITOS = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, meio: 0.5, meia: 0.5 }
const DIAS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']

/** AAAA-MM-DD do instante, no fuso de Natal. */
const diaLocal = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: FUSO })
const somarDias = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const diaDaSemana = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay()

const corpo = (m) => (m.tipo === 'audio' ? m.transcricao : m.texto) ?? m.transcricao ?? ''

/** Número perto do sabor, que não seja preço ("26.00", "R$ 30", "30 reais"). */
function quantidadeNoTrecho(trecho) {
  const limpo = trecho
    .replace(/r\$\s*\d+([.,]\d+)?/g, ' ')
    .replace(/\d+[.,]\d{2}\b/g, ' ')
    .replace(/\d+\s*(reais|conto)/g, ' ')
  const m = limpo.match(/\b(\d{2,3})(?!\d)/) ?? limpo.match(/(\d{2,3})/)
  const n = m ? Number(m[1]) : null
  return n && n % 25 === 0 && n <= 1000 ? n : null
}

/** Sabores citados numa mensagem: [{ chave, qtd|null }]. */
function saboresDaMensagem(texto) {
  const achados = []
  // espaço repetido dentro da linha ("200 unidades  de sertaneja") não separa o número do sabor
  const trechos = normalizar(texto).replace(/[ \t]+/g, ' ').split(/\n|,|;|\+|\s+e\s+(?=\d)/)
  for (const original of trechos) {
    let resto = ` ${original} `
    const naLinha = []
    for (const [chave, re] of APELIDOS) {
      const rg = new RegExp(re.source, 'g')
      if (rg.test(resto)) {
        naLinha.push(chave)
        resto = resto.replace(new RegExp(re.source, 'g'), ' # ')
      }
    }
    if (!naLinha.length) continue
    // Um sabor no trecho leva o número do trecho; vários sabores no mesmo trecho sem separador
    // ("25 coxinha 25 queijo") ficam sem número.
    const qtd = naLinha.length === 1 ? quantidadeNoTrecho(original) : null
    for (const chave of naLinha) achados.push({ chave, qtd })
  }
  // o mesmo sabor duas vezes na mensagem soma
  const porChave = new Map()
  for (const a of achados) {
    const atual = porChave.get(a.chave)
    if (!atual) porChave.set(a.chave, { ...a })
    else if (a.qtd != null) atual.qtd = (atual.qtd ?? 0) + a.qtd
  }
  return [...porChave.values()]
}

/** "1 cento", "meio cento", "2 centos e meio", "200 salgados". null se não fala de quantidade. */
const CENTENAS = { cem: 100, duzentos: 200, trezentos: 300, quatrocentos: 400, quinhentos: 500, seiscentos: 600, setecentos: 700, oitocentos: 800, novecentos: 900, mil: 1000 }

function quantidadeTotal(texto, logoAposPerguntarQuantos) {
  const t = normalizar(texto).replace(/\b(cem|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|mil)\b(?=\s+(salgados?|unidades?|sortidos?|fritos?))/g, (n) => String(CENTENAS[n]))
  let total = null
  if (logoAposPerguntarQuantos) {
    const curto = t.trim().match(/^(?:so |somente |apenas |e |sao )?(\d{1,4}|um|uma|dois|duas|tres|quatro|cinco|meio)\b(?: mesmo| so| centos?| unidades| salgados)?[.!]?$/)
    if (curto) {
      // "6" = 6 centos; "600" = 600 unidades
      const n = /^\d+$/.test(curto[1]) ? Number(curto[1]) : NUMEROS_ESCRITOS[curto[1]]
      if (n <= 20) return n * 100
      if (n % 50 === 0) return n
    }
  }
  const centos = [...t.matchAll(/\b(\d+|um|uma|dois|duas|tres|quatro|cinco|seis|meio|meia)\s+centos?\b(\s+e\s+meio)?/g)]
  for (const c of centos) {
    const base = /^\d+$/.test(c[1]) ? Number(c[1]) : NUMEROS_ESCRITOS[c[1]]
    total = (total ?? 0) + base * 100 + (c[2] ? 50 : 0)
  }
  if (total == null && /\b(o|um|1)?\s*cento\b/.test(t) && !/\bpor cento\b/.test(t)) total = 100
  const unidades = t.match(/\b(\d{2,4})\s*(salgados?|unidades?|sortidos?|variados?|fritos?|congelados?)\b/)
  if (unidades) {
    const n = Number(unidades[1])
    if (n % 50 === 0 && n >= 50) total = n
  }
  return total
}

/** Hora "HH:MM" que o cliente escreveu, ou null. */
const HORAS_ESCRITAS = { uma: 1, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12 }

function horaDaMensagem(texto, logoAposPergunta) {
  const t = normalizar(texto).replace(/\b(uma|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\s+(da tarde|da noite|da manha|horas?)\b/g, (_, n, r) => `${HORAS_ESCRITAS[n]} ${r}`)
  if (/meio[- ]dia/.test(t)) return '12:00'
  let m = t.match(/\b(\d{1,2})\s*(?:h:?|:)\s*(\d{2})\b/) // 17h30, 17:30, 18h:30
  let h = null
  let min = 0
  if (m) { h = Number(m[1]); min = Number(m[2]) }
  if (h == null) {
    m = t.match(/\b(\d{1,2})\s*(h|hs|hrs?|horas?)\b/) ?? t.match(/\b(?:as|a partir das|pras?|para as)\s+(\d{1,2})\b(?!\s*\/)/)
    if (m) h = Number(m[1])
  }
  if (h == null && logoAposPergunta) {
    m = t.trim().match(/^(?:as\s+)?(\d{1,2})(?:\s*(?:ou|,)\s*\d{1,2})?\s*[.!]?$/)
    if (m) h = Number(m[1])
  }
  if (h == null) return null
  if (/tarde|noite/.test(t) && h < 12) h += 12
  if (h >= 1 && h <= 6 && !/manha/.test(t)) h += 12 // "as 5" numa loja de salgado é 17h
  if (h < 7 || h > 22 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** Data AAAA-MM-DD que o cliente escreveu, contando a partir do dia da mensagem. */
function dataDaMensagem(texto, emIso) {
  const t = normalizar(texto)
  const base = diaLocal(emIso)
  let m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
  if (m) {
    const dia = Number(m[1]); const mes = Number(m[2])
    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
      let ano = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : Number(base.slice(0, 4))
      let iso = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
      if (!m[3] && iso < base) iso = `${ano + 1}${iso.slice(4)}`
      return iso
    }
  }
  if (/depois de amanha/.test(t)) return somarDias(base, 2)
  if (/\bamanha\b/.test(t)) return somarDias(base, 1)
  if (/\b(hoje|hj|agora|daqui a pouco)\b/.test(t)) return base
  m = t.match(/\bdia\s+(\d{1,2})\b/)
  if (m) {
    const dia = Number(m[1])
    let [ano, mes] = base.split('-').map(Number)
    if (dia < Number(base.slice(8))) { mes += 1; if (mes > 12) { mes = 1; ano += 1 } }
    if (dia >= 1 && dia <= 31) return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  }
  for (let i = 0; i < 7; i++) {
    if (new RegExp(`\\b${DIAS[i]}(-feira)?\\b`).test(t)) {
      const hoje = diaDaSemana(base)
      return somarDias(base, (i - hoje + 7) % 7)
    }
  }
  return null
}

const RUA = /\b(rua|r\.|av\.?|avenida|travessa|tv\.?|trav\.?|alameda|estrada|rodovia|conjunto|conj\.?|residencial|condominio|cond\.?|loteamento)\s/

/** Endereço que o cliente mandou: { rua, numero, bairro, cep, complemento, referencia } ou null. */
function enderecoDaMensagem(texto) {
  const original = String(texto ?? '')
  const t = normalizar(original)
  if (/jose miranda/.test(t)) return null // é o endereço da loja
  const cep = t.match(/\b(\d{5})-?(\d{3})\b/)
  const linhas = original.split(/\n/).map(l => l.trim()).filter(Boolean)
  const iRua = linhas.findIndex(l => RUA.test(`${normalizar(l)} `))
  if (iRua < 0 && !cep) return null
  const r = { rua: null, numero: null, bairro: null, cep: cep ? `${cep[1]}-${cep[2]}` : null, complemento: null, referencia: null }
  const extras = []
  linhas.forEach((l, i) => {
    const n = normalizar(l)
    if (i === iRua) {
      // a rua vai do tipo (rua, av...) até o primeiro número; o que vem depois é bairro ou complemento
      const inicio = normalizar(l).search(RUA)
      const daRua = l.slice(Math.max(0, inicio))
      const num = daRua.match(/^(.*?[a-zà-ú.)])\s*(?:,|-)?\s*(?:n[º°o.]?\s*|numero\s*|nº\s*)?(\d{1,5}[a-z]?)\b(.*)$/i)
      if (num) {
        r.rua = num[1].replace(/\s*[,-]\s*$/, '').trim()
        r.numero = num[2]
        let depois = num[3].replace(/^[\s,.-]+/, '')
        // "(Bloco B, apto 306)" é complemento inteiro
        const parenteses = depois.match(/\(([^)]*)\)/)
        if (parenteses) { r.complemento = parenteses[1].trim(); depois = depois.replace(parenteses[0], ' ').trim() }
        // "candelaria. 10 horas aproximadamente": só o primeiro pedaço é endereço
        for (const pedaco of depois.split(/[.,;]|\s-\s/).map(x => x.trim()).filter(Boolean)) {
          extras.push(pedaco)
          if (!/\b(bloco|bl|apto?|casa|lote|quadra|qd|torre)\b/i.test(pedaco)) break
        }
      } else r.rua = daRua.trim()
      return
    }
    if (/\b\d{5}-?\d{3}\b/.test(n) && n.replace(/[^a-z]/g, '').length < 4) return
    extras.push(l)
  })
  // "Rua presidente José Bento ⏎ 684 alecrim": número na linha de baixo, e o resto é o bairro
  if (r.rua && !r.numero) {
    const i = extras.findIndex(l => /^\s*(n[º°o.]?\s*)?\d{1,5}[a-z]?\b/i.test(l))
    if (i >= 0) {
      const m = extras[i].match(/^\s*(?:n[º°o.]?\s*)?(\d{1,5}[a-z]?)\b[\s,.-]*(.*)$/i)
      r.numero = m[1]
      extras.splice(i, 1, ...(m[2] ? [m[2]] : []))
    }
  }
  for (const l of extras) {
    const n = normalizar(l)
    if (/\b(bloco|bl|apto?|apartamento|casa|lote|quadra|qd|torre|sala)\b/.test(n)) r.complemento = r.complemento ? `${r.complemento}, ${l}` : l
    else if (/\b(proximo|perto|ao lado|em frente|frente|referencia|depois|antes|esquina)\b/.test(n)) r.referencia = r.referencia ? `${r.referencia}, ${l}` : l
    else if (!r.bairro && l.split(/\s+/).length <= 5 && !/\d/.test(l)) r.bairro = l.replace(/^bairro\s*:?\s*/i, '')
  }
  if (!r.rua && !r.cep) return null
  return r
}

/**
 * Taxa de entrega que a LOJA passou: "Entrega fica 15 reais", "Fica 20 reais a taxa de entrega",
 * "A entrega para esse endereço fica 4 reais", "+ 15 de entrega". Horário de entrega ("entregamos
 * de 13h às 18h") e percentual não contam.
 */
function taxaDaMensagem(texto) {
  const t = normalizar(texto).replace(/r\$\s*/g, '')
  // "junto com a entrega fica 35" é o total, não a taxa
  if (!/\b(entrega|taxa|frete)\b/.test(t) || /%|quanto|\bnao\b|entregamos de|horario de entrega|junto com|total/.test(t)) return null
  const num = '(\\d{1,3}(?:[.,]\\d{2})?)(?!\\s*(?:h\\b|hs|horas?|:|%|km|unidades|salgados|centos?))'
  const padroes = [
    new RegExp(`(?:entrega|taxa|frete)[^\\d?]{0,30}?(?:fica|sai|e|de|:)\\s*(?:em\\s*)?${num}`),
    new RegExp(`${num}\\s*(?:reais|conto)?\\s*(?:d[ae]|a|pra|para)\\s*(?:taxa|entrega|frete)`),
    new RegExp(`\\+\\s*${num}\\s*(?:reais)?\\s*(?:d[ae])?\\s*(?:taxa|entrega|frete)`),
  ]
  for (const re of padroes) {
    const m = t.match(re)
    if (m) {
      const v = Number(m[1].replace(',', '.'))
      if (v >= 2 && v <= 80) return v
    }
  }
  return null
}

function pagamentoDaMensagem(texto, tipo) {
  const t = normalizar(texto)
  if (tipo === 'documento' && /comprovante/.test(t)) return 'pix'
  if (/comprovante/.test(t)) return 'pix'
  const pix = /\bpix\b/.test(t)
  const dinheiro = /\b(dinheiro|especie|cash|na mao)\b/.test(t)
  const credito = /\bcredito\b/.test(t)
  const debito = /\bdebito\b/.test(t)
  const cartao = /\bcartao\b/.test(t)
  const quantos = [pix, dinheiro, credito || debito || cartao].filter(Boolean).length
  if (quantos !== 1) return null
  if (pix) return 'pix'
  if (dinheiro) return 'dinheiro'
  if (debito && !credito) return 'debito'
  return 'credito'
}

function tipoDaMensagem(texto, deMim) {
  const t = normalizar(texto)
    // "no dia da entrega eu pago", "eu busco na portaria", "taxa de entrega": não decidem
    .replace(/dia da entrega|data da entrega|taxa de entrega|valor da entrega|busco na portaria|desco (pra|para) pegar/g, ' ')
  const retirar = /\b(retir|buscar|busco|vou pegar|passo ai|passo la|vou ai|mando (um )?(uber|99|moto)|mandar (um )?(uber|99|moto)|peco (um )?(uber|99)|somente retirada|so retirada)/.test(t)
  const entregar = /\b(entrega|entregar|entregam|delivery|trazer|traz)\b/.test(t)
  if (retirar && entregar) return null
  if (deMim) {
    // a loja só decide quando fala de um jeito só e não está dizendo o que não faz
    if (/\bnao\b|\bou\b|domingo|horario de entrega|entregamos de/.test(t)) return null
    if (retirar) return 'retirada'
    if (/entregar aqui|vai ser (para |pra )?entreg|fica .* (da |de )?entrega|\+ ?\d+ ?(reais )?(da|de) entrega/.test(t)) return 'entrega'
    return null
  }
  if (retirar) return 'retirada'
  if (entregar) return 'entrega'
  return null
}

/** Divide `total` unidades entre os sabores, de 25 em 25, na ordem em que vieram. */
function dividirIgual(chaves, total) {
  const partes = Math.floor(total / 25)
  if (!chaves.length || partes < 1) return []
  const base = Math.floor(partes / chaves.length)
  let sobra = partes % chaves.length
  return chaves
    .map(chave => ({ chave, qtd: (base + (sobra-- > 0 ? 1 : 0)) * 25 }))
    .filter(s => s.qtd > 0)
}

/** 350 → [200, 100, 50]. Sobra de 25 fica de fora (vira dúvida). */
function pacotes(total) {
  const out = []
  let resto = total
  for (const t of [200, 100, 50]) while (resto >= t) { out.push(t); resto -= t }
  return { tamanhos: out, sobra: resto }
}

/**
 * @param msgs [{ de_mim, tipo, texto, transcricao, criada_em }] em qualquer ordem
 * @param produtos linhas de products (id, name, pack_size, flavor_group, fixed_flavor_id, active)
 * @param sabores linhas de flavors (id, name, group_slug, active)
 */
export function lerPedidoDoZap(msgs, produtos, sabores) {
  const ordenadas = [...(msgs ?? [])].sort((a, b) => new Date(a.criada_em) - new Date(b.criada_em))
  const duvidas = []
  const saborPorChave = new Map((sabores ?? []).map(s => [normalizar(s.name), s]))
  const achaSabor = (chave) => saborPorChave.get(chave.replace(/\?$/, '')) ?? null

  let selecao = null // [{chave, qtd}]
  let selecaoComNumero = false
  let total = null
  let congelado = null
  let data = null
  let hora = null
  let tipo = null
  let endereco = null
  let pagamento = null
  let troco = null
  let taxa = null
  let lojaMandouPix = false
  let combinouSinal = false
  let pagaTudo = false
  let comprovanteEm = null
  let lojaPerguntouHora = false
  let lojaPerguntouQuantos = false
  const datasCitadas = new Set()
  let grupoNumerado = false
  let lojaEscolhe = false
  let proposta = null
  let trocas = [] // quantidades dos sabores que a loja disse que não tem

  for (const m of ordenadas) {
    const texto = corpo(m)
    // foto/PDF sem legenda e a cobrança Pix do WhatsApp ('outro') não têm texto, mas contam para o pagamento
    if (!texto && !['imagem', 'documento', 'outro'].includes(m.tipo)) continue
    const t = normalizar(texto)

    const sabs = saboresDaMensagem(texto)
    const comNumero = sabs.filter(s => s.qtd != null)
    const todosComNumero = sabs.length > 0 && comNumero.length === sabs.length
    if (m.de_mim) {
      // "Só não temos a bombinha", "essa semana não vamos ter de pizza": sai da escolha, e o
      // próximo sabor que o cliente mandar entra no lugar
      if (sabs.length && selecao && /\bnao (temos|tem|vamos ter|teremos|tenho)\b|\bacabou\b|\bem falta\b/.test(t)) {
        const fora = new Set(sabs.map(s => s.chave))
        trocas.push(...selecao.filter(s => fora.has(s.chave)).map(s => s.qtd))
        selecao = selecao.filter(s => !fora.has(s.chave))
      } else if (todosComNumero && !/\?/.test(t)) {
        selecao = sabs; selecaoComNumero = true // resumo da loja: "25 coxinha / 25 queijo..."
      }
      // lista sem número mandada pela loja é o cardápio, não o pedido
      grupoNumerado = false
    } else if (/\b(sortid|variad|mistur|misto|tanto faz|voce escolhe|vcs escolhem|pode escolher|a gosto)/.test(t) && !/\?/.test(t) && !sabs.length) {
      // "Coloque 200 sortidos", "Quero desses variados": a loja escolhe os sabores
      selecao = null; selecaoComNumero = false; grupoNumerado = false; trocas = []
      lojaEscolhe = true
    } else if (sabs.length && !(/\?/.test(t) && !comNumero.length)) {
      lojaEscolhe = false
      if (todosComNumero) {
        // um sabor por mensagem, em sequência ("75 coxinha", "25 travesseiro"...): junta, e o
        // mesmo sabor de novo troca a quantidade dele
        if (grupoNumerado && selecaoComNumero && selecao) {
          const junto = [...selecao]
          for (const s of sabs) {
            const i = junto.findIndex(x => x.chave === s.chave)
            if (i >= 0) junto[i] = s
            else junto.push(s)
          }
          selecao = junto
        } else {
          selecao = sabs; selecaoComNumero = true
        }
        grupoNumerado = true
      } else if (comNumero.length === 0) {
        const novos = sabs.filter(s => !selecao?.some(x => x.chave === s.chave))
        if (trocas.length && selecao && novos.length) {
          // cada sabor novo herda a quantidade do que saiu
          selecao = [...selecao, ...novos.map((s, i) => ({ ...s, qtd: selecaoComNumero ? (trocas[i] ?? trocas[trocas.length - 1]) : null }))]
          trocas = trocas.slice(novos.length)
        } else if (selecao && /\bmais\b|adiciona/.test(normalizar(ordenadas.slice(-50).map(corpo).join(' '))) && total && !selecaoComNumero
          && novos.length === sabs.length) {
          // "Pois adiciona: Travesseiro, Bombinha" depois de "mais 50" soma aos que já tinha
          selecao = [...selecao, ...sabs.map(s => ({ ...s, adicional: true }))]
        } else if (sabs.length >= 2 || /\n/.test(texto) || !selecao) {
          selecao = sabs; selecaoComNumero = false; trocas = []
        }
        grupoNumerado = false
      } else {
        // parte com número, parte sem ("40 coxinha, bombinha"): fica como lista para conferir
        selecao = sabs.map(s => ({ ...s, qtd: s.qtd })); selecaoComNumero = false; grupoNumerado = false
      }
    }

    // "Daria certo segunda às 10h?" + "Pode ser": vale o que a loja propôs
    if (!m.de_mim && proposta && /^(sim|pode( ser)?|ok|okay|blz|beleza|fechado|perfeito|combinado|certo|isso|da sim|da certo|pode sim|bora|show|top|otimo)\b/.test(t.trim()) && t.length < 40) {
      if (proposta.data) { data = proposta.data; datasCitadas.add(proposta.data) }
      if (proposta.hora) hora = proposta.hora
    }
    proposta = null
    if (m.de_mim && !/\bnao\b/.test(t)) {
      const pd = dataDaMensagem(texto, m.criada_em)
      const ph = /\?|consigo|conseguimos|pode ser|daria/.test(t) ? horaDaMensagem(texto, false) : null
      if ((pd && /\?|consigo|conseguimos|pode ser|daria/.test(t)) || ph) proposta = { data: pd, hora: ph }
    }

    if (!m.de_mim) {
      // lista de sabores com número ("#200 de sertaneja / #100 de pizza"): o total é a soma, não a 1ª linha
      const q = comNumero.length >= 2 ? null : quantidadeTotal(texto, lojaPerguntouQuantos)
      if (q != null) {
        if (/\bmais\b|adicion|acrescent/.test(t) && total) total += q
        else if (!/\?$/.test(t.trim()) || !total) total = q
      }
      if (/\bcongelad/.test(t) && !/\?/.test(t)) congelado = true
      if (/\bfrit[oa]s?\b/.test(t)) congelado = false
      // data em pergunta, negação ou hipótese ("não tem como essa quarta?", "no caso seria dia 15")
      // não decide; data dita de vários jeitos vira dúvida para a atendente
      const duvidosa = /\?|\bnao\b|\bcaso\b|\bse (for|der)\b|\bpagar\b|\blevo\b/.test(t)
      const d = duvidosa ? null : dataDaMensagem(texto, m.criada_em)
      if (d) { data = d; datasCitadas.add(d) }
      const h = horaDaMensagem(texto, lojaPerguntouHora)
      if (h) hora = h
      const e = enderecoDaMensagem(texto)
      if (e) endereco = e
      const bairro = t.match(/\bbairro\s+(?:d[oa]s?\s+)?([a-z ]{3,30}?)(?:\?|$|,|\.)/)
      if (bairro && !endereco?.bairro) endereco = { ...(endereco ?? {}), bairro: texto.match(new RegExp(bairro[1], 'i'))?.[0] ?? bairro[1] }
      const tr = t.match(/troco\s+(?:pra|para|de)\s*(?:r\$\s*)?(\d{2,3})/)
      if (tr) troco = Number(tr[1])
    }
    if (m.de_mim) {
      const tx = taxaDaMensagem(texto)
      if (tx != null) taxa = tx
      // chave Pix mandada (CNPJ, "chave pix", cobrança do WhatsApp Business, que chega como 'outro')
      if (/68\.?484\.?975\/?0001-?76|chave pix|pix copia e cola/.test(t) || ['outro', 'pagamento'].includes(m.tipo)) lojaMandouPix = true
      if (/50 ?%|metade|sinal|entrada/.test(t) && !/\?/.test(t)) combinouSinal = true
    } else {
      // comprovante: PDF/foto com "comprovante" no nome, ou foto/PDF logo depois da chave Pix
      const ehArquivo = m.tipo === 'documento' || m.tipo === 'imagem'
      if ((ehArquivo && /comprovante|pix|transferencia|recibo/.test(t)) || (ehArquivo && lojaMandouPix)) comprovanteEm = m.criada_em
      if (/\b(paguei|ja paguei|pix feito|fiz o pix|transferi|ta pago|pago)\b/.test(t) && !/\?/.test(t)) comprovanteEm = comprovanteEm ?? m.criada_em
      if (/pagamento total|pagar (tudo|total|o total|completo)|pago completo|valor total|tudo de uma vez/.test(t)) pagaTudo = true
    }
    // botão de pagamento do WhatsApp: a cópia do painel grava tipo 'pagamento' ("Pagamento recebido")
    if (m.tipo === 'pagamento' && /recebido|enviado|pago|aprovado|conclu/.test(t)) comprovanteEm = m.criada_em
    const pg = m.de_mim ? null : pagamentoDaMensagem(texto, m.tipo)
    if (pg) pagamento = pg
    // a loja mandou a chave Pix (o CNPJ): sem outra forma combinada, é Pix
    if (m.de_mim && !pagamento && /68\.?484\.?975\/?0001-?76|chave pix/.test(t)) pagamento = 'pix'
    const tp = tipoDaMensagem(texto, m.de_mim)
    if (tp) tipo = tp

    lojaPerguntouHora = !!m.de_mim && /(que|qual)\s*(horas?|horario)|para quando|pra quando/.test(t)
    lojaPerguntouQuantos = !!m.de_mim && /quantos? centos?|quantas? unidades|quantos salgados/.test(t)
    // resumo da loja que afirma a quantidade ("Fica 55,69 os dois centos"); pergunta e promo não contam
    if (m.de_mim && /\bfica\b/.test(t) && !/\?|promo|por r\$/.test(t)) {
      const q = quantidadeTotal(texto)
      if (q != null) total = q
    }
  }

  if (!tipo && endereco?.rua) tipo = 'entrega'
  if (datasCitadas.size > 1) {
    const br = (iso) => iso.split('-').reverse().slice(0, 2).join('/')
    duvidas.push(`O cliente falou em mais de um dia (${[...datasCitadas].map(br).join(', ')}): confira o dia.`)
  }

  // ---- itens ----
  const itens = []
  const ativos = (produtos ?? []).filter(p => p.active !== false)
  const pacoteDe = (grupo, tamanho, gelado) => ativos.find(p =>
    p.flavor_group === grupo && Number(p.pack_size) === tamanho && !p.fixed_flavor_id
    && /congelad/i.test(p.name) === !!gelado)

  if (selecao?.some(s => /\?$/.test(s.chave))) duvidas.push('Cliente disse só "croquete": confira se é de queijo e presunto ou de calabresa.')

  const comSabor = (selecao ?? []).map(s => ({ ...s, sabor: achaSabor(s.chave) })).filter(s => s.sabor)
  const doces = comSabor.filter(s => s.sabor.group_slug === 'doces')
  const porGrupo = { salgados: comSabor.filter(s => s.sabor.group_slug === 'salgados'), pasteis: comSabor.filter(s => s.sabor.group_slug === 'pasteis') }

  // Doces vêm em pacote de sabor único
  for (const d of doces) {
    const tamanho = d.qtd ?? null
    const p = tamanho && ativos.find(x => x.fixed_flavor_id === d.sabor.id && Number(x.pack_size) === tamanho)
    if (p) itens.push({ produto_id: p.id, quantidade: 1, sabores: [], montar_sabores: false })
    else duvidas.push(`${d.sabor.name}: quantos? (vem em 50, 100 ou 200)`)
  }

  for (const [grupo, lista] of Object.entries(porGrupo)) {
    if (!lista.length) continue
    let comQtd = lista
    const soma = lista.reduce((t, s) => t + (s.qtd ?? 0), 0)
    let totalGrupo
    if (selecaoComNumero && soma > 0) {
      totalGrupo = soma
      const soSalgado = grupo === 'salgados' && !porGrupo.pasteis.length && !doces.length
      if (total && soSalgado && total !== soma) {
        const disse = lista.map(s => `${s.qtd} ${achaSabor(s.chave)?.name ?? s.chave}`).join(', ')
        if (soma < total) {
          // sabores incompletos: mantém o total que o cliente pediu e deixa os sabores para conferir
          duvidas.push(`O cliente pediu ${total}, mas os sabores somam ${soma} (${disse}). Complete os sabores.`)
          totalGrupo = total
          comQtd = []
        } else duvidas.push(`Os sabores somam ${soma}, mas o cliente falou em ${total}. Confira.`)
      }
    } else {
      totalGrupo = grupo === 'salgados' && porGrupo.pasteis.length ? null : total
      if (!totalGrupo) { duvidas.push(`Quantos ${grupo === 'pasteis' ? 'pastéis' : 'salgados'}? Não achei a quantidade.`); continue }
      // "mais 50" com sabores novos: os adicionais ficam com os 50 e o resto com os de antes
      const adicionais = lista.filter(s => s.adicional)
      if (adicionais.length && total > 50) {
        const extra = Math.min(50 * Math.ceil(adicionais.length / 2), totalGrupo - 25 * (lista.length - adicionais.length))
        comQtd = [...dividirIgual(lista.filter(s => !s.adicional).map(s => s.chave), totalGrupo - extra), ...dividirIgual(adicionais.map(s => s.chave), extra)]
      } else comQtd = dividirIgual(lista.map(s => s.chave), totalGrupo)
      comQtd = comQtd.map(s => ({ ...s, sabor: achaSabor(s.chave) }))
      if (lista.length > totalGrupo / 25) duvidas.push(`São ${lista.length} sabores para ${totalGrupo} unidades: não cabe 25 de cada.`)
    }
    if (comQtd.some(s => s.qtd % 25 !== 0)) duvidas.push('Algum sabor não está em múltiplo de 25. Confira.')

    const { tamanhos, sobra } = pacotes(totalGrupo)
    if (sobra) duvidas.push(`Sobram ${sobra} unidades fora dos pacotes (de 50, 100 e 200).`)
    // enche os pacotes, do maior para o menor, de 25 em 25, na ordem dos sabores
    const fila = comQtd.flatMap(s => Array.from({ length: Math.floor(s.qtd / 25) }, () => s.sabor))
    let i = 0
    for (const tamanho of tamanhos) {
      const p = pacoteDe(grupo, tamanho, grupo === 'salgados' && congelado)
      const pedaco = fila.slice(i, i + tamanho / 25)
      i += tamanho / 25
      if (!p) { duvidas.push(`Não achei o pacote de ${tamanho} ${grupo} no cardápio.`); continue }
      const conta = new Map()
      for (const s of pedaco) conta.set(s.id, { id: s.id, name: s.name, quantity: (conta.get(s.id)?.quantity ?? 0) + 25 })
      const sabs = [...conta.values()]
      const fecha = sabs.reduce((t, s) => t + s.quantity, 0) === tamanho
      itens.push({ produto_id: p.id, quantidade: 1, sabores: fecha ? sabs : [], montar_sabores: !fecha })
    }
  }

  if (!itens.length && total) {
    const { tamanhos } = pacotes(total)
    for (const tamanho of tamanhos) {
      const p = pacoteDe('salgados', tamanho, congelado)
      if (p) itens.push({ produto_id: p.id, quantidade: 1, sabores: [], montar_sabores: true })
    }
  }

  // Churros sem sabor dito: "Os churros é outro valor?" → loja "Churros o cento ta 48" → cliente
  // "Acrescente" (caso do pedido de 600 em 04/11). Entra o pacote que a loja cotou, com o sabor
  // citado na conversa ou doce de leite, e a dúvida para conferir.
  const falouChurros = ordenadas.findIndex(m => !m.de_mim && /\bchurros?\b/.test(normalizar(corpo(m))))
  if (falouChurros >= 0 && !doces.some(d => /churros/i.test(d.sabor.name))) {
    const depois = ordenadas.slice(falouChurros)
    const cotacao = depois.find(m => m.de_mim && /\bchurros?\b/.test(normalizar(corpo(m))) && /\d/.test(corpo(m)))
    const iCot = cotacao ? ordenadas.indexOf(cotacao) : -1
    const aceitou = iCot >= 0 && ordenadas.slice(iCot + 1, iCot + 6).some(m => !m.de_mim
      && /\b(acrescent|adicion|coloc|inclu|pode por|bota|manda tambem|quero (os |o )?churros|vou querer)/.test(normalizar(corpo(m))))
    if (aceitou) {
      const tc = normalizar(corpo(cotacao))
      const tamanho = /\b200\b|dois centos/.test(tc) ? 200 : /\b50\b|meio cento/.test(tc) ? 50 : 100
      const tudo = ordenadas.map(m => normalizar(corpo(m))).join(' ')
      const brigadeiro = /churros? (de |com )?brigadeiro/.test(tudo)
      const sabor = (sabores ?? []).find(x => normalizar(x.name) === (brigadeiro ? 'churros de brigadeiro' : 'churros de doce de leite'))
      const p = sabor && ativos.find(x => x.fixed_flavor_id === sabor.id && Number(x.pack_size) === tamanho)
      if (p) {
        itens.push({ produto_id: p.id, quantidade: 1, sabores: [], montar_sabores: false })
        duvidas.push(`Entrou ${p.name}: o cliente pediu churros${/churros? (de |com )?(doce de leite|brigadeiro)/.test(tudo) ? '' : ' sem dizer o sabor'}. Confira.`)
      } else duvidas.push('O cliente falou de churros: confira o sabor e a quantidade.')
    } else duvidas.push('O cliente falou de churros: confira se entra no pedido.')
  }

  // junta pacotes iguais com os mesmos sabores
  const juntos = []
  for (const it of itens) {
    const igual = juntos.find(j => j.produto_id === it.produto_id && JSON.stringify(j.sabores) === JSON.stringify(it.sabores) && !it.montar_sabores)
    if (igual) igual.quantidade += it.quantidade
    else juntos.push({ ...it })
  }

  if (lojaEscolhe) duvidas.push('O cliente deixou a loja escolher os sabores (sortidos).')
  if (comprovanteEm) {
    const h = new Date(comprovanteEm).toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' })
    duvidas.push(`O cliente mandou comprovante (ou disse que pagou) às ${h}: confira no banco antes de salvar como ${combinouSinal && !pagaTudo ? 'sinal' : 'pago'}.`)
  }

  const falaDeBebida = ordenadas.some(m => !m.de_mim && /\b(refri|refrigerante|coca|guarana|pepsi|fanta|sprite|suco|agua)\b/.test(normalizar(corpo(m))))
  if (falaDeBebida) duvidas.push('O cliente falou de bebida: confira se entra no pedido.')

  const faltando = []
  if (!juntos.length) faltando.push('itens')
  else if (juntos.some(i => i.montar_sabores)) faltando.push('sabores')
  if (!data) faltando.push('dia')
  if (!hora) faltando.push('horário')
  if (!tipo) faltando.push('entrega ou retirada')
  if (tipo === 'entrega' && !endereco?.rua) faltando.push('endereço')
  if (!pagamento) faltando.push('pagamento')

  return {
    tipo_entrega: tipo ?? 'indefinido',
    endereco: { rua: endereco?.rua ?? null, numero: endereco?.numero ?? null, bairro: endereco?.bairro ?? null, cep: endereco?.cep ?? null, complemento: endereco?.complemento ?? null },
    referencia: endereco?.referencia ?? null,
    data,
    hora,
    pagamento: pagamento ?? 'nao_informado',
    troco_para: troco,
    taxa_entrega: taxa,
    // 'pago' | 'sinal' | null: só com comprovante (ou "já paguei") na conversa; a atendente confere no banco
    pago: comprovanteEm ? (combinouSinal && !pagaTudo ? 'sinal' : 'pago') : null,
    comprovante_em: comprovanteEm,
    itens: juntos,
    observacoes: null,
    duvidas,
    faltando,
    pronto: juntos.length > 0 && faltando.length === 0,
  }
}

/**
 * Comprovante mandado DEPOIS de o pedido existir (04/11/2026): o Atendimento mostra a faixa
 * "Comprovante recebido para o #N" com "Recebi tudo" / "Foi o sinal". Comprovante = foto ou PDF
 * do cliente com cara de comprovante (nome) ou logo depois da chave/cobrança Pix, ou "paguei".
 *
 * @returns {{ id, em, como: 'foto'|'pdf'|'texto', cobrado: number|null } | null}
 */
export function comprovanteDoPedido(msgs, pedido) {
  if (!pedido || pedido.payment_status === 'pago') return null
  // um pouco antes de criar: a atendente às vezes lança depois de ver o comprovante chegar
  const desde = new Date(pedido.created_at).getTime() - 5 * 60 * 1000
  const sinalEm = pedido.sinal_em ? new Date(pedido.sinal_em).getTime() : 0
  const ordenadas = [...(msgs ?? [])].sort((a, b) => new Date(a.criada_em) - new Date(b.criada_em))
  let pixMandado = false
  let cobrado = null
  let achado = null
  for (const m of ordenadas) {
    const quando = new Date(m.criada_em).getTime()
    const t = normalizar(corpo(m))
    if (m.de_mim) {
      if (/68\.?484\.?975\/?0001-?76|chave pix|pix copia e cola|00020101/.test(t) || ['outro', 'pagamento'].includes(m.tipo)) pixMandado = true
      const v = m.tipo === 'pagamento' && t.match(/r\$\s*([\d.]+,\d{2})/)
      if (v && quando >= desde) cobrado = Number(v[1].replace(/\./g, '').replace(',', '.'))
      continue
    }
    // comprovante que já virou sinal registrado não conta de novo
    if (quando < desde || (sinalEm && quando <= sinalEm)) continue
    const arquivo = m.tipo === 'imagem' ? 'foto' : m.tipo === 'documento' ? 'pdf' : null
    if (arquivo && (/comprovante|pix|transferencia|recibo|pagamento/.test(t) || pixMandado)) achado = { id: m.id, em: m.criada_em, como: arquivo }
    else if (m.tipo === 'texto' && /\b(paguei|ja paguei|pix feito|fiz o pix|transferi|segue o comprovante|ta pago|pagamento feito)\b/.test(t) && !/\?/.test(t)) {
      achado = achado ?? { id: m.id, em: m.criada_em, como: 'texto' }
    }
  }
  return achado ? { ...achado, cobrado } : null
}
