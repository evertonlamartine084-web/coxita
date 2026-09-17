/**
 * Modo "voltamos ja": troca o site inteiro por um aviso, sem tirar nada do ar.
 *
 * Liga e desliga pela variavel EM_BREVE na Vercel (ver AMBIENTES.md). Sem ela,
 * este arquivo deixa tudo passar -- e o que mantem homolog e as previews com o
 * site completo enquanto producao esta pausada.
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
  if (!process.env.EM_BREVE) return

  const url = new URL(request.url)
  if (passaDireto(url.pathname)) return

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
