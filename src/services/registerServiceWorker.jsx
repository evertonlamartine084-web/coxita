import toast from 'react-hot-toast'

/**
 * Registra o /sw.js no boot, para o app abrir offline e ser instalável.
 *
 * O push já registrava o mesmo arquivo (ver pushNotifications.js), mas só depois que o cliente
 * aceitava notificação — quem nunca aceitou nunca teve service worker, e sem service worker
 * ativo o navegador não oferece instalação. Registrar aqui não conflita: mesma URL e mesmo
 * escopo devolvem o registro que já existe.
 */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  if (import.meta.env.DEV) return // em dev o SW serviria bundle velho a cada reload

  // Só recarrega quando a atualização foi PEDIDA pela pessoa (botão do toast).
  //
  // Reagir a todo `controllerchange` recarregava a primeira visita inteira: o SW novo chama
  // clients.claim() no activate, isso troca o controller da aba que está aberta, e a página
  // recarregava sozinha na cara de quem tinha acabado de chegar.
  let pediuAtualizar = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!pediuAtualizar) return
    pediuAtualizar = false
    window.location.reload()
  })
  const aoPedirAtualizacao = () => {
    pediuAtualizar = true
  }

  window.addEventListener('load', async () => {
    let registration
    try {
      registration = await navigator.serviceWorker.register('/sw.js')
    } catch {
      return // sem service worker o site funciona igual, só perde offline e instalação
    }

    registration.addEventListener('updatefound', () => {
      const novo = registration.installing
      if (!novo) return

      novo.addEventListener('statechange', () => {
        // 'installed' com controller já ativo = é atualização, não primeira visita
        if (novo.state !== 'installed' || !navigator.serviceWorker.controller) return
        avisarAtualizacao(novo, aoPedirAtualizacao)
      })
    })
  })
}

function avisarAtualizacao(worker, aoPedir) {
  toast.custom(
    (t) => (
      <div
        className={`flex items-center gap-3 rounded-xl bg-surface px-4 py-3 shadow-lg ring-1 ring-border transition-all duration-200 ${
          t.visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
        }`}
      >
        <span className="text-sm text-text">Nova versão do Coxelli disponível.</span>
        <button
          type="button"
          onClick={() => {
            aoPedir()
            worker.postMessage('SKIP_WAITING')
            toast.dismiss(t.id)
          }}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          Atualizar
        </button>
      </div>
    ),
    { duration: 15000 }
  )
}
