import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FaWhatsapp } from 'react-icons/fa'
import { supabase } from '../../services/supabase'
import Loading from '../../components/ui/Loading'
import { Bloco, Cartao } from '../../components/hub/HubUi'
import FluxoPosVenda from '../../components/hub/FluxoPosVenda'
import ContatosDoZap from '../../components/hub/ContatosDoZap'
import { formatCurrency, formatPercent } from '../../utils/format'
import { linkZap } from '../../utils/hub'
import { VARIAVEIS_CARRINHO, mensagemDeCarrinho, STATUS_CARRINHO } from '../../utils/crm'

/**
 * CRM: fluxos de mensagem automática no WhatsApp. Quem manda é o painel do PC da loja (pela
 * Evolution); aqui se liga, ajusta o texto e acompanha o resultado. O primeiro fluxo é o
 * carrinho abandonado (supabase/crm.sql).
 */

const EXEMPLO = {
  id: '00000000-0000-0000-0000-000000000000',
  nome: 'Maria Souza',
  subtotal: 72.9,
  itens: [
    { quantity: 1, name: 'Cento de Salgados', flavors: [{ quantity: 50, name: 'Coxinha' }, { quantity: 50, name: 'Bolinha de queijo' }] },
    { quantity: 1, name: 'Refrigerante 2L' },
  ],
}

const PROXIMOS = [
  { nome: 'Cliente sumido', explica: 'Quem comprou 2+ vezes e está há 30 dias sem pedir recebe um “sentimos sua falta”, com cupom.' },
  { nome: 'Festa de novo', explica: 'Quem comprou cento para festa é lembrado perto da mesma data, um ano depois.' },
]

