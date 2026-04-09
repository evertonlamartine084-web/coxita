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

export function playOrderAlert() {
  try {
    const ctx = getAudioContext()

    // Play two ascending tones for a pleasant "ding ding" alert
    const playTone = (freq, startTime, duration) => {
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(freq, startTime)

      gainNode.gain.setValueAtTime(0, startTime)
      gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.05)
      gainNode.gain.linearRampToValueAtTime(0, startTime + duration)

      oscillator.start(startTime)
      oscillator.stop(startTime + duration)
    }

    const now = ctx.currentTime
    // Two-tone ascending alert: plays twice
    playTone(880, now, 0.15)        // A5
    playTone(1108, now + 0.18, 0.15) // C#6
    playTone(880, now + 0.5, 0.15)
    playTone(1108, now + 0.68, 0.15)
  } catch (e) {
    console.warn('Could not play alert sound:', e)
  }
}
