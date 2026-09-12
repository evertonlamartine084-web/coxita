import { supabase } from './supabase'
import { abertoComoApp } from '../store/installStore'

const CHAVE_DEVICE = 'coxelli:device-id'

/** Identificador do aparelho, criado na primeira visita e guardado no navegador. */
function deviceId() {
  try {
    let id = localStorage.getItem(CHAVE_DEVICE)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(CHAVE_DEVICE, id)
    }
    return id
  } catch {
    return null // storage bloqueado: sem id estável, contar geraria uma linha por visita
  }
}

function plataforma() {
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  return 'desktop'
}

/**
 * Manda a presença deste aparelho para o painel.
 *
 * Passa pela função `registrar_app_install` em vez de escrever na tabela: com update aberto por
 * RLS, qualquer visitante poderia reescrever a linha de outro aparelho. A função também resolve
 * o `installed_at` com coalesce, para o primeiro carimbo não ser empurrado a cada reabertura.
 */
async function registrar({ instalou = false, usandoApp = false }) {
  const id = deviceId()
  if (!id) return

  const { error } = await supabase.rpc('registrar_app_install', {
    p_device_id: id,
    p_platform: plataforma(),
    p_instalou: instalou,
    p_usando_app: usandoApp,
  })
  if (error) console.error('Erro ao registrar instalação do app:', error)
}

/** Chamado no evento `appinstalled`. */
export function registrarInstalacao() {
  return registrar({ instalou: true })
}

/**
 * Chamado no boot, quando o site abre DENTRO do app instalado.
 *
 * É o que sustenta o número de "ativos": a web não avisa quando desinstalam, então quem some
 * simplesmente para de mandar sinal e sai da conta de 30 dias sozinho. Também recupera quem
 * instalou pelo menu do navegador, caso em que `appinstalled` nunca dispara.
 */
export function registrarUsoDoApp() {
  if (!abertoComoApp()) return Promise.resolve()
  return registrar({ usandoApp: true })
}

/** Números agregados para o painel. A função SQL é a única com leitura da tabela. */
export async function getAppInstallStats() {
  const { data, error } = await supabase.rpc('app_install_stats')
  if (error) throw error
  return data?.[0] ?? { instalados: 0, ativos_30d: 0, ativos_7d: 0, novos_30d: 0, novos_7d: 0 }
}
