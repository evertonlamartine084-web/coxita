import { create } from 'zustand'

const CHAVE_DISPENSA = 'coxelli:install-dispensado'
const CHAVE_INSTALADO = 'coxelli:app-instalado'
const SILENCIO_DIAS = 14

/**
 * Está rodando DENTRO do app instalado (e não numa aba do navegador)?
 *
 * Só os modos que o manifest pode produzir. `fullscreen` fica FORA de propósito: ele também
 * casa com um simples F11 no navegador, e aí um cliente que assistiu algo em tela cheia seria
 * marcado como quem já instalou — nunca mais veria o convite. O manifest pede `standalone`,
 * então o app instalado nunca abre em fullscreen; `minimal-ui` fica porque alguns navegadores
 * rebaixam standalone para ele.
 */
export function abertoComoApp() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.navigator.standalone === true // iOS
  )
}

/** Já instalou alguma vez, mesmo estando agora numa aba comum do navegador. */
function instaladoAntes() {
  try {
    return localStorage.getItem(CHAVE_INSTALADO) === '1'
  } catch {
    return false
  }
}

function lembrarInstalado() {
  try {
    localStorage.setItem(CHAVE_INSTALADO, '1')
  } catch {
    // storage bloqueado: perde a memória entre visitas, mas display-mode ainda cobre o caso
  }
}

function dispensadoRecentemente() {
  try {
    const quando = Number(localStorage.getItem(CHAVE_DISPENSA))
    return quando ? Date.now() - quando < SILENCIO_DIAS * 864e5 : false
  } catch {
    return false // storage bloqueado: oferece normalmente
  }
}

function ehIOS() {
  if (typeof navigator === 'undefined') return false
  // Chrome e Firefox no iOS não instalam PWA; só o Safari, e só pelo menu Compartilhar
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent)
}

/**
 * Estado único do convite de instalação, consumido pela barra do topo e pelo popup.
 *
 * Os dois precisam do MESMO `beforeinstallprompt`: o navegador dispara o evento uma vez e ele
 * só pode ser consumido uma vez. Dois componentes com listener próprio brigariam pelo evento e
 * dispensar um não silenciaria o outro.
 */
export const useInstallStore = create((set, get) => ({
  evento: null,
  ios: ehIOS(),
  // instalado começa com o que dá pra saber de imediato; a checagem assíncrona refina depois
  instalado: abertoComoApp() || instaladoAntes(),
  dispensado: dispensadoRecentemente(),
  barraNaTela: false, // o popup espera a barra sair de vista pra não empilhar convite

  capturar: (e) => set({ evento: e }),
  setBarraNaTela: (v) => set({ barraNaTela: v }),

  marcarInstalado: () => {
    lembrarInstalado()
    set({ instalado: true, evento: null })
  },

  dispensar: () => {
    try {
      localStorage.setItem(CHAVE_DISPENSA, String(Date.now()))
    } catch {
      // storage bloqueado: some nesta sessão e volta na próxima, tudo bem
    }
    set({ dispensado: true })
  },

  instalar: async () => {
    const { evento } = get()
    if (!evento) return
    evento.prompt()
    const escolha = await evento.userChoice // recusar também consome o evento; não dá pra reusar
    set({ evento: null })
    if (escolha?.outcome === 'accepted') get().marcarInstalado()
  },

  /**
   * Confirma com o navegador se o app já está na casa da pessoa.
   *
   * `getInstalledRelatedApps()` responde isso no Chrome do Android mesmo com o site aberto numa
   * aba comum — é o único jeito de saber que já instalou quando o localStorage foi limpo ou o
   * acesso veio de outro navegador. Exige o `related_applications` declarado no manifest.
   */
  conferirInstalado: async () => {
    if (get().instalado) return
    if (!navigator.getInstalledRelatedApps) return
    try {
      const apps = await navigator.getInstalledRelatedApps()
      if (apps.length > 0) get().marcarInstalado()
    } catch {
      // API indisponível ou bloqueada: seguimos com display-mode + localStorage
    }
  },
}))
