import { useEffect, useState } from 'react'
import { HiPlus, HiMinus, HiExclamation, HiClock } from 'react-icons/hi'
import { getEstoque, registrarMovimento, definirMinimo, getMovimentos } from '../../services/estoque'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Loading from '../../components/ui/Loading'
import { catalogText } from '../../utils/catalogText'
import toast from 'react-hot-toast'

const GRUPO = { salgados: 'Salgados', pasteis: 'Pastéis', doces: 'Doces' }

// A cozinha embala de 50 em 50 e conta pacote, nao unidade: pedir "quantas
// unidades" obrigava a multiplicar de cabeca a cada lancamento. O saldo
// continua em unidade, que e como o pedido da baixa.
const POR_PACOTE = 50

const emUnidades = (pacotes, soltas) =>
  (parseInt(pacotes, 10) || 0) * POR_PACOTE + (parseInt(soltas, 10) || 0)

/** "8 pacotes + 20" — como a cozinha le o freezer. */
function emPacotes(unidades) {
  const pacotes = Math.floor(unidades / POR_PACOTE)
  const soltas = unidades % POR_PACOTE
  if (unidades === 0) return null
  if (!pacotes) return `${soltas} solta${soltas === 1 ? '' : 's'}`
  return `${pacotes} pacote${pacotes === 1 ? '' : 's'}${soltas ? ` + ${soltas}` : ''}`
}

const MOTIVOS = [
  { id: 'producao', label: 'Fritei mais', sinal: 1 },
  { id: 'perda', label: 'Perda', sinal: -1 },
  { id: 'ajuste', label: 'Contagem do freezer', sinal: 0 },
]

/**
 * Quanto tem de cada sabor pronto no freezer.
 *
 * O saldo cai sozinho quando entra pedido -- é gatilho no banco, não conta de
 * tela. Aqui é onde a cozinha lança o que fritou, o que perdeu, e o que a
 * contagem de verdade encontrou quando os dois números discordam.
 */
