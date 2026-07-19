import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { HiMinus, HiPlus, HiX } from 'react-icons/hi'
import { getFlavors, peekFlavors } from '../../services/flavors'
import { PASSO_SABOR, maxSabores, restante, validarComposicao } from '../../utils/pacote'
import { formatCurrency } from '../../utils/format'
import { catalogText } from '../../utils/catalogText'
import Button from '../ui/Button'
import Loading from '../ui/Loading'

/**
 * Monta um pacote distribuindo `product.pack_size` unidades entre os sabores,
 * de 25 em 25.
 */
export default function FlavorPicker({ product, aberto, aoFechar, aoConfirmar }) {
  const [sabores, setSabores] = useState(() => peekFlavors() ?? [])
  const [carregando, setCarregando] = useState(!peekFlavors())
  const [erroCarga, setErroCarga] = useState(false)
  // { [flavorId]: quantidade }
  const [escolhas, setEscolhas] = useState({})

  useEffect(() => {
    if (!aberto) return
    let cancelado = false
    getFlavors()
      .then(lista => {
        if (!cancelado) {
          setSabores(lista)
          setErroCarga(false)
        }
      })
      .catch(() => { if (!cancelado) setErroCarga(true) })
      .finally(() => { if (!cancelado) setCarregando(false) })
    return () => { cancelado = true }
  }, [aberto])

  const fechar = useCallback(() => {
    setEscolhas({})
    aoFechar()
  }, [aoFechar])

  useEffect(() => {
    if (!aberto) return
    const onKey = e => { if (e.key === 'Escape') fechar() }
    window.addEventListener('keydown', onKey)
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = anterior
    }
  }, [aberto, fechar])

  if (!aberto) return null

  const listaEscolhida = Object.entries(escolhas)
    .filter(([, q]) => q > 0)
    .map(([id, quantity]) => {
      const s = sabores.find(f => String(f.id) === id)
      return { id, name: catalogText(s?.name ?? ''), quantity }
    })

  const falta = restante(product.pack_size, listaEscolhida)
  const { valido, erro } = validarComposicao(product, listaEscolhida)
  const saboresUsados = listaEscolhida.length
  const limiteSabores = maxSabores(product.pack_size)

  const ajustar = (flavorId, delta) => {
    // Tudo e recalculado a partir de `atual`, nunca do render: dois cliques
    // rapidos no + poderiam passar do tamanho do pacote se olhassem `falta`.
    setEscolhas(atual => {
      const chave = String(flavorId)
      const qtdAtual = atual[chave] ?? 0
      const nova = qtdAtual + delta
      if (nova < 0) return atual

      const somaAtual = Object.values(atual).reduce((s, q) => s + q, 0)
      if (somaAtual + delta > product.pack_size) return atual

      const usados = Object.values(atual).filter(q => q > 0).length
      if (qtdAtual === 0 && delta > 0 && usados >= maxSabores(product.pack_size)) return atual

      const proximo = { ...atual, [chave]: nova }
      if (nova === 0) delete proximo[chave]
      return proximo
    })
  }

  const confirmar = () => {
    if (!valido) return
    aoConfirmar(listaEscolhida)
    setEscolhas({})
  }

  // Portal para o body: o card pai tem overflow-hidden (recorta o modal) e
  // transform no hover (transform cria containing block, e o `fixed` passaria
  // a se ancorar no card em vez da viewport).
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-brown/40 backdrop-blur-[2px]"
        onClick={fechar}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Montar ${product.name}`}
        className="relative w-full sm:max-w-lg bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[88vh] flex flex-col"
      >
        <header className="flex items-start gap-3 p-5 border-b border-border">
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-xl font-extrabold text-text leading-tight">
              {product.name}
            </h2>
            <p className="text-text-light text-sm mt-0.5">
              Escolha {product.pack_size} salgados, de {PASSO_SABOR} em {PASSO_SABOR}
              {' '}&middot; até {limiteSabores} {limiteSabores === 1 ? 'sabor' : 'sabores'}
            </p>
          </div>
          <button
            onClick={fechar}
            aria-label="Fechar"
            className="text-text-light hover:text-text p-1 cursor-pointer transition-colors"
          >
            <HiX size={22} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {carregando ? (
            <Loading />
          ) : erroCarga ? (
            <p className="text-danger text-sm text-center py-8">
              Não conseguimos carregar os sabores. Tente de novo.
            </p>
          ) : sabores.length === 0 ? (
            <p className="text-text-light text-sm text-center py-8">
              Nenhum sabor disponível no momento.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {sabores.map(sabor => {
                const qtd = escolhas[String(sabor.id)] ?? 0
                const podeSomar = falta >= PASSO_SABOR
                const noLimite = qtd === 0 && saboresUsados >= limiteSabores
                return (
                  <li key={sabor.id} className="flex items-center gap-3 py-3">
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-sm ${qtd > 0 ? 'text-primary' : 'text-text'}`}>
                        {catalogText(sabor.name)}
                      </p>
                      {sabor.description && (
                        <p className="text-text-light text-xs mt-0.5 truncate">{catalogText(sabor.description)}</p>
                      )}
                    </div>

                    <div className="flex items-center bg-bg-warm rounded-xl overflow-hidden shrink-0">
                      <button
                        onClick={() => ajustar(sabor.id, -PASSO_SABOR)}
                        disabled={qtd === 0}
                        aria-label={`Tirar ${PASSO_SABOR} de ${catalogText(sabor.name)}`}
                        className="w-9 h-9 flex items-center justify-center text-text-light hover:bg-border-warm disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed"
                      >
                        <HiMinus size={14} />
                      </button>
                      <span className="text-sm font-bold w-10 text-center font-display tabular-nums">
                        {qtd}
                      </span>
                      <button
                        onClick={() => ajustar(sabor.id, PASSO_SABOR)}
                        disabled={!podeSomar || noLimite}
                        aria-label={`Adicionar ${PASSO_SABOR} de ${catalogText(sabor.name)}`}
                        className="w-9 h-9 flex items-center justify-center text-text-light hover:bg-border-warm disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed"
                      >
                        <HiPlus size={14} />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <footer className="border-t border-border p-5 space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-text-light">
              {product.pack_size - falta} de {product.pack_size} escolhidos
            </span>
            <span className="font-display font-extrabold text-xl text-primary">
              {formatCurrency(product.price)}
            </span>
          </div>

          <div
            className="h-1.5 bg-bg-warm rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={product.pack_size - falta}
            aria-valuemin={0}
            aria-valuemax={product.pack_size}
          >
            <div
              className="h-full bg-primary rounded-full transition-[width] duration-[--duration-base] ease-[--ease-entrance]"
              style={{ width: `${((product.pack_size - falta) / product.pack_size) * 100}%` }}
            />
          </div>

          {erro && <p className="text-text-light text-sm text-center">{erro}</p>}

          <Button onClick={confirmar} disabled={!valido} className="w-full" size="lg">
            Adicionar ao carrinho
          </Button>
        </footer>
      </div>
    </div>,
    document.body
  )
}
