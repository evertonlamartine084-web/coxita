// Service Worker for Web Push Notifications

self.addEventListener('push', (event) => {
  let data = { title: 'Coxita', body: 'Novidade no seu pedido!' }

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
      tag: 'coxita-' + (data.url || 'general'),
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
