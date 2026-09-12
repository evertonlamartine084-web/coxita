/**
 * Perguntas e respostas da pagina.
 *
 * Usa <details>/<summary> nativos: abrem sem JavaScript, sao acessiveis por
 * teclado de fabrica e o texto da resposta existe no HTML mesmo fechado -- o
 * que importa porque e esse texto que o buscador le para montar o resultado
 * expandido.
 *
 * Quem monta o FAQPage do JSON-LD e a pagina, a partir da mesma lista. As duas
 * saidas precisam bater: marcar no schema pergunta que nao esta na tela e
 * motivo de perder o rich result.
 */
export default function Faq({ itens, titulo = 'Perguntas frequentes' }) {
  if (!itens?.length) return null

  return (
    <section className="max-w-3xl mx-auto px-4 py-12 md:py-16">
      <h2 className="font-display text-4xl md:text-5xl font-black uppercase tracking-tight text-brown mb-7">
        <span className="underline-hand">{titulo}</span>
      </h2>

      <div className="border-t-2 border-brown/20">
        {itens.map(item => (
          <details
            key={item.pergunta}
            className="group border-b-2 border-brown/20 py-4"
          >
            <summary className="flex items-start justify-between gap-4 cursor-pointer list-none font-display font-extrabold text-lg md:text-xl text-brown leading-snug [&::-webkit-details-marker]:hidden">
              {item.pergunta}
              {/* Cruz que vira menos. Girar 45deg e uma transformacao so --
                  trocar de icone no aberto pisca no meio da transicao. */}
              <span
                aria-hidden="true"
                className="relative mt-1.5 size-4 shrink-0 text-primary transition-transform duration-[--duration-fast] ease-[--ease-interaction] group-open:rotate-45"
              >
                <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-current" />
                <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-current" />
              </span>
            </summary>
            <p className="text-text-light leading-relaxed mt-3 pr-8">
              {item.resposta}
            </p>
          </details>
        ))}
      </div>
    </section>
  )
}
