/**
 * Embute o cardapio no HTML durante o build.
 *
 * O site e uma SPA: o HTML entregue tinha zero palavra de conteudo, e a primeira
 * coisa que o visitante via era "Carregando...". Quando os dados chegavam, a
 * pagina inteira se remontava e o rodape era atirado para baixo -- 0,70 de CLS
 * medido em celular lento, contra o limite de 0,1 do Google.
 *
 * Aqui as quatro leituras que a home e o cardapio fazem no boot viram um objeto
 * no proprio HTML. O app planta isso no cache antes do primeiro render (ver
 * main.jsx), entao a primeira pintura ja sai com cardapio em vez de spinner.
 *
 * Os dados sao um retrato do momento do build. Nao e problema: o app busca os
 * dados de verdade logo em seguida, como sempre fez, e corrige o que tiver
 * mudado. O retrato serve para os primeiros milissegundos.
 *
 * Se a busca falhar, o build segue sem o bloco -- o site volta ao comportamento
 * antigo, com spinner. Deploy nao pode quebrar por causa de otimizacao.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const SAIDA = 'dist/index.html'
const MARCA = '<!--dados-iniciais-->'

function env(nome) {
  if (process.env[nome]) return process.env[nome]
  // fallback para desenvolvimento, onde as variaveis vivem no .env
  if (!existsSync('.env')) return undefined
  for (const linha of readFileSync('.env', 'utf8').split('\n')) {
    const i = linha.indexOf('=')
    if (i > 0 && linha.slice(0, i).trim() === nome) return linha.slice(i + 1).trim()
  }
  return undefined
}

const URL_BASE = env('VITE_SUPABASE_URL')
const CHAVE = env('VITE_SUPABASE_ANON_KEY')

if (!URL_BASE || !CHAVE) {
  console.warn('[dados-iniciais] credenciais do Supabase ausentes; HTML fica sem o bloco.')
  process.exit(0)
}

async function buscar(caminho) {
  const r = await fetch(`${URL_BASE}/rest/v1/${caminho}`, {
    headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` },
  })
  if (!r.ok) throw new Error(`${caminho} respondeu ${r.status}`)
  return r.json()
}

try {
  // As mesmas consultas de products.js, categories.js, flavors.js e settings.js.
  // Divergir daqui geraria hidratacao com dados diferentes dos que o app espera.
  const [products, categories, flavors, settings] = await Promise.all([
    buscar('products?select=*,categories(name,slug),sabor_fixo:flavors!products_fixed_flavor_id_fkey(id,name)&active=eq.true&order=sort_order'),
    buscar('categories?select=*&active=eq.true&order=sort_order'),
    buscar('flavors?select=*&active=eq.true&order=sort_order'),
    buscar('settings?select=key,value'),
  ])

  const dados = {
    'products:ativos': products,
    'categories:ativas': categories,
    'flavors:ativos': flavors,
    settings: Object.fromEntries(settings.map(s => [s.key, s.value])),
  }

  const html = readFileSync(SAIDA, 'utf8')
  // </script> dentro de JSON fecharia a tag antes da hora e o resto viraria markup.
  const json = JSON.stringify(dados).replace(/</g, '\\u003c')
  const bloco = `${MARCA}<script>window.__COXELLI__=${json}</script>`

  writeFileSync(SAIDA, html.replace('</head>', `${bloco}</head>`))

  const kb = Math.round(json.length / 1024)
  console.log(
    `[dados-iniciais] ${products.length} produtos, ${flavors.length} sabores, ` +
    `${categories.length} categorias (${kb} KB) embutidos em ${SAIDA}`,
  )
} catch (erro) {
  console.warn('[dados-iniciais] pulando:', erro.message)
}
