import { useOutletContext } from 'react-router-dom'
import { FaWhatsapp } from 'react-icons/fa'
import Loading from '../../components/ui/Loading'
import { Bloco, Cartao } from '../../components/hub/HubUi'
import { formatCurrency, formatPercent, CANAIS } from '../../utils/format'
import { variacao, linkZap } from '../../utils/hub'

/**
 * Clientes, pelo telefone (o mesmo cliente em pedidos diferentes). Os cartões de cima são de
 * todos os tempos, menos "novos no período". A lista de sumidos é para quem mandar mensagem.
 */
export default function HubClientes() {
  const { vendas, clientes } = useOutletContext()
  if (!vendas || !clientes) return <Loading />
  const { atual: a, anterior: b } = vendas

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cartao titulo="Clientes no total" valor={clientes.total} detalhe="desde a primeira venda" />
        <Cartao
          titulo="Compraram de novo"
          valor={clientes.total ? formatPercent((clientes.recorrentes / clientes.total) * 100, 0) : '—'}
          detalhe={`${clientes.recorrentes} clientes com 2+ pedidos`}
          destaque
        />
        <Cartao titulo="Novos no período" valor={a.novos} variacao={variacao(a.novos, b.novos)} detalhe={`${a.voltaram} já eram clientes`} />
        <Cartao titulo="Sumidos" valor={clientes.sumidos.length} detalhe="2+ pedidos, 30+ dias sem pedir" />
      </div>

      <Bloco titulo="Sumidos: vale mandar mensagem" subtitulo="Já compraram mais de uma vez e estão há mais de 30 dias sem pedir. Do que mais gastou para o que menos.">
        {clientes.sumidos.length
          ? <TabelaClientes lista={clientes.sumidos} mostrarDias />
          : <p className="text-sm text-text-light">Ninguém sumido por enquanto.</p>}
      </Bloco>

      <Bloco titulo="Melhores clientes" subtitulo="Quem mais gastou desde o começo.">
        <TabelaClientes lista={clientes.melhores} />
      </Bloco>
    </div>
  )
}

function TabelaClientes({ lista, mostrarDias = false }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-text-light">
            <th className="py-1.5">Cliente</th><th className="text-right">Pedidos</th><th className="text-right">Gastou</th>
            <th className="text-right">Último pedido</th><th>Canais</th><th />
          </tr>
        </thead>
        <tbody>
          {lista.map(c => {
            const zap = linkZap(c.telefone)
            return (
              <tr key={c.chave} className="border-t border-border">
                <td className="py-2 font-semibold">{c.nome}</td>
                <td className="text-right tabular-nums">{c.pedidos}</td>
                <td className="text-right tabular-nums">{formatCurrency(c.total)}</td>
                <td className="text-right tabular-nums">
                  {c.ultima.toLocaleDateString('pt-BR')}
                  {mostrarDias && <span className="block text-xs text-text-light">há {c.diasSemComprar} dias</span>}
                </td>
                <td className="pl-3 text-xs text-text-light">{[...c.canais].map(k => CANAIS[k]?.rotulo ?? k).join(', ')}</td>
                <td className="text-right">
                  {zap && (
                    <a href={zap} target="_blank" rel="noreferrer" title={`Abrir conversa com ${c.nome}`}
                      className="inline-flex items-center gap-1 rounded-full bg-green-600 px-2.5 py-1 text-xs font-semibold text-white no-underline hover:bg-green-700">
                      <FaWhatsapp /> Zap
                    </a>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
