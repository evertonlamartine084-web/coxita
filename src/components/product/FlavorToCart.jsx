import { useState } from 'react'
import { createPortal } from 'react-dom'
import { HiX } from 'react-icons/hi'
import toast from 'react-hot-toast'
import { useCartStore } from '../../store/cartStore'
import { formatCurrency } from '../../utils/format'
import { catalogText } from '../../utils/catalogText'
import { PASSO_SABOR, maxSabores, unidadeDoPacote, saborUnicoDoPacote } from '../../utils/pacote'
import { ESTILO_TOAST } from '../../utils/toastEstilo'
import FlavorPicker from './FlavorPicker'

/**
 * Leva um sabor ao carrinho.
 *
 * Sabor nao tem preco: quem tem e o pacote. Entao o caminho e escolher o
 * tamanho primeiro e so depois montar -- ja com 25 unidades deste sabor
 * marcadas, que e o passo minimo. O cliente completa o resto (ou nao, se o
 * pacote for de 25) e confirma.
 */
export default function FlavorToCart({ sabor, pacotes, aoFechar }) {
  const [pacote, setPacote] = useState(null)
  const addItem = useCartStore(s => s.addItem)

  const confirmar = (sabores) => {
    addItem(pacote, sabores)
    toast.success(`${pacote.name} adicionado!`, ESTILO_TOAST)
    aoFechar()
  }

  // Pacote de sabor unico (os pasteis, que tem preco por sabor): escolher o
  // tamanho ja e a escolha inteira, entao nao ha segundo passo.
  const escolherTamanho = (p) => {
    const saborUnico = saborUnicoDoPacote(p)
    if (!saborUnico) {
      setPacote(p)
      return
    }
    addItem(p, saborUnico)
    toast.success(`${p.name} adicionado!`, ESTILO_TOAST)
    aoFechar()
  }

  if (pacote) {
    return (
      <FlavorPicker
        product={pacote}
        aberto
        escolhasIniciais={{ [String(sabor.id)]: PASSO_SABOR }}
        aoFechar={aoFechar}
        aoConfirmar={confirmar}
      />
    )
  }

  const ordenados = [...pacotes].sort((a, b) => a.pack_size - b.pack_size)
  const todosDeSaborUnico = ordenados.length > 0 && ordenados.every(p => saborUnicoDoPacote(p))

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-brown/40 backdrop-blur-[2px]"
        onClick={aoFechar}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Escolher pacote para ${catalogText(sabor.name)}`}
        className="relative w-full sm:max-w-lg bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[88vh] flex flex-col"
      >
        <header className="flex items-start gap-3 p-5 border-b border-border">
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-xl font-extrabold text-text leading-tight">
              {catalogText(sabor.name)}
            </h2>
            <p className="text-text-light text-sm mt-0.5">
              {todosDeSaborUnico
                ? 'Escolha o tamanho.'
                : `Escolha o tamanho do pacote. Já entram ${PASSO_SABOR} deste sabor.`}
            </p>
          </div>
          <button
            onClick={aoFechar}
            aria-label="Fechar"
            className="text-text-light hover:text-text p-1 cursor-pointer transition-colors"
          >
            <HiX size={22} />
          </button>
        </header>

        <ul className="flex-1 overflow-y-auto p-5 space-y-3 list-none m-0">
          {ordenados.map(p => {
            const cabem = maxSabores(p.pack_size)
            return (
              <li key={p.id}>
                <button
                  onClick={() => escolherTamanho(p)}
                  className="w-full flex items-center justify-between gap-4 text-left p-4 bg-cream border-2 border-brown shadow-[3px_3px_0_#5d2b04] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_#5d2b04] transition-[transform,box-shadow] duration-[--duration-fast] ease-[--ease-interaction] cursor-pointer"
                >
                  <span className="min-w-0">
                    <span className="block font-display font-extrabold uppercase text-xl text-brown leading-none">
                      {catalogText(p.name)}
                    </span>
                    <span className="block text-text-light text-xs mt-1">
                      {p.pack_size} {unidadeDoPacote(p)}
                      {/* "até N sabores" só existe em pacote misto: no de sabor
                          único a escolha do tamanho é a escolha inteira. */}
                      {!saborUnicoDoPacote(p) && (
                        <> &middot; até {cabem} {cabem === 1 ? 'sabor' : 'sabores'}</>
                      )}
                    </span>
                  </span>
                  <span className="font-display font-extrabold text-xl text-primary shrink-0">
                    {formatCurrency(p.price)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>,
    document.body
  )
}
