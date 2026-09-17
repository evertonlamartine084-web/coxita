/**
 * Marca a tela quando o que esta no ar nao e producao.
 *
 * Homolog, previews e o dev local apontam para o MESMO Supabase da producao:
 * pedido feito em qualquer um deles entra na fila de verdade, baixa estoque e
 * dispara push no celular de quem trabalha. A unica diferenca visivel entre os
 * ambientes e o endereco na barra -- que no celular some assim que a pagina
 * rola. O selo existe para ninguem cancelar pedido de cliente achando que esta
 * mexendo em dado de mentira.
 *
 * Decide pelo hostname em vez de por variavel de ambiente de proposito: uma
 * variavel precisa ser lembrada a cada ambiente novo, e o ambiente que alguem
 * esquecer de configurar e justamente o que vai passar por producao sem selo.
 * O dominio de producao e um so e esta em `content/paginas.js` (SITE).
 */
import { SITE } from '../../content/paginas'

const HOSTS_DE_PRODUCAO = new Set([
  new URL(SITE).hostname,
  `www.${new URL(SITE).hostname}`,
])

function nomeDoAmbiente(hostname) {
  if (HOSTS_DE_PRODUCAO.has(hostname)) return null
  if (hostname === 'homolog.coxelli.com.br') return 'homolog'
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'local'
  return 'preview'
}

export default function SeloAmbiente() {
  const ambiente = typeof window === 'undefined'
    ? null
    : nomeDoAmbiente(window.location.hostname)

  if (!ambiente) return null

  return (
    <div
      className="fixed bottom-2 left-2 z-[9999] pointer-events-none select-none"
      aria-hidden="true"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/95 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow-lg ring-1 ring-amber-700/30">
        <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
        {ambiente} · banco de produção
      </span>
    </div>
  )
}
