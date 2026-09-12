/**
 * Gera o sitemap no build, a partir do banco.
 *
 * O `public/sitemap.xml` escrito a mao listava duas URLs e envelheceu no
 * primeiro sabor novo: cadastrar sabor no admin passou a criar uma pagina que o
 * sitemap nao anuncia. Sitemap desatualizado e pior que sitemap nenhum -- o
 * Google usa a lista como sinal do que o dono considera importante, e o que
 * ficou de fora entra na fila de tras.
 *
 * O arquivo estatico continua em public/ de proposito: se a busca falhar, o
 * build segue e o sitemap antigo (duas URLs certas) prevalece. Deploy nao pode
 * quebrar por causa de SEO, e sitemap velho ainda e melhor que 404 no lugar
 * dele.
 *
 * Roda depois do `vite build`, sobre o dist. Ver package.json.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { slugify } from '../src/utils/slug.js'
import { LISTA_OCASIOES } from '../src/content/ocasioes.js'

const SITE = 'https://coxelli.com.br'
const SAIDA = 'dist/sitemap.xml'

function env(nome) {
  if (process.env[nome]) return process.env[nome]
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
  console.warn('[sitemap] credenciais do Supabase ausentes; mantendo o sitemap estático.')
  process.exit(0)
}

const hoje = new Date().toISOString().slice(0, 10)

/**
 * `changefreq` e `priority` sao dicas fracas -- o Google diz que praticamente
 * as ignora. Ficam porque o Bing ainda le, e custam um atributo.
 */
function url({ loc, prioridade, frequencia = 'weekly', modificado = hoje }) {
  return [
    '  <url>',
    `    <loc>${SITE}${loc}</loc>`,
    `    <lastmod>${modificado}</lastmod>`,
    `    <changefreq>${frequencia}</changefreq>`,
    `    <priority>${prioridade}</priority>`,
    '  </url>',
  ].join('\n')
}

try {
  const resposta = await fetch(
    `${URL_BASE}/rest/v1/flavors?select=name,updated_at&active=eq.true&order=sort_order`,
    { headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` } },
  )
  if (!resposta.ok) throw new Error(`flavors respondeu ${resposta.status}`)
  const sabores = await resposta.json()

  const entradas = [
    url({ loc: '/', prioridade: '1.0' }),
    url({ loc: '/cardapio', prioridade: '0.9' }),
    url({ loc: '/salgados', prioridade: '0.9' }),
    ...LISTA_OCASIOES.map(o => url({ loc: `/${o.slug}`, prioridade: '0.8', frequencia: 'monthly' })),
    // `updated_at` do proprio sabor: mudar a descricao no admin avisa o
    // buscador de que aquela pagina mudou, em vez de carimbar tudo com a data
    // do deploy e pedir recrawl do site inteiro a cada build.
    ...sabores.map(s => url({
      loc: `/salgados/${slugify(s.name)}`,
      prioridade: '0.7',
      frequencia: 'monthly',
      modificado: (s.updated_at ?? '').slice(0, 10) || hoje,
    })),
  ]

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- Gerado no build por scripts/sitemap.mjs. Nao editar a mao. -->',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entradas,
    '</urlset>',
    '',
  ].join('\n')

  writeFileSync(SAIDA, xml)
  console.log(`[sitemap] ${entradas.length} URLs em ${SAIDA} (${sabores.length} sabores)`)
} catch (erro) {
  console.warn('[sitemap] pulando:', erro.message)
}
