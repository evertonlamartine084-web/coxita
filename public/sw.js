/* global clients */
// Service Worker do Coxelli: Web Push (já existia) + cache offline do app shell.
//
// O Vite versiona os assets no nome do arquivo (/assets/index-ByQW8mLh.js), então eles são
// imutáveis e podem ser servidos do cache sem revalidar. O HTML não é versionado e precisa vir
// da rede sempre que der — daí as duas estratégias diferentes abaixo.
//
// Ao mexer em qualquer coisa deste arquivo, suba a VERSION: é ela que descarta os caches velhos.

const VERSION = 'v6'
const SHELL_CACHE = `coxelli-shell-${VERSION}`
const ASSET_CACHE = `coxelli-assets-${VERSION}`

// só o que tem nome estável entra aqui; os assets com hash entram sozinhos, em runtime
const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/logo-192.png',
  '/logo-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // addAll é tudo-ou-nada: um 404 em qualquer item aborta a instalação inteira
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          // Apaga TUDO que não é o cache atual, não só o que começa com 'coxelli-'.
          // O projeto já rodou um service worker de workbox, e os caches dele
          // (workbox-precache, static-resources, google-fonts-webfonts…) continuavam no
          // aparelho de quem visitou naquela época, servindo arquivos de uma versão que não
          // existe mais. Um filtro por prefixo nosso nunca os alcançaria.
          .filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  )
})

// o SW novo fica esperando até a página mandar atualizar (ver registerServiceWorker.js).
// Trocar sozinho no meio da navegação serviria HTML novo com assets antigos já carregados.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

function isAsset(url) {
  // O iOS busca o apple-touch-icon no instante em que a pessoa toca em "Adicionar à Tela de
  // Início". Se essa busca passar pelo service worker e ele responder do cache (ou falhar), o
  // Safari desiste e desenha a inicial do título — o ícone virava um "C". Deixa passar direto.
  if (url.pathname.startsWith('/apple-touch-icon')) return false
  return url.pathname.startsWith('/assets/') || /\.(png|jpe?g|svg|webp|avif|woff2?)$/i.test(url.pathname)
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Supabase, fontes do Google, qualquer outra origem: passa direto.
  // Cachear resposta de API serviria pedido e cardápio desatualizados — pior que não abrir.
  if (url.origin !== self.location.origin) return

  // Navegação (qualquer rota do SPA): rede primeiro, cache como rede de segurança.
  // Sem isso, abrir /cardapio offline dá erro do navegador em vez da tela do app.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Só entra no cache o que veio bem. Durante uma manutenção o servidor
          // responde 503 com a página de aviso (ver middleware.js na raiz);
          // guardar isso como '/' deixaria o aviso preso no aparelho de quem
          // instalou o app, ainda aparecendo depois que o site voltasse.
          if (res.ok) {
            const copy = res.clone()
            caches.open(SHELL_CACHE).then((c) => c.put('/', copy))
          }
          return res
        })
        .catch(() => caches.match('/', { cacheName: SHELL_CACHE }).then((r) => r || caches.match('/')))
    )
    return
  }

  // Assets com hash no nome: cache primeiro, rede só na primeira vez.
  if (isAsset(url)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        // `res.ok` não basta. O vercel.json reescreve tudo que não é arquivo para "/", então um
        // asset pedido no meio de um deploy (ainda não publicado) volta como o index.html —
        // com status 200. Guardar isso envenena o cache: como assets são cache-first, o
        // navegador passa a receber HTML no lugar do JavaScript para sempre, e o app não abre
        // mais naquele aparelho. Só entra no cache o que veio com o tipo certo.
        const tipo = res.headers.get('content-type') || ''
        const respostaDeFallback = tipo.includes('text/html')
        if (res.ok && !respostaDeFallback) {
          const copy = res.clone()
          caches.open(ASSET_CACHE).then((c) => c.put(request, copy))
        }
        return res
      }))
    )
  }
})

// ─── Web Push ────────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let data = { title: 'Coxelli', body: 'Novidade no seu pedido!' }

  if (event.data) {
    try {
      data = event.data.json()
    } catch {
      data.body = event.data.text()
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/logo-192.png',
      badge: '/logo-192.png',
      tag: 'coxelli-' + (data.url || 'general'),
      renotify: true,
      requireInteraction: false,
      silent: false,
      data: data.url || '/',
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})
