import { Link } from 'react-router-dom'
import { HiChevronRight } from 'react-icons/hi'

/**
 * Trilha de navegacao.
 *
 * Serve a duas coisas ao mesmo tempo: quem chegou de busca direto numa pagina
 * de sabor nao tem como saber onde esta nem como subir para o cardapio -- e o
 * resultado de busca troca a URL crua por "coxelli.com.br > Salgados > Coxinha
 * de frango" quando encontra o BreadcrumbList.
 *
 * `itens` e [{ nome, caminho }]. O ultimo e a pagina atual e nao vira link.
 */
export default function Breadcrumbs({ itens }) {
  if (!itens?.length) return null

  return (
    <nav aria-label="Você está em" className="mb-5">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-brown/70 list-none p-0 m-0">
        {itens.map((item, i) => {
          const ultimo = i === itens.length - 1
          return (
            <li key={item.caminho} className="flex items-center gap-1.5">
              {ultimo ? (
                <span aria-current="page" className="text-brown">{item.nome}</span>
              ) : (
                <>
                  <Link
                    to={item.caminho}
                    className="no-underline hover:text-brown hover:underline underline-offset-4 transition-colors duration-[--duration-fast] ease-[--ease-interaction]"
                  >
                    {item.nome}
                  </Link>
                  <HiChevronRight size={14} aria-hidden="true" className="text-brown/40" />
                </>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
