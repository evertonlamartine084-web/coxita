import { useState } from 'react'
import toast from 'react-hot-toast'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Button from '../ui/Button'
import EditorDeFicha from './EditorDeFicha'
import { createInsumo, updateInsumo, salvarFichaDoRecheio } from '../../services/custos'
import { custoPorInsumo } from '../../utils/margem'
import { formatCurrency, formatCurrencyFine } from '../../utils/format'

const UNIDADES = ['kg', 'g', 'L', 'ml', 'un', 'disco', 'porção']

/**
 * Cadastro de um insumo comprado ou de um recheio produzido.
 *
 * O insumo é lançado como a nota fiscal mostra -- "paguei R$ 11,89 e veio
 * 1 kg" -- e o custo por unidade sai da divisão. Isso é o que faz um aumento
 * de fornecedor se propagar para todas as fichas com um número digitado: o
 * caminho contrário, guardar R$ 0,0119 por grama, obrigaria a recalcular na
 * mão a cada remarcação.
 */
export default function InsumoModal({ insumo, insumos, onClose, onSalvo }) {
  const editando = Boolean(insumo?.id)

  const [form, setForm] = useState({
    name: insumo?.name ?? '',
    kind: insumo?.kind ?? 'insumo',
    unit: insumo?.unit ?? 'kg',
    pack_price: insumo?.pack_price != null ? String(insumo.pack_price) : '',
    pack_quantity: insumo?.pack_quantity != null ? String(insumo.pack_quantity) : '1',
    yield_quantity: insumo?.yield_quantity != null ? String(insumo.yield_quantity) : '',
    note: insumo?.note ?? '',
  })
  const [linhas, setLinhas] = useState(() =>
    (insumo?.supply_recipe_items ?? []).map(l => ({
      child_id: l.child_id,
      quantity: String(l.quantity),
    })),
  )
  const [salvando, setSalvando] = useState(false)

  const alterar = (patch) => setForm(f => ({ ...f, ...patch }))

  const ehRecheio = form.kind === 'recheio'

  // Custo dos itens da ficha do recheio: os outros insumos já resolvidos, mais
  // o rendimento que está sendo digitado agora.
  const custos = custoPorInsumo(insumos)
  const gastoNoLote = linhas.reduce((soma, linha) => {
    const quantidade = Number(linha.quantity)
    if (!linha.child_id || !Number.isFinite(quantidade)) return soma
    return soma + quantidade * (custos.get(linha.child_id) ?? 0)
  }, 0)
  const rendimento = Number(form.yield_quantity)
  const custoDoRecheio = rendimento > 0 ? gastoNoLote / rendimento : 0

  const custoDoInsumo = (() => {
    const preco = Number(form.pack_price)
    const rende = Number(form.pack_quantity)
    return rende > 0 && Number.isFinite(preco) ? preco / rende : 0
  })()

  const submeter = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error('Dê um nome ao item.')
      return
    }
    if (ehRecheio && !(rendimento > 0)) {
      toast.error('Diga quanto o lote rende.')
      return
    }
    if (!ehRecheio && !(Number(form.pack_quantity) > 0)) {
      toast.error('Diga quanto veio na compra.')
      return
    }

    setSalvando(true)
    try {
      const payload = {
        name: form.name.trim(),
        kind: form.kind,
        unit: form.unit.trim() || 'un',
        note: form.note.trim() || null,
        // As colunas da outra natureza vão a null: a constraint do banco
        // recusa recheio com preço de compra e insumo com rendimento.
        pack_price: ehRecheio ? null : Number(form.pack_price) || 0,
        pack_quantity: ehRecheio ? null : Number(form.pack_quantity),
        yield_quantity: ehRecheio ? rendimento : null,
      }

      const salvo = editando
        ? await updateInsumo(insumo.id, payload)
        : await createInsumo(payload)

      if (ehRecheio) await salvarFichaDoRecheio(salvo.id, linhas)

      toast.success(editando ? 'Item atualizado!' : 'Item cadastrado!')
      onSalvo()
      onClose()
    } catch (erro) {
      console.error(erro)
      const duplicado = erro?.code === '23505' || /duplicate key/i.test(erro?.message ?? '')
      toast.error(duplicado ? 'Já existe um item com esse nome.' : 'Erro ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={editando ? `Editar ${insumo.name}` : 'Novo item'}
      size={ehRecheio ? '2xl' : 'lg'}
    >
      <form onSubmit={submeter} className="space-y-4">
        <div className="flex gap-2">
          {[
            { valor: 'insumo', rotulo: 'Comprado', ajuda: 'tem preço de nota' },
            { valor: 'recheio', rotulo: 'Produzido', ajuda: 'tem receita e rendimento' },
          ].map(opcao => (
            <button
              key={opcao.valor}
              type="button"
              onClick={() => alterar({ kind: opcao.valor })}
              className={`flex-1 px-3 py-2 border-2 rounded-xl text-sm font-semibold transition-colors ${
                form.kind === opcao.valor
                  ? 'border-brown bg-secondary text-brown'
                  : 'border-border text-text-light hover:border-brown/40'
              }`}
            >
              {opcao.rotulo}
              <span className="block text-xs font-normal">{opcao.ajuda}</span>
            </button>
          ))}
        </div>

        <Input
          label="Nome"
          value={form.name}
          onChange={(e) => alterar({ name: e.target.value })}
          placeholder={ehRecheio ? 'Ex: Recheio de carne moída' : 'Ex: Massa de pastel'}
        />

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-sm font-semibold text-text-warm mb-1.5 font-display">
              Unidade da ficha
            </span>
            <select
              value={form.unit}
              onChange={(e) => alterar({ unit: e.target.value })}
              className="w-full px-4 py-2.5 border-2 border-border rounded-xl outline-none focus:border-primary text-sm bg-white"
            >
              {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>

          {ehRecheio ? (
            <Input
              label={`Rendimento do lote (${form.unit})`}
              type="number" step="0.000001" min="0"
              value={form.yield_quantity}
              onChange={(e) => alterar({ yield_quantity: e.target.value })}
              placeholder="peso depois de pronto"
            />
          ) : (
            <Input
              label="Quanto você pagou (R$)"
              type="number" step="0.01" min="0"
              value={form.pack_price}
              onChange={(e) => alterar({ pack_price: e.target.value })}
            />
          )}
        </div>

        {!ehRecheio && (
          <div className="grid grid-cols-2 gap-3 items-end">
            <Input
              label={`Quanto veio (${form.unit})`}
              type="number" step="0.000001" min="0"
              value={form.pack_quantity}
              onChange={(e) => alterar({ pack_quantity: e.target.value })}
            />
            <div className="bg-cream border-2 border-border rounded-xl px-3 py-2">
              <span className="block text-xs text-text-light">Custo por {form.unit}</span>
              <strong className="tabular-nums">{formatCurrencyFine(custoDoInsumo, 4)}</strong>
            </div>
          </div>
        )}

        {ehRecheio && (
          <>
            <EditorDeFicha
              linhas={linhas}
              setLinhas={setLinhas}
              insumos={insumos}
              custos={custos}
              campoItem="child_id"
              excluirIds={insumo?.id ? [insumo.id] : []}
            />
            <div className="bg-cream border-2 border-border rounded-xl p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-text-light">Gasto no lote</span>
                <strong className="tabular-nums">{formatCurrency(gastoNoLote)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-text-light">Rende</span>
                <span className="tabular-nums">{form.yield_quantity || '—'} {form.unit}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1">
                <span className="font-semibold">Custo por {form.unit}</span>
                <strong className="tabular-nums">{formatCurrencyFine(custoDoRecheio, 4)}</strong>
              </div>
              <p className="text-xs text-text-light pt-1">
                O rendimento é o peso <em>depois</em> do preparo. Recheio cozido perde água:
                dividir pelo peso que entrou faz o custo do salgado parecer menor do que é.
              </p>
            </div>
          </>
        )}

        <Input
          label="Observação (opcional)"
          value={form.note}
          onChange={(e) => alterar({ note: e.target.value })}
          placeholder="Ex: Atacadão, nota de 03/09"
        />

        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
