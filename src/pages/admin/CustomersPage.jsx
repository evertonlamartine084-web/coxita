import { useEffect, useMemo, useState } from 'react'
import { HiSearch, HiDownload, HiPhone } from 'react-icons/hi'
import { getClientes } from '../../services/orders'
import { formatCurrency } from '../../utils/format'
import Loading from '../../components/ui/Loading'

/** (11) 98765-4321 — o banco guarda só os dígitos. */
function formatarTelefone(t) {
  const n = (t || '').replace(/\D/g, '')
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
  return t
}

const data = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')

/** Dias desde o último pedido — é o que mostra quem sumiu. */
function diasDesde(iso) {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 864e5)
}

export default function CustomersPage() {
  const [clientes, setClientes] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState('recentes')

  useEffect(() => {
    getClientes()
      .then(setClientes)
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false))
  }, [])

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const digitos = termo.replace(/\D/g, '')
    let r = clientes.filter((c) => {
      if (!termo) return true
      const nome = (c.nome || '').toLowerCase()
      return nome.includes(termo) || (digitos && (c.telefone || '').includes(digitos))
    })
    r = [...r]
    if (ordem === 'recentes') r.sort((a, b) => new Date(b.ultimo_pedido) - new Date(a.ultimo_pedido))
    if (ordem === 'gastaram') r.sort((a, b) => Number(b.total_gasto) - Number(a.total_gasto))
    if (ordem === 'frequentes') r.sort((a, b) => Number(b.pedidos) - Number(a.pedidos))
    if (ordem === 'sumidos') r.sort((a, b) => new Date(a.ultimo_pedido) - new Date(b.ultimo_pedido))
    return r
  }, [clientes, busca, ordem])

  const totais = useMemo(() => ({
    clientes: clientes.length,
    recorrentes: clientes.filter((c) => Number(c.pedidos) > 1).length,
    receita: clientes.reduce((s, c) => s + Number(c.total_gasto || 0), 0),
  }), [clientes])

  /** CSV com BOM: sem ele o Excel em português abre acento quebrado. */
  const exportarCsv = () => {
    const cabecalho = ['Nome', 'Telefone', 'Pedidos', 'Total gasto', 'Ticket medio', 'Primeiro pedido', 'Ultimo pedido', 'Endereco', 'Bairro']
    const linhas = lista.map((c) => [
      c.nome, formatarTelefone(c.telefone), c.pedidos,
      Number(c.total_gasto).toFixed(2), Number(c.ticket_medio).toFixed(2),
      data(c.primeiro_pedido), data(c.ultimo_pedido), c.endereco || '', c.bairro || '',
    ])
    const escapar = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [cabecalho, ...linhas].map((l) => l.map(escapar).join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clientes-coxelli-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (carregando) return <Loading />

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-gray-500">Quem já pediu, montado a partir dos pedidos</p>
        </div>
        <button
          onClick={exportarCsv}
          disabled={!lista.length}
          className="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
        >
          <HiDownload className="size-4" />
          Exportar CSV
        </button>
      </div>

      {erro && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          Não foi possível carregar: {erro}
        </p>
      )}

      <div className="mb-6 grid grid-cols-3 gap-4">
        <Cartao rotulo="Clientes" valor={totais.clientes} />
        <Cartao rotulo="Voltaram a pedir" valor={totais.recorrentes} nota={totais.clientes ? `${Math.round((totais.recorrentes / totais.clientes) * 100)}% do total` : null} />
        <Cartao rotulo="Receita total" valor={formatCurrency(totais.receita)} />
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <HiSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou telefone"
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <select
          value={ordem}
          onChange={(e) => setOrdem(e.target.value)}
          className="cursor-pointer rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="recentes">Pediram por último</option>
          <option value="gastaram">Gastaram mais</option>
          <option value="frequentes">Pediram mais vezes</option>
          <option value="sumidos">Sumiram há mais tempo</option>
        </select>
      </div>

      {!lista.length ? (
        <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          {clientes.length ? 'Nenhum cliente encontrado para essa busca.' : 'Ainda não há pedidos — os clientes aparecem aqui automaticamente.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="p-3">Cliente</th>
                <th className="p-3">Pedidos</th>
                <th className="p-3">Total</th>
                <th className="p-3">Ticket</th>
                <th className="p-3">Último</th>
                <th className="p-3">Bairro</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => {
                const dias = diasDesde(c.ultimo_pedido)
                return (
                  <tr key={c.telefone} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="p-3">
                      <div className="font-semibold">{c.nome}</div>
                      <div className="text-xs text-gray-500">{formatarTelefone(c.telefone)}</div>
                    </td>
                    <td className="p-3">
                      {c.pedidos}
                      {Number(c.pedidos) > 1 && (
                        <span className="ml-1.5 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                          recorrente
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-semibold">{formatCurrency(Number(c.total_gasto))}</td>
                    <td className="p-3 text-gray-600">{formatCurrency(Number(c.ticket_medio))}</td>
                    <td className="p-3">
                      <div>{data(c.ultimo_pedido)}</div>
                      {dias !== null && (
                        <div className={`text-xs ${dias > 60 ? 'text-danger' : 'text-gray-400'}`}>
                          {dias === 0 ? 'hoje' : `há ${dias} dia${dias > 1 ? 's' : ''}`}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-gray-600">{c.bairro || '—'}</td>
                    <td className="p-3">
                      <a
                        href={`https://wa.me/55${(c.telefone || '').replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Abrir conversa no WhatsApp"
                        className="inline-flex items-center gap-1 text-primary hover:text-primary-dark"
                      >
                        <HiPhone className="size-4" />
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Cartao({ rotulo, valor, nota }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{rotulo}</p>
      <p className="text-2xl font-bold">{valor}</p>
      {nota && <p className="mt-0.5 text-[11px] text-gray-400">{nota}</p>}
    </div>
  )
}
