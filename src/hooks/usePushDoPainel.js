import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../services/supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function chaveVapid(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const bruto = window.atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bruto, c => c.charCodeAt(0))
}

const ehIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
const instalado = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true

/**
 * Notificação de pedido novo neste aparelho (app do painel).
 *
 * No iPhone o push só existe dentro do app instalado na Tela de Início (iOS 16.4+), e a
 * permissão só pode ser pedida num toque — por isso é um botão, não um pedido automático.
 * O envio é da função avisar-painel, disparada pelo banco a cada pedido do site.
 *
 * estado: 'carregando' | 'ativo' | 'desligado' | 'bloqueado' | 'abrir-app' | 'sem-suporte'
 */
export function usePushDoPainel() {
  const [estado, setEstado] = useState('carregando')

  const conferir = useCallback(async () => {
    if (ehIphone() && !instalado()) return setEstado('abrir-app')
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID_PUBLIC_KEY) return setEstado('sem-suporte')
    if (Notification.permission === 'denied') return setEstado('bloqueado')
    const reg = await navigator.serviceWorker.getRegistration('/')
    const sub = await reg?.pushManager.getSubscription()
    if (!sub || Notification.permission !== 'granted') return setEstado('desligado')
    // confere se o banco ainda tem este aparelho (a função apaga os que deram erro)
    const { data } = await supabase.from('painel_push').select('id').eq('endpoint', sub.endpoint).maybeSingle()
    setEstado(data ? 'ativo' : 'desligado')
  }, [])

  useEffect(() => { conferir().catch(() => setEstado('sem-suporte')) }, [conferir])

  const ativar = useCallback(async () => {
    try {
      const permissao = await Notification.requestPermission()
      if (permissao !== 'granted') return setEstado(permissao === 'denied' ? 'bloqueado' : 'desligado')
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const chave = chaveVapid(VAPID_PUBLIC_KEY)
      let sub = await reg.pushManager.getSubscription()
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave })
      const j = sub.toJSON()
      const { error } = await supabase.from('painel_push').upsert({
        endpoint: j.endpoint,
        p256dh: j.keys.p256dh,
        auth: j.keys.auth,
        aparelho: navigator.userAgent.slice(0, 200),
      }, { onConflict: 'endpoint' })
      if (error) throw error
      setEstado('ativo')
      return true
    } catch (e) {
      console.error('Não foi possível ativar as notificações:', e)
      setEstado('desligado')
      throw e
    }
  }, [])

  return { estado, ativar }
}
