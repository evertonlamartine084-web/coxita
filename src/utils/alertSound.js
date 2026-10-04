// Generates a notification sound using Web Audio API (no external file needed)
let audioContext = null

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)()
  }
  // Resume if browser suspended it (autoplay policy)
  if (audioContext.state === 'suspended') {
    audioContext.resume()
  }
  return audioContext
}

// "Warm up" AudioContext on first user interaction
function initOnInteraction() {
  getAudioContext()
  document.removeEventListener('click', initOnInteraction)
  document.removeEventListener('keydown', initOnInteraction)
}
document.addEventListener('click', initOnInteraction)
document.addEventListener('keydown', initOnInteraction)

/**
 * Alarme de pedido novo: sirene que sobe e desce três vezes, seguida de bipes rápidos (~4 s).
 *
 * Foi pedido "bem alarmante": o "ding ding" anterior passava despercebido com a cozinha
 * barulhenta. Onda quadrada + dente de serra corta o barulho de fritura muito melhor que a
 * senoide; o compressor no fim segura o volume alto sem estourar o alto-falante.
 */
export function playOrderAlert() {
  try {
    const ctx = getAudioContext()
    const saida = ctx.createDynamicsCompressor()
    saida.threshold.value = -6
    saida.ratio.value = 8
    saida.connect(ctx.destination)

    const voz = (tipo, volume, inicio, fim) => {
      const osc = ctx.createOscillator()
      const ganho = ctx.createGain()
      osc.type = tipo
      osc.connect(ganho)
      ganho.connect(saida)
      ganho.gain.setValueAtTime(0, inicio)
      ganho.gain.linearRampToValueAtTime(volume, inicio + 0.02)
      ganho.gain.setValueAtTime(volume, fim - 0.03)
      ganho.gain.linearRampToValueAtTime(0, fim)
      osc.start(inicio)
      osc.stop(fim)
      return osc
    }

    const agora = ctx.currentTime

    // sirene: 3 ciclos subindo e descendo entre 650 e 1500 Hz
    for (let i = 0; i < 3; i++) {
      const t = agora + i * 0.8
      for (const [tipo, volume] of [['square', 0.5], ['sawtooth', 0.35]]) {
        const osc = voz(tipo, volume, t, t + 0.78)
        osc.frequency.setValueAtTime(650, t)
        osc.frequency.linearRampToValueAtTime(1500, t + 0.4)
        osc.frequency.linearRampToValueAtTime(650, t + 0.78)
      }
    }

    // bipes rápidos no fim, agudos, para não confundir com outro barulho
    const depois = agora + 2.5
    for (let i = 0; i < 6; i++) {
      const t = depois + i * 0.2
      const osc = voz('square', 0.55, t, t + 0.12)
      osc.frequency.setValueAtTime(i % 2 ? 1760 : 2093, t)
    }
  } catch (e) {
    console.warn('Could not play alert sound:', e)
  }
}
