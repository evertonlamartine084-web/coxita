import { useState } from 'react'
import { formatPercent } from '../../utils/format'
import { rotuloDia } from '../../utils/hub'

/**
 * Peças do hub: cartão de número com variação, bloco com título, ranking em barras e gráfico por
 * dia. Gráfico em SVG puro (sem biblioteca), no mesmo viewBox que escala com a largura.
 */

/** "+12%" verde, "−8%" vermelho. `menorMelhor` inverte as cores (ex.: custo por pedido). */
export function Variacao({ valor, menorMelhor = false }) {
  if (valor === null || valor === undefined) return <span className="text-xs text-text-light">sem comparação</span>
  if (valor === Infinity) return <span className="text-xs font-semibold text-green-700">novo</span>
  const bom = menorMelhor ? valor < 0 : valor > 0
  const cor = Math.abs(valor) < 1 ? 'text-text-light' : bom ? 'text-green-700' : 'text-red-600'
  return (
    <span className={`text-xs font-semibold ${cor}`}>
      {valor > 0 ? '▲ +' : valor < 0 ? '▼ ' : ''}{formatPercent(valor, 0)}
    </span>
  )
}

export function Cartao({ titulo, valor, variacao, menorMelhor, detalhe, destaque }) {
  return (
    <div className={`rounded-2xl border p-4 ${destaque ? 'border-primary/30 bg-primary/5' : 'border-border bg-white'}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-text-light">{titulo}</p>
      <p className="mt-1 font-display text-2xl font-extrabold text-brown">{valor}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2">
        {variacao !== undefined && <Variacao valor={variacao} menorMelhor={menorMelhor} />}
        {detalhe && <span className="text-xs text-text-light">{detalhe}</span>}
      </div>
    </div>
  )
}

export function Bloco({ titulo, subtitulo, children, acao }) {
  return (
    <section className="rounded-2xl border border-border bg-white p-4 md:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-extrabold text-brown">{titulo}</h2>
          {subtitulo && <p className="text-xs text-text-light">{subtitulo}</p>}
        </div>
        {acao}
      </div>
      {children}
    </section>
  )
}

/** Lista com barra proporcional. itens: [{ nome, valor, texto?, extra? }] */
export function Ranking({ itens, formatar = (v) => v, vazio = 'Nada no período.', limite = 10, cor = 'bg-primary/15' }) {
  const [todos, setTodos] = useState(false)
  if (!itens.length) return <p className="text-sm text-text-light">{vazio}</p>
  const max = Math.max(...itens.map(i => i.valor), 1)
  const mostrados = todos ? itens : itens.slice(0, limite)
  return (
    <div>
      <ul className="space-y-1.5">
        {mostrados.map(i => (
          <li key={i.nome} className="relative overflow-hidden rounded-lg px-3 py-1.5 text-sm">
            <span className={`absolute inset-y-0 left-0 ${cor}`} style={{ width: `${(i.valor / max) * 100}%` }} aria-hidden="true" />
            <span className="relative flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate" title={i.nome}>{i.nome}</span>
              <span className="shrink-0 font-semibold tabular-nums">
                {i.texto ?? formatar(i.valor)}
                {i.extra && <span className="ml-1.5 text-xs font-normal text-text-light">{i.extra}</span>}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {itens.length > limite && (
        <button type="button" onClick={() => setTodos(t => !t)} className="mt-2 cursor-pointer text-xs font-semibold text-primary hover:underline">
          {todos ? 'Mostrar menos' : `Ver todos (${itens.length})`}
        </button>
      )}
    </div>
  )
}

/**
 * Barras por dia, com uma linha opcional por cima (outra grandeza, outra escala).
 * dados: [{ data: 'AAAA-MM-DD', barra: n, linha?: n }]
 */
export function GraficoDias({ dados, formatarBarra = (v) => v, formatarLinha = (v) => v, nomeBarra, nomeLinha, altura = 180 }) {
  const [foco, setFoco] = useState(null)
  if (!dados.length) return null
  const L = 600
  const H = altura
  const base = H - 22
  const maxB = Math.max(...dados.map(d => d.barra), 1)
  const temLinha = dados.some(d => d.linha !== undefined)
  const maxL = Math.max(...dados.map(d => d.linha ?? 0), 1)
  const passo = L / dados.length
  const larg = Math.max(2, passo * 0.68)
  const cada = Math.ceil(dados.length / 10) // rótulos sem encavalar
  const ponto = (d, i) => `${i * passo + passo / 2},${base - ((d.linha ?? 0) / maxL) * (base - 10)}`
  const atual = foco !== null ? dados[foco] : null

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-light">
        <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm bg-primary/70" />{nomeBarra}</span>
        {temLinha && <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 bg-festa" />{nomeLinha}</span>}
        <span className="ml-auto min-h-4 font-semibold text-text">
          {atual && <>{rotuloDia(atual.data)}: {formatarBarra(atual.barra)}{temLinha && ` · ${formatarLinha(atual.linha ?? 0)}`}</>}
        </span>
      </div>
      <svg viewBox={`0 0 ${L} ${H}`} className="w-full" role="img" aria-label={nomeBarra} onMouseLeave={() => setFoco(null)}>
        {dados.map((d, i) => (
          <g key={d.data} onMouseEnter={() => setFoco(i)} onClick={() => setFoco(i)}>
            <rect x={i * passo} y={0} width={passo} height={base} fill="transparent" />
            <rect
              x={i * passo + (passo - larg) / 2}
              y={base - (d.barra / maxB) * (base - 10)}
              width={larg}
              height={(d.barra / maxB) * (base - 10)}
              rx={2}
              className={foco === i ? 'fill-primary' : 'fill-primary/60'}
            />
            {i % cada === 0 && (
              <text x={i * passo + passo / 2} y={H - 6} textAnchor="middle" className="fill-text-light" fontSize="11">{rotuloDia(d.data)}</text>
            )}
          </g>
        ))}
        {temLinha && (
          <polyline points={dados.map(ponto).join(' ')} fill="none" className="stroke-festa" strokeWidth="2" strokeLinejoin="round" pointerEvents="none" />
        )}
        <line x1="0" x2={L} y1={base} y2={base} className="stroke-border" />
      </svg>
    </div>
  )
}

/** Funil em degraus: cada etapa mostra quanto passou da anterior. */
export function Funil({ etapas }) {
  const max = Math.max(etapas[0]?.valor ?? 0, 1)
  return (
    <ol className="space-y-2">
      {etapas.map((e, i) => {
        const anterior = i > 0 ? etapas[i - 1].valor : null
        return (
          <li key={e.nome}>
            <div className="flex items-baseline justify-between text-sm">
              <span>{e.nome}</span>
              <span className="font-semibold tabular-nums">
                {e.valor}
                {anterior ? <span className="ml-2 text-xs font-normal text-text-light">{formatPercent((e.valor / anterior) * 100, 0)} da etapa anterior</span> : null}
              </span>
            </div>
            <div className="mt-1 h-3 rounded-full bg-cream">
              <div className="h-3 rounded-full bg-accent/70" style={{ width: `${(e.valor / max) * 100}%` }} />
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** Aviso quando uma fonte do Google não respondeu: o resto do hub segue. */
export function SemDados({ fonte, erro }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      Não consegui ler o {fonte} agora.{erro && <span className="block text-xs opacity-80">{erro}</span>}
    </div>
  )
}
