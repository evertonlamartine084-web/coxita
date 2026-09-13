import { useEffect, useMemo, useState } from 'react'
import { HiCheck, HiExclamation } from 'react-icons/hi'
import { getFaixas, getTabela, salvarCelula, getPacotesDaGrade, aplicarFaixa } from '../../services/precos'
import Button from '../../components/ui/Button'
import Loading from '../../components/ui/Loading'
import { formatCurrency } from '../../utils/format'
import toast from 'react-hot-toast'

const TAMANHOS = [50, 100, 200]

/**
 * A grade de preços da cozinha, editável.
 *
 * Duas coisas numa tela só, porque na cabeça de quem vende elas são a mesma:
 * quanto custa cada tamanho em cada margem, e qual margem o cardápio está
 * praticando hoje. Trocar de 30% para 25% é um botão -- e o botão diz, antes,
 * quantos pacotes vai mexer e quanto cada um vai passar a custar.
 */
export default function PrecosPage() {
  const [faixas, setFaixas] = useState([])
  const [tabela, setTabela] = useState([])
  const [pacotes, setPacotes] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [aplicando, setAplicando] = useState(null)

  const carregar = () => {
    setCarregando(true)
    Promise.all([getFaixas(), getTabela(), getPacotesDaGrade()])
      .then(([f, t, p]) => { setFaixas(f); setTabela(t); setPacotes(p) })
      .catch(erro => { console.error(erro); toast.error('Não consegui carregar a tabela.') })
      .finally(() => setCarregando(false))
  }

  useEffect(carregar, [])

  const celula = (tier, pack) => tabela.find(l => l.tier === tier && l.pack_size === pack)

  // Pastel e bebida não entram: a grade é de 50/100/200 com preço por tamanho.
  const daFaixa = tier => pacotes.filter(p => p.price_tier === tier)

  // Trocar a margem do cardápio frito é mover os pacotes de uma faixa para a
  // outra, então o alvo do botão são os pacotes que hoje estão em qualquer
  // faixa "frito".
  const fritos = useMemo(
    () => pacotes.filter(p => (p.price_tier ?? '').startsWith('frito_')),
    [pacotes],
  )

  const editarCelula = (tier, pack, campo, valor) => {
    setTabela(atual => atual.map(l =>
      l.tier === tier && l.pack_size === pack ? { ...l, [campo]: valor } : l
    ))
  }

  const gravarCelula = async (tier, pack) => {
    const linha = celula(tier, pack)
    if (!linha) return
    const price = Number(String(linha.price).replace(',', '.'))
    const cash = Number(String(linha.cash_price).replace(',', '.'))
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(cash) || cash <= 0) {
      toast.error('Valor inválido.')
      return carregar()
    }
    if (cash > price) {
      toast.error('O preço do pix não pode ser maior que o do cartão.')
      return carregar()
    }
    setSalvando(true)
    try {
      await salvarCelula({ tier, pack_size: pack, price, cash_price: cash })
    } catch (erro) {
      console.error(erro)
      toast.error('Não consegui salvar.')
      carregar()
    } finally {
      setSalvando(false)
    }
  }

  const aplicar = async (tier, alvos) => {
    if (!alvos.length) return
    setAplicando(tier)
    try {
      const n = await aplicarFaixa(tier, tabela, alvos)
      toast.success(`${n} ${n === 1 ? 'pacote atualizado' : 'pacotes atualizados'}.`)
      carregar()
    } catch (erro) {
      console.error(erro)
      toast.error('Não consegui aplicar.')
    } finally {
      setAplicando(null)
    }
  }

  if (carregando) return <Loading />

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tabela de preços</h1>
        <p className="text-sm text-gray-500 mt-1">
          O valor de cada tamanho em cada margem. Editar aqui não mexe no cardápio:
          o preço só muda quando você aplica.
        </p>
      </div>

      {/* A grade */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-2 pr-4 font-medium">Faixa</th>
              <th className="py-2 pr-4 font-medium"></th>
              {TAMANHOS.map(t => (
                <th key={t} className="py-2 pr-4 font-medium text-right">{t} un</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {faixas.map(faixa => (
              ['price', 'cash_price'].map((campo, i) => (
                <tr key={`${faixa.slug}-${campo}`} className={i === 0 ? 'border-t border-gray-200' : ''}>
                  {i === 0 && (
                    <td rowSpan={2} className="py-2 pr-4 align-top">
                      <div className="font-semibold text-gray-900">{faixa.label}</div>
                      {faixa.descricao && (
                        <div className="text-xs text-gray-500">{faixa.descricao}</div>
                      )}
                      <div className="text-xs text-gray-400 mt-1">
                        {daFaixa(faixa.slug).length} pacote(s) nesta faixa
                      </div>
                    </td>
                  )}
                  <td className="py-1 pr-4 text-gray-500 whitespace-nowrap">
                    {campo === 'price' ? 'cartão/débito' : 'pix/espécie'}
                  </td>
                  {TAMANHOS.map(pack => {
                    const linha = celula(faixa.slug, pack)
                    return (
                      <td key={pack} className="py-1 pr-4 text-right">
                        <input
                          type="text"
                          inputMode="decimal"
                          disabled={salvando}
                          value={linha?.[campo] ?? ''}
                          onChange={e => editarCelula(faixa.slug, pack, campo, e.target.value)}
                          onBlur={() => gravarCelula(faixa.slug, pack)}
                          className="w-24 text-right rounded-md border border-gray-300 px-2 py-1
                                     focus:border-gray-900 focus:outline-none disabled:opacity-50"
                        />
                      </td>
                    )
                  })}
                </tr>
              ))
            ))}
          </tbody>
        </table>
      </div>

      {/* Os botões: trocar a margem do cardápio frito */}
      <div className="rounded-lg border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900">Margem do cardápio frito</h2>
        <p className="text-sm text-gray-500 mt-1">
          Vale para os {fritos.length} pacotes de salgado e doce. Congelado tem faixa
          própria e não muda aqui.
        </p>

        <div className="flex flex-wrap gap-3 mt-4">
          {faixas.filter(f => f.slug.startsWith('frito_')).map(faixa => {
            const ativa = fritos.length > 0 && fritos.every(p => p.price_tier === faixa.slug)
            return (
              <button
                key={faixa.slug}
                onClick={() => aplicar(faixa.slug, fritos)}
                disabled={aplicando !== null || fritos.length === 0}
                className={`flex items-center gap-2 rounded-lg border-2 px-4 py-3 text-left transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${ativa ? 'border-green-600 bg-green-50' : 'border-gray-300 hover:border-gray-900'}`}
              >
                {ativa && <HiCheck className="text-green-600 shrink-0" size={18} />}
                <span>
                  <span className="block font-semibold text-gray-900">{faixa.label}</span>
                  <span className="block text-xs text-gray-500">
                    {TAMANHOS.map(t => {
                      const l = celula(faixa.slug, t)
                      return l ? `${t}: ${formatCurrency(Number(l.price))}` : null
                    }).filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            )
          })}

          {faixas.filter(f => !f.slug.startsWith('frito_')).map(faixa => (
            <button
              key={faixa.slug}
              onClick={() => aplicar(faixa.slug, daFaixa(faixa.slug))}
              disabled={aplicando !== null || daFaixa(faixa.slug).length === 0}
              className="flex items-center gap-2 rounded-lg border-2 border-gray-300 px-4 py-3
                         text-left hover:border-gray-900 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>
                <span className="block font-semibold text-gray-900">
                  Reaplicar {faixa.label.toLowerCase()}
                </span>
                <span className="block text-xs text-gray-500">
                  {daFaixa(faixa.slug).length} pacote(s)
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* O que está valendo agora */}
      <div>
        <h2 className="font-semibold text-gray-900 mb-3">Pacotes do cardápio</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-4 font-medium">Pacote</th>
                <th className="py-2 pr-4 font-medium">Faixa</th>
                <th className="py-2 pr-4 font-medium text-right">Cartão</th>
                <th className="py-2 pr-4 font-medium text-right">Pix</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {pacotes.map(p => {
                const linha = p.price_tier ? celula(p.price_tier, p.pack_size) : null
                const fora = linha && (
                  Number(linha.price) !== Number(p.price) ||
                  Number(linha.cash_price) !== Number(p.cash_price)
                )
                return (
                  <tr key={p.id} className="border-b border-gray-100">
                    <td className="py-2 pr-4">
                      <span className={p.active ? '' : 'text-gray-400 line-through'}>{p.name}</span>
                      <span className="text-gray-400 text-xs ml-2">{p.categories?.name}</span>
                    </td>
                    <td className="py-2 pr-4 text-gray-500">
                      {faixas.find(f => f.slug === p.price_tier)?.label ?? '—'}
                    </td>
                    <td className="py-2 pr-4 text-right">{formatCurrency(Number(p.price))}</td>
                    <td className="py-2 pr-4 text-right">
                      {p.cash_price ? formatCurrency(Number(p.cash_price)) : '—'}
                    </td>
                    <td className="py-2">
                      {fora && (
                        <span className="flex items-center gap-1 text-amber-600 text-xs whitespace-nowrap">
                          <HiExclamation size={14} /> fora da tabela
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          &quot;Fora da tabela&quot; é o pacote cujo preço não bate com a faixa dele — porque
          alguém editou o produto direto, ou porque a grade mudou e ninguém aplicou.
        </p>
      </div>

      <Button variant="secondary" onClick={carregar} disabled={aplicando !== null}>
        Recarregar
      </Button>
    </div>
  )
}
