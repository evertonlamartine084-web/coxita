/**
 * setInterval que tambem roda na hora em que a janela volta para a tela ou a
 * internet volta. Com a janela minimizada o Chrome freia os timers (uma volta
 * por minuto, ou nenhuma se a pagina for congelada) -- sem isto, o pedido que
 * chegou nesse meio-tempo so aparecia, imprimia e ia para o grupo na volta
 * seguinte. Devolve a funcao que desliga tudo, pronta para o useEffect.
 */
export function aCada(fn, ms) {
  const intervalo = setInterval(fn, ms)
  const aoVoltar = () => { if (document.visibilityState === 'visible') fn() }
  document.addEventListener('visibilitychange', aoVoltar)
  window.addEventListener('online', fn)
  // Pagina descongelada pelo Chrome (Page Lifecycle): os timers voltam sem aviso.
  document.addEventListener('resume', fn)
  return () => {
    clearInterval(intervalo)
    document.removeEventListener('visibilitychange', aoVoltar)
    window.removeEventListener('online', fn)
    document.removeEventListener('resume', fn)
  }
}
