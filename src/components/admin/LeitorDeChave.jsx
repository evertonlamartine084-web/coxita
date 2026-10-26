import { useEffect, useRef, useState } from 'react'
import { HiCamera, HiPhotograph, HiX } from 'react-icons/hi'
import Button from '../ui/Button'

/**
 * Lê a chave de acesso (44 dígitos) do código de barras de um DANFE de NF-e.
 *
 * O código de barras do DANFE é Code 128 com a própria chave. BarcodeDetector quando o navegador
 * tem (Chrome no Android); senão ZXing, carregado só aqui. Também aceita foto e chave digitada,
 * porque código de barras amassado ou desbotado é comum em nota guardada.
 */

/** Dígito verificador da chave (módulo 11, pesos 2 a 9 da direita para a esquerda). */
function chaveValida(chave) {
  if (!/^\d{44}$/.test(chave)) return false
  let soma = 0
  for (let i = 0; i < 43; i++) soma += Number(chave[42 - i]) * (2 + (i % 8))
  const resto = soma % 11
  const dv = resto < 2 ? 0 : 11 - resto
  return dv === Number(chave[43])
}

const somenteChave = (texto) => {
  const d = String(texto ?? '').replace(/\D/g, '')
  const m = d.match(/\d{44}/)
  return m ? m[0] : null
}

let zxingPromise = null
const carregarZxing = () => (zxingPromise ??= Promise.all([import('@zxing/browser'), import('@zxing/library')]))

async function leitorZxing() {
  const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await carregarZxing()
  const hints = new Map()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.ITF, BarcodeFormat.QR_CODE])
  hints.set(DecodeHintType.TRY_HARDER, true)
  return new BrowserMultiFormatReader(hints)
}

async function lerDeImagem(arquivo) {
  const url = URL.createObjectURL(arquivo)
  try {
    if ('BarcodeDetector' in window) {
      try {
        const bitmap = await createImageBitmap(arquivo)
        const det = new window.BarcodeDetector({ formats: ['code_128', 'itf', 'qr_code'] })
        for (const r of await det.detect(bitmap)) {
          const c = somenteChave(r.rawValue)
          if (c) return c
        }
      } catch { /* cai no ZXing */ }
    }
    const leitor = await leitorZxing()
    const r = await leitor.decodeFromImageUrl(url)
    return somenteChave(r?.getText())
  } finally {
    URL.revokeObjectURL(url)
  }
}

export default function LeitorDeChave({ aoLer, aoCancelar }) {
  const videoRef = useRef(null)
  const arquivoRef = useRef(null)
  const [camera, setCamera] = useState(false)
  const [digitada, setDigitada] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!camera) return
    let parar = false
    let controles = null
    let stream = null
    let timer = null

    const entregar = (texto) => {
      const c = somenteChave(texto)
      if (c && chaveValida(c) && !parar) { parar = true; aoLer(c) }
    }

    ;(async () => {
      try {
        if ('BarcodeDetector' in window) {
          const formatos = await window.BarcodeDetector.getSupportedFormats?.() ?? []
          if (formatos.includes('code_128')) {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false })
            if (parar) return
            videoRef.current.srcObject = stream
            await videoRef.current.play().catch(() => {})
            const det = new window.BarcodeDetector({ formats: ['code_128', 'itf'] })
            const ler = async () => {
              if (parar) return
              try { for (const r of await det.detect(videoRef.current)) entregar(r.rawValue) } catch { /* próximo quadro */ }
              timer = setTimeout(ler, 200)
            }
            ler()
            return
          }
        }
        const leitor = await leitorZxing()
        if (parar) return
        controles = await leitor.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } } },
          videoRef.current,
          (r) => { if (r) entregar(r.getText()) },
        )
      } catch {
        setErro('Sem acesso à câmera. Use a foto ou digite a chave.')
        setCamera(false)
      }
    })()

    return () => {
      parar = true
      clearTimeout(timer)
      controles?.stop()
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [camera, aoLer])

  const daFoto = async (ev) => {
    const arquivo = ev.target.files?.[0]
    ev.target.value = ''
    if (!arquivo) return
    setErro('')
    try {
      const c = await lerDeImagem(arquivo)
      if (c && chaveValida(c)) aoLer(c)
      else setErro('Não consegui ler o código de barras na foto. Tente de perto, com a folha reta, ou digite a chave.')
    } catch {
      setErro('Não consegui ler a foto.')
    }
  }

  const enviarDigitada = (e) => {
    e.preventDefault()
    const c = somenteChave(digitada)
    if (!c) { setErro('A chave tem 44 números.'); return }
    if (!chaveValida(c)) { setErro('Essa chave tem algum número trocado (o dígito final não confere).'); return }
    aoLer(c)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold text-brown">Nota de empresa (folha grande, com código de barras)</p>
        <button type="button" onClick={aoCancelar} className="text-text-warm cursor-pointer" aria-label="Fechar"><HiX /></button>
      </div>

      {camera ? (
        <div className="text-center">
          <div className="relative mx-auto rounded-xl overflow-hidden bg-black" style={{ maxWidth: 520, aspectRatio: '16 / 9' }}>
            <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
            <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 h-16 border-4 border-secondary rounded-lg pointer-events-none" />
          </div>
          <p className="text-xs text-text-warm mt-2">Deite o celular e enquadre o código de barras na faixa amarela.</p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setCamera(false)}>Parar a câmera</Button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          <Button type="button" onClick={() => { setErro(''); setCamera(true) }} className="w-full">
            <HiCamera className="mr-2 text-xl" /> Ler o código de barras
          </Button>
          <Button type="button" variant="secondary" onClick={() => arquivoRef.current?.click()} className="w-full">
            <HiPhotograph className="mr-2 text-xl" /> Foto da nota
          </Button>
          <input ref={arquivoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={daFoto} />
        </div>
      )}

      <form onSubmit={enviarDigitada} className="mt-4 flex gap-2">
        <input
          value={digitada}
          onChange={e => setDigitada(e.target.value)}
          inputMode="numeric"
          placeholder="ou digite a chave de acesso (44 números)"
          className="flex-1 px-3 py-2.5 border-2 border-border rounded-xl text-sm outline-none focus:border-primary font-mono"
        />
        <Button type="submit" variant="outline" size="sm" disabled={digitada.replace(/\D/g, '').length < 44}>Buscar</Button>
      </form>
      {erro && <p className="text-danger text-sm mt-3">{erro}</p>}
    </div>
  )
}
