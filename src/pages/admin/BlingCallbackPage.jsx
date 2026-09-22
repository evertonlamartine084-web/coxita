import { useEffect, useRef, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { conectarBling } from '../../services/bling'
import { HiCheckCircle, HiExclamationCircle, HiClipboardCopy } from 'react-icons/hi'

/**
 * Página de retorno do OAuth do Bling.
 *
 * O Bling manda a pessoa de volta para cá com `?code=…` depois de autorizar o aplicativo. Esse
 * código vale poucos minutos e precisa ser trocado por um access_token — troca que acontece no
 * servidor, porque exige o Client Secret, que não pode encostar no navegador.
 *
 * A troca acontece assim que a página abre. O código continua à mostra porque vale por poucos
 * minutos: se a troca falhar, dá para tentar de novo sem refazer a autorização toda.
 */
export default function BlingCallbackPage() {
  const [params] = useSearchParams()
  const [copiado, setCopiado] = useState(false)
  const [troca, setTroca] = useState(null) // { ok, mensagem }
  const trocando = useRef(false)

  const code = params.get('code')
  const erro = params.get('error') || params.get('error_description')
  const state = params.get('state')

  useEffect(() => {
    // o efeito roda duas vezes em dev (StrictMode), e o código só pode ser trocado uma
    if (!code || trocando.current) return
    trocando.current = true
    conectarBling(code)
      .then(r => setTroca({ ok: true, mensagem: `Conectado. O acesso vale até ${new Date(r.expira_em).toLocaleString('pt-BR')}.` }))
      .catch(e => setTroca({ ok: false, mensagem: e.message }))
  }, [code])

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      // sem clipboard: o código está na tela para seleção manual
    }
  }

  return (
    <div className="mx-auto max-w-lg p-6">
      <h1 className="mb-1 text-2xl font-bold">Autorização do Bling</h1>
      <p className="mb-6 text-sm text-gray-500">Retorno da conexão com o Bling</p>

      {erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="flex items-center gap-2 font-semibold text-red-800">
            <HiExclamationCircle className="size-5" /> A autorização não foi concluída
          </p>
          <p className="mt-1 text-sm text-red-700">{erro}</p>
        </div>
      )}

      {!erro && code && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="flex items-center gap-2 font-semibold text-green-800">
            <HiCheckCircle className="size-5" /> Autorização recebida
          </p>
          <p className={`mt-2 text-sm font-semibold ${troca?.ok === false ? 'text-red-700' : 'text-green-800'}`}>
            {troca ? troca.mensagem : 'Trocando o código por um acesso…'}
          </p>
          <p className="mt-2 text-sm text-green-700">
            Código de autorização (válido por poucos minutos):
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1.5 font-mono text-xs">
              {code}
            </code>
            <button
              type="button"
              onClick={copiar}
              className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-800"
            >
              <HiClipboardCopy className="size-3.5" />
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          {state && <p className="mt-2 text-xs text-green-700/70">state: {state}</p>}
        </div>
      )}

      {!erro && !code && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
          Esta página recebe o retorno da autorização do Bling. Ela é aberta pelo próprio Bling
          ao final da conexão — não há nada a fazer aqui diretamente.
        </div>
      )}

      <Link to="/admin" className="mt-6 inline-block text-sm text-primary hover:underline">
        ← Voltar ao painel
      </Link>
    </div>
  )
}
