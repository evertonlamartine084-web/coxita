/**
 * Instrução de instalação para quando NÃO há `beforeinstallprompt` guardado.
 *
 * Depender só do evento deixa muita gente sem convite nenhum: o Chrome exige engajamento antes
 * de dispará-lo, o Safari nunca dispara, e navegador nenhum o repete depois de consumido.
 * Nesses casos ainda dá pra instalar — só que pelo menu do navegador, e é isso que explicamos.
 */
export function comoInstalar() {
  if (typeof navigator === 'undefined') return null

  const ua = navigator.userAgent
  const ios = /iphone|ipad|ipod/i.test(ua)
  const android = /android/i.test(ua)

  if (ios) {
    // no iOS só o Safari instala; os outros usam o motor dele, mas sem a opção no menu
    if (/crios|fxios|edgios|opt\//i.test(ua)) {
      return {
        curto: 'Abra no Safari',
        longo: 'No iPhone a instalação só funciona pelo Safari. Abra o coxelli.com.br lá.',
      }
    }
    return {
      curto: 'Como instalar',
      longo: 'Toque no botão Compartilhar do Safari e escolha "Adicionar à Tela de Início".',
    }
  }

  if (android) {
    return {
      curto: 'Como instalar',
      longo: 'Toque no menu ⋮ do navegador e escolha "Instalar aplicativo".',
    }
  }

  return {
    curto: 'Como instalar',
    longo: 'Clique no ícone de instalar na barra de endereço, ou no menu do navegador.',
  }
}
