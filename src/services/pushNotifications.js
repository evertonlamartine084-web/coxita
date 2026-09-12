import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/** As chaves vêm como ArrayBuffer; compara byte a byte. */
function mesmaChave(a, b) {
  if (!a || !b) return false
  const x = new Uint8Array(a)
  const y = new Uint8Array(b)
  if (x.length !== y.length) return false
  return x.every((v, i) => v === y[i])
}

export async function registerPushSubscription(orderNumber) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { supported: false }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { supported: true, granted: false }
  }

  const registration = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready

  const chaveAtual = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  let subscription = await registration.pushManager.getSubscription()

  // Uma assinatura fica presa à chave VAPID com que foi criada. Se a chave do servidor mudou,
  // o push passa a ser recusado (403 no FCM) e reaproveitar a assinatura antiga nunca conserta
  // — o cliente ficaria sem notificação para sempre, sem nenhum aviso. Aqui a gente detecta e
  // refaz.
  if (subscription && !mesmaChave(subscription.options?.applicationServerKey, chaveAtual)) {
    try {
      await subscription.unsubscribe()
    } catch {
      // se não desinscrever, o subscribe abaixo falha e cai no catch de quem chamou
    }
    subscription = null
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: chaveAtual,
    })
  }

  const subJson = subscription.toJSON()

  // Save to Supabase
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({
      endpoint: subJson.endpoint,
      keys_p256dh: subJson.keys.p256dh,
      keys_auth: subJson.keys.auth,
      order_number: parseInt(orderNumber),
    }, { onConflict: 'endpoint,order_number' })

  if (error) {
    console.error('Error saving push subscription:', error)
    // Try insert instead of upsert as fallback
    const { error: insertError } = await supabase
      .from('push_subscriptions')
      .insert({
        endpoint: subJson.endpoint,
        keys_p256dh: subJson.keys.p256dh,
        keys_auth: subJson.keys.auth,
        order_number: parseInt(orderNumber),
      })
    if (insertError) console.error('Insert fallback also failed:', insertError)
  }

  return { supported: true, granted: true, subscription }
}
