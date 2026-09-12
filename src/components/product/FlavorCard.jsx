import { useState } from 'react'
import { HiPlus } from 'react-icons/hi'
import { catalogText } from '../../utils/catalogText'

/**
 * Cartao de um sabor. Sem preco de proposito: sabor nao e vendido sozinho, so
 * existe dentro de um pacote -- quem tem preco e o pacote.
 *
 * Duas medidas, um desenho so. `compacto` e a vitrine da home, onde o cartao
 * vive num carrossel de 210px; sem ele, o cartao usa a mesma caixa do
 * ProductCard, porque no cardapio ele fica lado a lado com produtos e destoar
 * ali faria a aba de pasteis parecer outra pagina.
 */
export default function FlavorCard({ sabor, aoAdicionar, compacto = false }) {
  const [carregou, setCarregou] = useState(false)

  const alturaFoto = compacto ? 'h-36' : 'h-32 sm:h-56'

  return (
    <div
      className={`overflow-hidden border-[3px] border-brown h-full ${
        compacto
          ? 'bg-cream shadow-[4px_4px_0_#5d2b04]'
          : 'bg-surface shadow-[5px_5px_0_#5d2b04] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[3px_3px_0_#5d2b04] transition-[transform,box-shadow] duration-[--duration-fast] ease-[--ease-interaction]'
      }`}
    >
      {/* Moldura. O creme vira passe-partout e a foto ganha a mesma borda marrom
          com sombra dura do card, em escala menor: repete a linguagem impressa e
          cria a leitura de retrato colado sobre o cartaz. Mesma peca do
          ProductCard -- e o que mantem as duas abas parecendo uma so. */}
      <div className={compacto ? 'bg-cream p-2.5 pr-3 pb-3' : 'bg-cream p-1.5 pr-2 pb-2 sm:p-2.5 sm:pr-3 sm:pb-3'}>
        <div className="relative border-2 border-brown bg-bg-warm shadow-[2px_2px_0_#5d2b04]">
          {sabor.image_url ? (
            <>
              {!carregou && <div className="absolute inset-0 animate-pulse bg-bg-warm" />}
              <img
                src={sabor.image_url}
                alt={catalogText(sabor.name)}
                loading="lazy"
                onLoad={() => setCarregou(true)}
                className={`block w-full ${alturaFoto} object-cover transition-opacity duration-500 ${carregou ? 'opacity-100' : 'opacity-0'}`}
              />
            </>
          ) : (
            <div className={`w-full ${alturaFoto} flex items-center justify-center`}>
              <img width={512} height={512} src="/logo.png" alt="" className={`${compacto ? 'w-14 h-14' : 'w-20 h-20'} opacity-25 object-contain`} />
            </div>
          )}
        </div>
      </div>

      <div className={compacto ? 'px-3.5 pb-3.5' : 'px-2.5 pb-3 sm:px-4 sm:pb-4'}>
        <h3
          className={`font-display font-extrabold uppercase text-brown ${
            compacto ? 'text-lg leading-tight' : 'text-base sm:text-2xl leading-tight sm:leading-none'
          }`}
        >
          {catalogText(sabor.name)}
        </h3>
        {sabor.description && (
          <p
            className={`text-text-light line-clamp-2 leading-snug sm:leading-relaxed ${
              compacto ? 'text-xs mt-1' : 'text-xs sm:text-sm mt-1 sm:mt-1.5'
            }`}
          >
            {catalogText(sabor.description)}
          </p>
        )}

        {aoAdicionar && (
          // A borda superior repete a divisao preco/botao do ProductCard, para
          // que as duas abas tenham o mesmo ritmo vertical.
          <div className="flex items-center justify-between gap-1.5 mt-2.5 pt-2 sm:gap-3 sm:mt-4 sm:pt-3 border-t border-border/50">
            <span className="text-[10px] sm:text-xs text-text-light">Escolha o pacote</span>
            <button
              onClick={() => aoAdicionar(sabor)}
              aria-label={`Adicionar ${catalogText(sabor.name)} ao pedido`}
              className="flex items-center gap-1.5 bg-primary text-white font-display font-extrabold uppercase text-sm tracking-wide px-4 py-2 border-2 border-brown rounded-sm hover:bg-brown active:scale-[0.94] transition-[background-color,transform] duration-[--duration-fast] ease-[--ease-interaction] cursor-pointer"
            >
              <HiPlus size={15} />
              Adicionar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