export default function HubCrm() {
  const { periodo } = useOutletContext()
  const [fluxo, setFluxo] = useState(null)
  const [rascunho, setRascunho] = useState(null)
  const [carrinhos, setCarrinhos] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [aba, setAba] = useState('carrinho')

  const carregar = useCallback(async () => {
    // põe os status em dia (comprou sozinho / recuperado) antes de ler
    await supabase.rpc('crm_carrinhos_devidos')
    const [{ data: f, error: e1 }, { data: c, error: e2 }] = await Promise.all([
      supabase.from('crm_fluxos').select('*').eq('id', 'carrinho_abandonado').single(),
      supabase.from('carrinhos')
        .select('*, recuperado:orders!carrinhos_recuperado_pedido_id_fkey(order_number, total), fechou:orders!carrinhos_pedido_id_fkey(order_number, total)')
        .gte('criado_em', periodo.ini.toISOString())
        .order('criado_em', { ascending: false }),
    ])
    if (e1 || e2) { toast.error((e1 || e2).message); return }
    setFluxo(f)
    setRascunho(r => r ?? { ...f.config })
    setCarrinhos(c ?? [])
  }, [periodo])

  useEffect(() => { carregar() }, [carregar])

  const numeros = useMemo(() => {
    if (!carrinhos) return null
    const conta = (s) => carrinhos.filter(c => c.status === s).length
    const recuperados = carrinhos.filter(c => c.status === 'recuperado')
    const avisados = conta('avisado') + recuperados.length
    return {
      capturados: carrinhos.length,
      sozinhos: conta('convertido'),
      avisados,
      recuperados: recuperados.length,
      valor: recuperados.reduce((s, c) => s + Number(c.recuperado?.total || 0), 0),
      emAberto: carrinhos.filter(c => c.status === 'aberto').reduce((s, c) => s + Number(c.subtotal), 0),
    }
  }, [carrinhos])

  const seletor = (
    <div className="flex flex-wrap gap-2">
      {[['carrinho', '🛒 Carrinho abandonado'], ['pos_venda', '💛 Pós-venda'], ['contatos', '📇 Contatos do Zap']].map(([k, rotulo]) => (
        <button key={k} type="button" onClick={() => setAba(k)}
          className={`cursor-pointer rounded-xl px-4 py-2 text-sm font-bold ring-1 ${
            aba === k ? 'bg-primary text-white ring-primary' : 'bg-white text-text ring-border hover:bg-cream'
          }`}>
          {rotulo}
        </button>
      ))}
    </div>
  )

  if (aba === 'contatos') {
    return <div className="space-y-5">{seletor}<ContatosDoZap /></div>
  }

  if (aba === 'pos_venda') {
    return <div className="space-y-5">{seletor}<FluxoPosVenda periodo={periodo} /></div>
  }

  if (!fluxo || !rascunho || !numeros) return <Loading />

  const salvar = async (mudancas = {}) => {
    setSalvando(true)
    try {
      const novo = { config: rascunho, atualizado_em: new Date().toISOString(), ...mudancas }
      const { data, error } = await supabase.from('crm_fluxos').update(novo).eq('id', fluxo.id).select().single()
      if (error) throw error
      setFluxo(data)
      toast.success('ativo' in mudancas ? (mudancas.ativo ? 'Fluxo ligado. O painel da loja começa a mandar.' : 'Fluxo desligado.') : 'Fluxo salvo.')
    } catch (e) {
      toast.error(e.message || 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  const mudar = (campo, valor) => setRascunho(r => ({ ...r, [campo]: valor }))
  const alterado = JSON.stringify(rascunho) !== JSON.stringify(fluxo.config)
  const exemplo = carrinhos.find(c => c.itens?.length) ?? EXEMPLO

  return (
    <div className="space-y-5">
      {seletor}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cartao titulo="Carrinhos guardados" valor={numeros.capturados} detalhe={`${numeros.sozinhos} compraram sem mensagem`} />
        <Cartao titulo="Mensagens enviadas" valor={numeros.avisados} />
        <Cartao
          titulo="Recuperados"
          valor={numeros.recuperados}
          detalhe={numeros.avisados ? `${formatPercent((numeros.recuperados / numeros.avisados) * 100, 0)} das mensagens` : null}
          destaque
        />
        <Cartao titulo="Vendas recuperadas" valor={formatCurrency(numeros.valor)} detalhe={numeros.emAberto ? `${formatCurrency(numeros.emAberto)} esperando` : null} />
      </div>

      <Bloco
        titulo="🛒 Carrinho abandonado"
        subtitulo="Quem digitou o telefone no checkout e não fechou o pedido (ou não pagou o Pix/cartão on-line) recebe uma mensagem no WhatsApp. No máximo 1 por pessoa a cada 7 dias."
        acao={
          <button
            type="button"
            disabled={salvando}
            onClick={() => salvar({ ativo: !fluxo.ativo })}
            className={`cursor-pointer rounded-full px-4 py-2 text-sm font-bold ring-1 disabled:opacity-60 ${
              fluxo.ativo ? 'bg-green-600 text-white ring-green-700 hover:bg-green-700' : 'bg-white text-text-light ring-border hover:bg-cream'
            }`}
          >
            {fluxo.ativo ? '● Ligado' : '○ Desligado'}
          </button>
        }
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-3">
              <label>
                <span className="mb-1 block text-xs text-text-light">Esperar (minutos)</span>
                <input type="number" min="15" max="1440" value={rascunho.espera_min}
                  onChange={e => mudar('espera_min', Number(e.target.value) || 60)}
                  className="w-24 rounded-lg border border-border px-2 py-1.5" />
              </label>
              <label>
                <span className="mb-1 block text-xs text-text-light">Mandar das</span>
                <input type="number" min="0" max="23" value={rascunho.hora_inicio}
                  onChange={e => mudar('hora_inicio', Number(e.target.value))}
                  className="w-16 rounded-lg border border-border px-2 py-1.5" />
              </label>
              <label>
                <span className="mb-1 block text-xs text-text-light">até as (h)</span>
                <input type="number" min="1" max="24" value={rascunho.hora_fim}
                  onChange={e => mudar('hora_fim', Number(e.target.value))}
                  className="w-16 rounded-lg border border-border px-2 py-1.5" />
              </label>
              <label>
                <span className="mb-1 block text-xs text-text-light">Cupom (opcional)</span>
                <input value={rascunho.cupom} onChange={e => mudar('cupom', e.target.value.toUpperCase())} placeholder="VOLTA10"
                  className="w-28 rounded-lg border border-border px-2 py-1.5" />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs text-text-light">Mensagem</span>
              <textarea rows={10} value={rascunho.mensagem} onChange={e => mudar('mensagem', e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 font-mono text-xs leading-relaxed" />
            </label>
            <p className="text-xs text-text-light">
              {VARIAVEIS_CARRINHO.map(v => <span key={v.chave} className="mr-3 inline-block"><code className="font-semibold text-brown">{v.chave}</code> {v.explica}</span>)}
            </p>
            {rascunho.cupom && !rascunho.mensagem.includes('{cupom}') && (
              <p className="text-xs text-amber-700">O cupom só aparece se a mensagem tiver {'{cupom}'}. Ele precisa existir em Cupons no painel.</p>
            )}
            <p className="text-xs text-text-light">
              Carrinho que passa da hora de envio espera o próximo horário; depois de 24 h ele não é mais enviado.
            </p>
            <div className="flex gap-2">
              <button type="button" disabled={!alterado || salvando} onClick={() => salvar()}
                className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50">
                Salvar mensagem
              </button>
              {alterado && (
                <button type="button" onClick={() => setRascunho({ ...fluxo.config })} className="cursor-pointer text-xs text-text-light hover:underline">
                  Desfazer
                </button>
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-light">
              Como chega no WhatsApp {exemplo === EXEMPLO ? '(exemplo)' : `(carrinho de ${exemplo.nome || 'cliente'})`}
            </p>
            <div className="rounded-2xl bg-[#e5ddd5] p-4">
              <div className="ml-auto max-w-[92%] whitespace-pre-wrap rounded-xl rounded-tr-none bg-[#dcf8c6] px-3 py-2 text-sm shadow-sm">
                {mensagemDeCarrinho(exemplo, rascunho)}
              </div>
            </div>
          </div>
        </div>
      </Bloco>

      <Bloco titulo="Carrinhos do período" subtitulo="Do mais novo para o mais antigo.">
        {carrinhos.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-text-light">
                  <th className="py-1.5">Quando</th><th>Cliente</th><th>Itens</th><th className="text-right">Valor</th><th>Situação</th><th />
                </tr>
              </thead>
              <tbody>
                {carrinhos.map(c => {
                  const st = STATUS_CARRINHO[c.status] ?? { rotulo: c.status, cor: '' }
                  const pedido = c.recuperado ?? c.fechou
                  const zap = linkZap(c.telefone)
                  return (
                    <tr key={c.id} className="border-t border-border align-top">
                      <td className="py-2 text-xs tabular-nums">
                        {new Date(c.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2">
                        <span className="font-semibold">{c.nome || '—'}</span>
                        <span className="block text-xs text-text-light">{c.telefone}</span>
                      </td>
                      <td className="max-w-[260px] py-2 text-xs text-text-light">
                        {(c.itens ?? []).map(i => `${i.quantity}x ${i.name}`).join(', ')}
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatCurrency(c.subtotal)}</td>
                      <td className="py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.cor}`}>{st.rotulo}</span>
                        {pedido && <span className="block pt-0.5 text-xs text-text-light">pedido #{pedido.order_number} · {formatCurrency(pedido.total)}</span>}
                        {c.motivo && <span className="block pt-0.5 text-xs text-text-light">{c.motivo}</span>}
                        {c.avisado_em && <span className="block pt-0.5 text-xs text-text-light">msg {new Date(c.avisado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
                      </td>
                      <td className="py-2 text-right">
                        {zap && (
                          <a href={zap} target="_blank" rel="noreferrer" title="Abrir conversa"
                            className="inline-flex items-center rounded-full bg-green-600 p-1.5 text-white no-underline hover:bg-green-700">
                            <FaWhatsapp />
                          </a>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-text-light">
            Nenhum carrinho guardado no período. Eles começam a aparecer quando alguém digita o telefone no checkout do site.
          </p>
        )}
      </Bloco>

      <Bloco titulo="Próximos fluxos" subtitulo="Ideias na fila, usando a mesma estrutura.">
        <ul className="grid gap-3 md:grid-cols-3">
          {PROXIMOS.map(p => (
            <li key={p.nome} className="rounded-xl border border-dashed border-border p-3 text-sm">
              <p className="font-semibold text-brown">{p.nome}</p>
              <p className="mt-1 text-xs text-text-light">{p.explica}</p>
            </li>
          ))}
        </ul>
      </Bloco>
    </div>
  )
}
