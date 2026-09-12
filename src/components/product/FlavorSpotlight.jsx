import { Link } from 'react-router-dom'
import { HiArrowRight } from 'react-icons/hi'
import { catalogText } from '../../utils/catalogText'

/**
 * Faixa de destaque dos pasteis, com a foto do recheio aberto na mao.
 *
 * Existe separada da vitrine de sabores porque a foto e outra: no cardapio o
 * pastel aparece no prato, inteiro, para mostrar o produto; aqui aparece
 * partido e a um palmo do rosto, para dar vontade. Por isso le
 * `image_closeup_url` e nao `image_url`, e por isso so entra sabor que tem
 * essa foto -- meia faixa com buraco nao chama atencao, espanta.
 *
 * Fundo marrom de proposito: as fotos foram tiradas contra parede terrosa, e
 * sobre creme elas empapuçam. No escuro, o dourado da massa salta.
 */
export default function FlavorSpotlight({ flavors }) {
  const comCloseup = (flavors ?? []).filter(f => f.image_closeup_url)
  if (comCloseup.length === 0) return null

  return (
    <div className="max-w-6xl mx-auto px-4">
      <div className="md:flex md:items-end md:justify-between md:gap-8 mb-8">
        <div>
          <p className="font-display font-extrabold text-sm uppercase tracking-[0.12em] text-secondary mb-2">
            Feito na hora, frito na hora
          </p>
          <h2 className="font-display text-5xl md:text-6xl font-black uppercase leading-none text-cream">
            Olha o recheio
          </h2>
        </div>

        <Link to="/cardapio?aba=centos-pasteis" className="hidden md:block shrink-0">
          <span className="inline-flex items-center gap-2 bg-secondary text-brown font-display font-extrabold uppercase tracking-wide px-5 py-3 border-2 border-brown shadow-[4px_4px_0_#3d2410] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#3d2410] transition-[transform,box-shadow] duration-[--duration-fast] ease-[--ease-interaction]">
            Ver os pastéis
            <HiArrowRight size={16} />
          </span>
        </Link>
      </div>

      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 list-none p-0 m-0">
        {comCloseup.map(sabor => (
          <li key={sabor.id}>
            <Link to="/cardapio?aba=centos-pasteis" className="block group">
              {/* Mesma moldura do resto do site, aqui em creme sobre o escuro:
                  e o que amarra a faixa ao cartaz das outras secoes. */}
              <div className="bg-cream p-2 border-[3px] border-brown shadow-[4px_4px_0_#3d2410] group-hover:translate-x-[2px] group-hover:translate-y-[2px] group-hover:shadow-[2px_2px_0_#3d2410] transition-[transform,box-shadow] duration-[--duration-fast] ease-[--ease-interaction]">
                <img
                  src={sabor.image_closeup_url}
                  alt={catalogText(sabor.name)}
                  loading="lazy"
                  className="block w-full aspect-square object-cover border-2 border-brown"
                />
                <p className="font-display font-extrabold uppercase text-brown leading-tight text-center text-sm mt-2 mb-1 px-1">
                  {catalogText(sabor.name)}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <Link to="/cardapio?aba=centos-pasteis" className="md:hidden block mt-6">
        <span className="w-full inline-flex items-center justify-center gap-2 bg-secondary text-brown font-display font-extrabold uppercase tracking-wide px-5 py-3 border-2 border-brown shadow-[4px_4px_0_#3d2410]">
          Ver os pastéis
          <HiArrowRight size={16} />
        </span>
      </Link>
    </div>
  )
}
