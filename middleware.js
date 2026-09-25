/* global process -- roda no servidor da Vercel, onde as variaveis de ambiente existem */
/**
 * Modo "voltamos ja": troca o site inteiro por um aviso, sem tirar nada do ar.
 *
 * Liga e desliga pelo botao do painel (configuracao `site_em_manutencao` no
 * banco), sem deploy. A variavel EM_BREVE na Vercel continua valendo como
 * interruptor de emergencia: com ela, o site fica em manutencao seja qual for o
 * botao (ver AMBIENTES.md).
 *
 * O botao so vale para coxelli.com.br: homolog e as previews usam o mesmo
 * banco e continuam com o site completo, para a loja poder testar.
 *
 * Por que middleware e nao um rewrite no vercel.json: as 59 paginas publicas
 * sao arquivos de verdade no dist (dist/cardapio/index.html e companhia), e
 * rewrite so pega caminho que nao casa com arquivo -- /cardapio continuaria
 * abrindo o site normalmente. Middleware roda antes do filesystem, entao pega
 * todas.
 *
 * Por que 503 e nao 200: 503 significa "indisponivel agora, volta". O Google
 * segura a pagina no indice esperando ela voltar; 200 num aviso de pausa faz
 * ele trocar o conteudo indexado das 59 paginas por "voltamos ja" e, quando o
 * site voltar, a posicao tem de ser reconquistada do zero.
 *
 * O que continua respondendo normal, mesmo com o modo ligado:
 *   - /admin (a loja precisa ser tocada por tras: pedidos, estoque, cardapio);
 *   - assets, fotos e icones, senao a propria pagina de aviso abre quebrada;
 *   - robots.txt e sitemap.xml -- 503 no robots.txt faz o Google parar de
 *     rastrear o site inteiro, o oposto do que se quer aqui;
 *   - o arquivo de verificacao do Search Console, que precisa continuar 200
 *     para a propriedade nao cair.
 */

const PAGINA = '/em-breve.html'

const DOMINIOS_DE_PRODUCAO = ['coxelli.com.br', 'www.coxelli.com.br']

// Quanto tempo o valor lido do banco vale. Ler a cada visita somaria a ida ao
// banco a toda pagina; 15 s e o atraso maximo entre apertar o botao e o site
// obedecer.
const VALIDADE_MS = 15_000
let lido = { valor: false, ate: 0 }

/**
 * Se o botao do painel esta em "manutencao".
 *
 * Falha na leitura mantem o ultimo valor conhecido -- e, sem nenhum, o site no
 * ar: derrubar a loja porque o banco demorou seria pior que o problema.
 */
async function botaoEmManutencao() {
  if (Date.now() < lido.ate) return lido.valor
  const base = process.env.VITE_SUPABASE_URL
  const chave = process.env.VITE_SUPABASE_ANON_KEY
  if (!base || !chave) return false
  try {
    const r = await fetch(`${base}/rest/v1/settings?key=eq.site_em_manutencao&select=value`, {
      headers: { apikey: chave, authorization: `Bearer ${chave}` },
      signal: AbortSignal.timeout(1500),
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const linhas = await r.json()
    lido = { valor: linhas?.[0]?.value === 'sim', ate: Date.now() + VALIDADE_MS }
  } catch {
    lido = { valor: lido.valor, ate: Date.now() + VALIDADE_MS }
  }
  return lido.valor
}

// Uma hora. O valor e um palpite de quando vale a pena o bot voltar; nao e
// promessa. Curto demais desperdicaria rastreio, longo demais atrasaria a volta
// do site ao indice.
const SEGUNDOS_PARA_VOLTAR = 3600

function passaDireto(pathname) {
  if (pathname === PAGINA) return true
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return true

  // Arquivo com extensao e asset (js, css, png, webmanifest...). HTML fica de
  // fora de proposito: /index.html serve o app inteiro e o SPA navegaria o site
  // todo pelo cliente a partir dele.
  if (/\.[a-z0-9]+$/i.test(pathname) && !pathname.endsWith('.html')) return true

  // googlexxxx.html: verificacao do Search Console.
  if (/^\/google[0-9a-f]+\.html$/i.test(pathname)) return true

  return false
}

export default async function middleware(request) {
  const url = new URL(request.url)
  if (passaDireto(url.pathname)) return

  const emManutencao = process.env.EM_BREVE
    || (DOMINIOS_DE_PRODUCAO.includes(url.hostname) && await botaoEmManutencao())
  if (!emManutencao) return

  const cabecalhos = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'retry-after': String(SEGUNDOS_PARA_VOLTAR),
    'x-robots-tag': 'noindex, nofollow',
  }

  try {
    const pagina = await fetch(new URL(PAGINA, url.origin))
    return new Response(await pagina.text(), { status: 503, headers: cabecalhos })
  } catch {
    // A pagina e um arquivo do proprio deploy; se nem ela responde, o aviso
    // ainda tem de sair -- um 503 branco e melhor que um erro de plataforma.
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Voltamos já</title>' +
      '<p>Estamos ajeitando o site. Encomendas pelo WhatsApp (84) 99616-9478.',
      { status: 503, headers: cabecalhos }
    )
  }
}

export const config = {
  // Assets e fotos nem chegam a invocar a funcao. O resto e decidido em
  // passaDireto(), onde da para ler a regra.
  matcher: ['/((?!assets/|fotos/|_vercel/).*)'],
}
