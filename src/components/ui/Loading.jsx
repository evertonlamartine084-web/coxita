/**
 * Espera do carregamento inicial.
 *
 * `min-h-[85vh]` nao e enfeite: sem altura reservada, o bloco media ~300px, o
 * rodape encostava dentro da viewport e era atirado para baixo assim que o
 * conteudo real chegava. Esse pulo sozinho respondia por 87% do CLS da home
 * (0,61 de 0,70 medidos, contra o limite de 0,1 do Google). Ocupando quase a
 * tela inteira, o rodape ja nasce abaixo da dobra e o deslocamento deixa de ser
 * visivel -- que e exatamente o que a metrica mede.
 */
export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[85vh] py-20">
      <img width={512} height={512}
        src="/logo.png"
        alt="Carregando..."
        className="w-16 h-16 object-contain animate-bounce mb-3 opacity-60"
      />
      <p className="text-text-light text-sm font-display font-semibold">Carregando...</p>
    </div>
  )
}
