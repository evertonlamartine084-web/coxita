/**
 * Escreve um HTML proprio para cada rota publica, no build.
 *
 * O site e uma SPA: o servidor entrega sempre o mesmo `index.html` e o
 * JavaScript troca o conteudo depois. Quem executa JavaScript nao percebe. Quem
 * nao executa ve 59 copias da home -- e essa lista inclui justamente quem mais
 * importa para um delivery:
 *
 *   - o crawler do WhatsApp, por onde o link mais circula. Sem isto, mandar
 *     /salgados-em-tirol no grupo da familia mostra o titulo da home.
 *   - Bing, e por tabela o Copilot.
 *   - GPTBot, PerplexityBot, ClaudeBot -- busca por IA nao renderiza pagina.
 *
 * O Google renderiza, mas numa fila separada que leva dias. Com o HTML pronto
 * ele indexa na primeira passada, sem fila.
 *
 * Por que sem navegador: renderizar as 59 rotas com Puppeteer significaria
 * baixar um Chromium a cada build na Vercel, por alguns segundos de HTML que
 * este arquivo produz em milissegundos. O que o crawler precisa -- titulo,
 * descricao, canonical, Open Graph, JSON-LD e o texto principal -- e
 * determinavel sem rodar React.
 *
 * A fonte dos titulos e `src/content/paginas.js`, o MESMO modulo que as paginas
 * React usam. Duas listas divergiriam no primeiro ajuste de copy, e a
 * divergencia seria invisivel: a tela certa, o link compartilhado errado.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { todasAsPaginas, SITE, tituloCompleto } from '../src/content/paginas.js'

const DIST = 'dist'
const MODELO = join(DIST, 'index.html')

function env(nome) {
  if (process.env[nome]) return process.env[nome]
  if (!existsSync('.env')) return undefined
  for (const linha of readFileSync('.env', 'utf8').split('\n')) {
    const i = linha.indexOf('=')
    if (i > 0 && linha.slice(0, i).trim() === nome) return linha.slice(i + 1).trim()
  }
  return undefined
}

/** Texto para dentro de um atributo HTML. Aspas soltas fechariam a tag. */
function attr(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Troca o valor de uma tag que ja existe no modelo, ou acrescenta a tag.
 *
 * O index.html ja traz o conjunto completo apontando para a home -- e por isso
 * que toda rota herdava o titulo dela. Aqui cada tag e reescrita para a rota,
 * em vez de duplicada: duas `<meta name="description">` no mesmo documento
 * deixam a escolha para o buscador, e ele costuma escolher a primeira.
 */
function trocarTag(html, seletor, atributo, valor) {
  const re = new RegExp(`(<(?:meta|link)[^>]*${seletor}[^>]*${atributo}=")([^"]*)(")`, 'i')
  if (re.test(html)) return html.replace(re, `$1${attr(valor)}$3`)
  return html
}

async function buscarSabores() {
  const url = env('VITE_SUPABASE_URL')
  const chave = env('VITE_SUPABASE_ANON_KEY')
  if (!url || !chave) return null
  const r = await fetch(
    `${url}/rest/v1/flavors?select=name,description,image_url,group_slug&active=eq.true&order=sort_order`,
    { headers: { apikey: chave, Authorization: `Bearer ${chave}` } },
  )
  if (!r.ok) throw new Error(`flavors respondeu ${r.status}`)
  return r.json()
}

try {
  if (!existsSync(MODELO)) {
    console.warn('[prerender] dist/index.html não existe; nada a fazer.')
    process.exit(0)
  }

  const sabores = await buscarSabores()
  if (!sabores) {
    console.warn('[prerender] credenciais do Supabase ausentes; as páginas de sabor ficam de fora.')
  }

  const modelo = readFileSync(MODELO, 'utf8')
  const paginas = todasAsPaginas(sabores ?? [])
  let escritas = 0

  for (const pagina of paginas) {
    // A home JA e o dist/index.html, com as tags certas. Reescrever seria
    // reescrever o modelo em cima dele mesmo.
    if (pagina.caminho === '/') continue

    const url = `${SITE}${pagina.caminho}`
    const titulo = tituloCompleto(pagina.titulo)

    let html = modelo
      .replace(/<title>[^<]*<\/title>/i, `<title>${attr(titulo)}</title>`)
    html = trocarTag(html, 'name="description"', 'content', pagina.descricao)
    html = trocarTag(html, 'rel="canonical"', 'href', url)
    html = trocarTag(html, 'property="og:url"', 'content', url)
    html = trocarTag(html, 'property="og:title"', 'content', titulo)
    html = trocarTag(html, 'property="og:description"', 'content', pagina.descricao)
    html = trocarTag(html, 'name="twitter:title"', 'content', titulo)
    html = trocarTag(html, 'name="twitter:description"', 'content', pagina.descricao)

    // O H1 no corpo: o crawler sem JavaScript recebia um <div id="root"> vazio,
    // que le como pagina sem conteudo. O React substitui isto ao montar --
    // `createRoot().render()` troca o conteudo do container, entao nao ha
    // hidratacao para descasar.
    html = html.replace(
      '<div id="root"></div>',
      `<div id="root"><h1>${attr(pagina.h1 ?? pagina.titulo)}</h1><p>${attr(pagina.descricao)}</p></div>`,
    )

    // dist/salgados-em-tirol/index.html -> servido em /salgados-em-tirol.
    // Na Vercel o filesystem e consultado ANTES dos rewrites do vercel.json,
    // entao estes arquivos vencem o `/(.*) -> /` que serve a SPA.
    const destino = join(DIST, pagina.caminho.replace(/^\//, ''), 'index.html')
    mkdirSync(dirname(destino), { recursive: true })
    writeFileSync(destino, html)
    escritas++
  }

  console.log(`[prerender] ${escritas} páginas com <head> próprio em ${DIST}/`)
} catch (erro) {
  // Build nao pode quebrar por causa de SEO: sem o prerender o site volta ao
  // comportamento de antes, que funcionava.
  console.warn('[prerender] pulando:', erro.message)
}
