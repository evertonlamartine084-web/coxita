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

  let subscription = await registration.pushManager.getSubscription()

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
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
      order_number: orderNumber,
    }, { onConflict: 'endpoint,order_number' })

  if (error) console.error('Error saving push subscription:', error)

  return { supported: true, granted: true, subscription }
}
