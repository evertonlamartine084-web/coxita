import { useState } from 'react'
import toast from 'react-hot-toast'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import { criarReposicao } from '../../services/orders'

const MOTIVOS_REPOSICAO = [
  'Muito óleo nos salgados',
  'Sabor errado ou faltando',
  'Quantidade errada',
  'Chegou frio',
  'Atrasou',
  'Massa ou recheio com problema',
]

/**
 * Reposição: refaz, sem cobrança, o que saiu com problema no pedido. Escolhe os itens (com a
 * quantidade) e o motivo; o pedido novo vai para a cozinha como qualquer outro, a R$ 0,00
 * (supabase/reposicao.sql).
 */
export default function ReposicaoModal({ pedido, aberto, aoFechar, aoCriar }) {
  const itens = pedido?.order_items ?? []
  const [escolha, setEscolha] = useState({}) // item_id -> { usar, quantity }
  const [motivo, setMotivo] = useState(MOTIVOS_REPOSICAO[0])
  const [outro, setOutro] = useState('')
  const [salvando, setSalvando] = useState(false)

  if (!aberto || !pedido) return null

  const da = (it) => escolha[it.id] ?? { usar: true, quantity: it.quantity }
  const mudar = (it, campo, valor) => setEscolha(e => ({ ...e, [it.id]: { ...da(it), [campo]: valor } }))
  const marcados = itens.filter(it => da(it).usar)

  const salvar = async () => {
    const texto = motivo === 'outro' ? outro.trim() : motivo
    if (!texto) return toast.error('Diga o motivo da reposição.')
    if (!marcados.length) return toast.error('Marque ao menos um item para repor.')
    if (!confirm(`Criar a reposição de ${marcados.length} ${marcados.length === 1 ? 'item' : 'itens'} para ${pedido.customer_name}, sem cobrança? Ela vai para a cozinha e baixa o estoque.`)) return
    setSalvando(true)
    try {
      const novo = await criarReposicao(pedido.id, texto, marcados.map(it => ({ item_id: it.id, quantity: da(it).quantity })))
      toast.success(`Reposição #${novo.order_number} criada e enviada para a cozinha.`)
      setEscolha({})
      aoCriar?.(novo)
      aoFechar()
    } catch (e) {
      toast.error(e.message || 'Não foi possível criar a reposição.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal isOpen={aberto} onClose={aoFechar} title={`Reposição do pedido #${pedido.order_number}`}>
      <div className="space-y-4 text-sm">
        <p className="text-text-light">
          Cria um pedido novo, <strong>sem cobrança</strong>, com os mesmos dados de {pedido.customer_name}. Ele sai na
          comanda e no grupo como qualquer pedido, baixa o estoque e entra em <strong>Perdas e reposições</strong> no Dashboard.
        </p>

        <div>
          <p className="mb-2 font-semibold">O que vai ser refeito?</p>
          <ul className="space-y-2">
            {itens.map(it => (
              <li key={it.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                <input type="checkbox" checked={da(it).usar} onChange={e => mudar(it, 'usar', e.target.checked)} className="size-4" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{it.product_name}</p>
                  {it.order_item_flavors?.length > 0 && (
                    <p className="text-xs text-text-light">{it.order_item_flavors.map(f => `${f.quantity}x ${f.flavor_name}`).join(', ')}</p>
                  )}
                </div>
                {it.quantity > 1 && (
                  <label className="flex items-center gap-1 text-xs">
                    qtd
                    <input type="number" min="1" max={it.quantity} value={da(it).quantity}
                      onChange={e => mudar(it, 'quantity', Math.min(it.quantity, Math.max(1, Number(e.target.value) || 1)))}
                      className="w-14 rounded border border-gray-200 px-1 py-0.5 text-center" />
                  </label>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-2 font-semibold">Motivo</p>
          <div className="flex flex-wrap gap-2">
            {[...MOTIVOS_REPOSICAO, 'outro'].map(m => (
              <button key={m} type="button" onClick={() => setMotivo(m)}
                className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${
                  motivo === m ? 'bg-red-100 text-red-800 ring-red-300' : 'bg-white text-text-light ring-gray-200 hover:bg-gray-50'
                }`}>
                {m === 'outro' ? 'Outro motivo' : m}
              </button>
            ))}
          </div>
          {motivo === 'outro' && (
            <input value={outro} onChange={e => setOutro(e.target.value)} placeholder="Qual foi o problema?"
              className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2" />
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={aoFechar}>Cancelar</Button>
          <Button size="sm" onClick={salvar} disabled={salvando}>{salvando ? 'Criando…' : 'Criar reposição'}</Button>
        </div>
      </div>
    </Modal>
  )
}
