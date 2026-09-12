import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { HiArrowRight, HiMinus, HiPlus } from 'react-icons/hi'
import Button from '../ui/Button'

/**
 * "Quantos salgados eu peco?" respondido na propria pagina.
 *
 * E a duvida que trava o pedido: a pessoa sabe que quer salgado, nao sabe
 * quanto, e vai perguntar no WhatsApp -- ou desistir e decidir depois. Aqui ela
 * resolve sozinha e ja sai com o pacote escolhido.
 *
 * A conta arredonda para cima, sempre. Sobrar salgado e ter o que oferecer no
 * dia seguinte; faltar e o anfitriao passando vergonha na frente dos convidados
 * -- e a lembranca disso gruda em quem vendeu.
 *
 * Sem estado global e sem rede: e aritmetica. O `porPessoa` vem da ocasiao
 * (ver src/content/ocasioes.js), porque festa infantil e coffee break nao comem
 * igual.
 */
export default function CalculadoraSalgados({ porPessoa = 8, faixa = [6, 10], titulo = 'Quantos salgados eu preciso?' }) {
  const [pessoas, setPessoas] = useState(20)

  const [minimo, maximo] = faixa

  const conta = useMemo(() => {
    const total = pessoas * porPessoa
    // Pacotes de 25: e o passo em que os sabores sao escolhidos, entao
    // arredondar para 25 e o unico arredondamento que vira pedido de verdade.
    const unidades = Math.ceil(total / 25) * 25
    return {
      folgado: pessoas * maximo,
      apertado: pessoas * minimo,
      unidades,
      centos: Math.floor(unidades / 100),
      resto: unidades % 100,
    }
  }, [pessoas, porPessoa, minimo, maximo])

  const ajustar = (delta) => setPessoas(p => Math.min(500, Math.max(1, p + delta)))

  return (
    <div className="bg-secondary dots-sun border-[3px] border-brown shadow-[6px_6px_0_#5d2b04] p-6 md:p-8">
      <h2 className="font-display text-3xl md:text-4xl font-black uppercase leading-none text-brown mb-2">
        {titulo}
      </h2>
      <p className="text-brown/80 font-medium mb-6">
        Diga quantas pessoas e a gente faz a conta.
      </p>

      <label htmlFor="calc-pessoas" className="block font-display font-extrabold uppercase text-sm tracking-[0.1em] text-brown mb-2">
        Número de pessoas
      </label>

      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => ajustar(-5)}
          aria-label="Diminuir cinco pessoas"
          className="flex items-center justify-center size-11 shrink-0 bg-cream border-2 border-brown text-brown shadow-[3px_3px_0_#5d2b04] hover:bg-brand active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0_#5d2b04] transition-[background-color,transform,box-shadow] duration-[--duration-fast] ease-[--ease-interaction] cursor-pointer"
        >
          <HiMinus size={18} />
        </button>

        <input
          id="calc-pessoas"
          type="number"
          min={1}
          max={500}
          value={pessoas}
          onChange={e => {
            const n = Number(e.target.value)
            // Campo vazio vira NaN; manter o valor anterior evita a calculadora
            // piscar "0 salgados" enquanto a pessoa apaga para redigitar.
            if (Number.isFinite(n)) setPessoas(Math.min(500, Math.max(1, n)))
          }}
          className="w-full text-center font-display text-4xl font-black text-brown bg-cream border-2 border-brown px-3 py-2 outline-none focus:border-festa shadow-[3px_3px_0_#5d2b04] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />

        <button
          type="button"
          onClick={() => ajustar(5)}
          aria-label="Aumentar cinco pessoas"
          className="flex items-center justify-center size-11 shrink-0 bg-cream border-2 border-brown text-brown shadow-[3px_3px_0_#5d2b04] hover:bg-brand active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0_#5d2b04] transition-[background-color,transform,box-shadow] duration-[--duration-fast] ease-[--ease-interaction] cursor-pointer"
        >
          <HiPlus size={18} />
        </button>
      </div>

      <div className="bg-cream border-2 border-brown shadow-[4px_4px_0_#5d2b04] p-5 mb-5">
        <p className="font-display font-extrabold uppercase text-xs tracking-[0.12em] text-primary mb-1">
          Peça aproximadamente
        </p>
        {/* aria-live: quem usa leitor de tela mexe no campo e precisa ouvir o
            resultado mudar, senao a calculadora e um numero que so existe na tela. */}
        <p aria-live="polite" className="font-display text-5xl md:text-6xl font-black uppercase leading-none text-brown">
          {conta.unidades} salgados
        </p>
        <p className="text-text-light text-sm mt-2 leading-relaxed">
          {descreverPacotes(conta)} · Entre {conta.apertado} e {conta.folgado} unidades dependendo
          do que mais for servido na mesa.
        </p>
      </div>

      <Link to="/cardapio" className="no-underline">
        <Button size="lg" className="w-full gap-2">
          Montar esse pedido
          <HiArrowRight size={18} />
        </Button>
      </Link>
    </div>
  )
}

/** "2 centos e mais 50" -- o jeito como o cliente fala, nao "250 unidades". */
function descreverPacotes({ centos, resto }) {
  const partes = []
  if (centos === 1) partes.push('1 cento')
  else if (centos > 1) partes.push(`${centos} centos`)
  if (resto === 50) partes.push('meio cento')
  else if (resto > 0) partes.push(`${resto} salgados`)
  if (partes.length === 0) return 'Menos de um pacote fechado'
  return partes.join(' e ')
}
