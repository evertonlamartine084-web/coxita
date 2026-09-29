/**
 * Escreve dist/admin/index.html: o mesmo app, com o <head> do painel.
 *
 * O Safari do iPhone lê o manifesto e o apple-touch-icon assim que a página abre, antes do
 * JavaScript. Com o index.html da loja, o "Adicionar à Tela de Início" no painel criava o app
 * dos clientes (abria na home). Com este HTML, servido em toda rota /admin (ver vercel.json),
 * o painel já nasce com o manifesto, o ícone e o nome dele. O useAppDoPainel continua trocando o
 * <head> para quem chega ao painel navegando dentro do SPA.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'

const MODELO = 'dist/index.html'
if (!existsSync(MODELO)) {
  console.warn('[painel-html] dist/index.html não existe; nada a fazer.')
  process.exit(0)
}

let html = readFileSync(MODELO, 'utf8')
const trocar = (de, para) => {
  const antes = html
  html = html.replace(de, para)
  if (html === antes) throw new Error(`[painel-html] não achei ${de} no index.html`)
}

trocar(/<title>[^<]*<\/title>/, '<title>Coxelli Painel</title>')
trocar(/<meta name="theme-color" content="[^"]*"/, '<meta name="theme-color" content="#5d2b04"')
trocar(/<link rel="manifest" href="[^"]*"/, '<link rel="manifest" href="/painel.webmanifest"')
trocar(/<meta name="apple-mobile-web-app-title" content="[^"]*"/, '<meta name="apple-mobile-web-app-title" content="Painel"')
html = html.replace(/<link rel="apple-touch-icon"([^>]*?)href="[^"]*"/g, '<link rel="apple-touch-icon"$1href="/painel-apple-180.png"')
// o painel não tem nada para buscador
html = html.replace('</head>', '    <meta name="robots" content="noindex, nofollow" />\n  </head>')

mkdirSync('dist/admin', { recursive: true })
writeFileSync('dist/admin/index.html', html)
console.log('[painel-html] dist/admin/index.html')