export default function EstoquePage() {
  const [linhas, setLinhas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [modal, setModal] = useState(null)      // { linha, motivo }
  const [pacotes, setPacotes] = useState('')
  const [soltas, setSoltas] = useState('')
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [historico, setHistorico] = useState(null)

  const carregar = () => {
    setCarregando(true)
    getEstoque()
      .then(setLinhas)
      .catch(erro => { console.error(erro); toast.error('Não consegui carregar o estoque.') })
      .finally(() => setCarregando(false))
  }

  useEffect(carregar, [])

  const abrir = (linha, motivo) => {
    setModal({ linha, motivo })
    setPacotes('')
    setSoltas('')
    setObservacao('')
  }

  // Contagem aceita zero (o freezer acabou); producao e perda, nao.
  const motivoVazio = ({ motivo }) => motivo.id !== 'ajuste'

  const confirmar = async (e) => {
    e.preventDefault()
    const n = emUnidades(pacotes, soltas)
    if (!Number.isFinite(n) || n < 0) return toast.error('Quantidade inválida.')
    if (n === 0 && motivoVazio(modal)) return toast.error('Informe a quantidade.')

    const { linha, motivo } = modal
    // Contagem não soma: ela diz quanto TEM, e o movimento é a diferença.
    const delta = motivo.id === 'ajuste' ? n - linha.quantidade : motivo.sinal * n
    if (delta === 0) { setModal(null); return toast.success('Estoque já estava nesse número.') }

    setSalvando(true)
    try {
      await registrarMovimento({
        flavor_id: linha.flavor_id,
        delta,
        motivo: motivo.id,
        observacao: observacao.trim() || null,
      })
      toast.success(`${linha.nome}: ${delta > 0 ? '+' : ''}${delta} un.`)
      setModal(null)
      carregar()
    } catch (erro) {
      console.error(erro)
      toast.error('Não consegui lançar o movimento.')
    } finally {
      setSalvando(false)
    }
  }

  const mudarMinimo = async (linha, valor) => {
    const n = parseInt(valor, 10)
    if (!Number.isFinite(n) || n < 0 || n === linha.minimo) return
    try {
      await definirMinimo(linha.flavor_id, n)
      carregar()
    } catch {
      toast.error('Não consegui salvar o mínimo.')
    }
  }

  const verHistorico = async (linha) => {
    try {
      const movs = await getMovimentos(linha.flavor_id)
      setHistorico({ linha, movs })
    } catch {
      toast.error('Não consegui carregar o histórico.')
    }
  }

  if (carregando) return <Loading />

  const acabando = linhas.filter(l => l.quantidade <= l.minimo)
  const grupos = [...new Set(linhas.map(l => l.grupo))]

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Estoque</h1>
        <Button variant="secondary" onClick={carregar}>Atualizar</Button>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Unidades prontas no freezer, por sabor. Pedido dá baixa sozinho; cancelamento devolve.
      </p>

      {acabando.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 mb-6">
          <HiExclamation className="text-amber-600 shrink-0 mt-0.5" size={18} />
          <p className="text-sm text-amber-900">
            <strong>{acabando.length}</strong>{' '}
            {acabando.length === 1 ? 'sabor no mínimo ou abaixo' : 'sabores no mínimo ou abaixo'}:{' '}
            {acabando.map(l => catalogText(l.nome)).join(', ')}.
          </p>
        </div>
      )}

      {grupos.map(grupo => (
        <div key={grupo} className="mb-8">
          <h2 className="font-semibold text-gray-900 mb-3">{GRUPO[grupo] ?? grupo}</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Sabor</th>
                  <th className="text-right px-4 py-3 font-medium">No freezer</th>
                  <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">Avisar em</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {linhas.filter(l => l.grupo === grupo).map(l => {
                  const baixo = l.quantidade <= l.minimo
                  return (
                    <tr key={l.flavor_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {l.foto
                            ? <img src={l.foto} alt="" className="w-9 h-9 rounded-lg object-cover" />
                            : <div className="w-9 h-9 rounded-lg bg-orange-100" />}
                          <span className="font-medium">{catalogText(l.nome)}</span>
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold tabular-nums ${
                        l.quantidade === 0 ? 'text-red-600' : baixo ? 'text-amber-600' : 'text-gray-900'
                      }`}>
                        {l.quantidade}
                        {l.quantidade === 0
                          ? <span className="ml-1 text-xs font-normal">acabou</span>
                          : <span className="block text-xs font-normal text-gray-400">{emPacotes(l.quantidade)}</span>}
                      </td>
                      <td className="px-4 py-3 text-right hidden sm:table-cell">
                        <input
                          type="number"
                          min="0"
                          defaultValue={l.minimo}
                          onBlur={e => mudarMinimo(l, e.target.value)}
                          className="w-20 text-right rounded-md border border-gray-300 px-2 py-1
                                     focus:border-gray-900 focus:outline-none"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5 justify-end">
                          {MOTIVOS.map(m => (
                            <button
                              key={m.id}
                              onClick={() => abrir(l, m)}
                              title={m.label}
                              className="rounded-md border border-gray-300 px-2 py-1 text-xs
                                         hover:border-gray-900 whitespace-nowrap"
                            >
                              {m.id === 'producao' && <HiPlus className="inline -mt-0.5" size={12} />}
                              {m.id === 'perda' && <HiMinus className="inline -mt-0.5" size={12} />}
                              {' '}{m.label}
                            </button>
                          ))}
                          <button
                            onClick={() => verHistorico(l)}
                            title="Histórico"
                            className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:border-gray-900"
                          >
                            <HiClock className="inline -mt-0.5" size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <Modal
        isOpen={modal !== null}
        onClose={() => setModal(null)}
        title={modal ? `${modal.motivo.label} · ${catalogText(modal.linha.nome)}` : ''}
      >
        {modal && (
          <form onSubmit={confirmar} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {modal.motivo.id === 'ajuste'
                  ? `Quanto tem de verdade no freezer? (o sistema diz ${
                      emPacotes(modal.linha.quantidade) ?? 'nada'})`
                  : 'Quanto?'}
              </label>
              <div className="flex gap-3">
                <div className="flex-1">
                  <input
                    type="number"
                    min="0"
                    autoFocus
                    value={pacotes}
                    onChange={e => setPacotes(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-gray-900 focus:outline-none"
                  />
                  <span className="block text-xs text-gray-500 mt-1">pacotes de {POR_PACOTE}</span>
                </div>
                <div className="flex-1">
                  <input
                    type="number"
                    min="0"
                    value={soltas}
                    onChange={e => setSoltas(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-gray-900 focus:outline-none"
                  />
                  <span className="block text-xs text-gray-500 mt-1">unidades soltas</span>
                </div>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                {emUnidades(pacotes, soltas)} unidades
                {modal.motivo.id === 'ajuste' && emUnidades(pacotes, soltas) !== modal.linha.quantidade && (
                  <span className="text-gray-400">
                    {' · '}
                    {emUnidades(pacotes, soltas) > modal.linha.quantidade ? 'entra ' : 'sai '}
                    {Math.abs(emUnidades(pacotes, soltas) - modal.linha.quantidade)}
                  </span>
                )}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Observação <span className="text-gray-400">(opcional)</span>
              </label>
              <input
                type="text"
                value={observacao}
                onChange={e => setObservacao(e.target.value)}
                placeholder={modal.motivo.id === 'perda' ? 'Ex: queimou na fritura' : ''}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-gray-900 focus:outline-none"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="secondary" onClick={() => setModal(null)}>Cancelar</Button>
              <Button type="submit" disabled={salvando}>{salvando ? 'Lançando...' : 'Lançar'}</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        isOpen={historico !== null}
        onClose={() => setHistorico(null)}
        title={historico ? `Histórico · ${catalogText(historico.linha.nome)}` : ''}
      >
        {historico && (
          historico.movs.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum movimento ainda.</p>
          ) : (
            <ul className="divide-y divide-gray-100 text-sm">
              {historico.movs.map(m => (
                <li key={m.id} className="py-2 flex items-baseline justify-between gap-4">
                  <span>
                    <span className="text-gray-900">{rotuloDoMotivo(m)}</span>
                    {m.observacao && <span className="text-gray-500"> · {m.observacao}</span>}
                    <span className="block text-xs text-gray-400">
                      {new Date(m.created_at).toLocaleString('pt-BR')}
                    </span>
                  </span>
                  <span className={`font-semibold tabular-nums ${m.delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {m.delta > 0 ? '+' : ''}{m.delta}
                  </span>
                </li>
              ))}
            </ul>
          )
        )}
      </Modal>
    </div>
  )
}

function rotuloDoMotivo(m) {
  if (m.motivo === 'pedido') return `Pedido #${m.orders?.order_number ?? '—'}`
  if (m.motivo === 'cancelamento') return `Cancelamento do #${m.orders?.order_number ?? '—'}`
  return { producao: 'Fritei mais', perda: 'Perda', ajuste: 'Contagem do freezer' }[m.motivo] ?? m.motivo
}
