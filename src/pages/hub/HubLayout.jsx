import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { HiArrowLeft, HiRefresh } from 'react-icons/hi'
import { supabase } from '../../services/supabase'
import { getOrders } from '../../services/orders'
import { PERIODOS_HUB, calcularPeriodo, calcularVendas, calcularClientes } from '../../utils/hub'

/**
 * Hub da Coxelli (/hub): os números do negócio num lugar só, separado do painel do dia a dia.
 * Vendas e clientes saem dos pedidos do banco; visitas, busca e anúncios vêm da função
 * hub-google (Analytics + Search Console, com cache de 3 h). O período escolhido aqui vale
 * para todas as abas, que recebem tudo pelo contexto do Outlet.
 */

const ABAS = [
  { to: '/hub', label: 'Resumo', end: true },
  { to: '/hub/vendas', label: 'Vendas' },
  { to: '/hub/clientes', label: 'Clientes' },
  { to: '/hub/site', label: 'Site' },
  { to: '/hub/busca', label: 'Google Busca' },
  { to: '/hub/anuncios', label: 'Anúncios' },
  { to: '/hub/crm', label: 'CRM' },
]

const CHAVE_PERIODO = 'coxelli_hub_periodo'

export default function HubLayout() {
  const [periodoKey, setPeriodoKey] = useState(() => {
    try { return localStorage.getItem(CHAVE_PERIODO) || '28d' } catch { return '28d' }
  })
  const [pedidos, setPedidos] = useState(null)
  const [google, setGoogle] = useState(null)
  const [erroPedidos, setErroPedidos] = useState(null)
  const [carregandoGoogle, setCarregandoGoogle] = useState(false)

  const periodo = useMemo(() => calcularPeriodo(periodoKey), [periodoKey])

  useEffect(() => {
    const antes = document.title
    document.title = 'Hub · Coxelli'
    return () => { document.title = antes }
  }, [])

  useEffect(() => {
    getOrders().then(setPedidos).catch(e => setErroPedidos(e.message))
  }, [])

  const buscarGoogle = useCallback(async (atualizar = false) => {
    setCarregandoGoogle(true)
    try {
      const { data, error } = await supabase.functions.invoke('hub-google', {
        body: { inicio: periodo.inicio, fim: periodo.final, antInicio: periodo.antInicio, antFim: periodo.antFinal, atualizar },
      })
      if (error) throw error
      setGoogle(data)
    } catch (e) {
      setGoogle({ erro: e.message || 'Falha ao falar com o Google.' })
    } finally {
      setCarregandoGoogle(false)
    }
  }, [periodo])

  useEffect(() => { buscarGoogle() }, [buscarGoogle])

  const escolher = (key) => {
    setPeriodoKey(key)
    setGoogle(null)
    try { localStorage.setItem(CHAVE_PERIODO, key) } catch { /* sem armazenamento */ }
  }

  const vendas = useMemo(() => (pedidos ? calcularVendas(pedidos, periodo) : null), [pedidos, periodo])
  const clientes = useMemo(() => (pedidos ? calcularClientes(pedidos) : null), [pedidos])

  const contexto = { periodo, vendas, clientes, pedidos, google, carregandoGoogle, erroPedidos }

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="bg-brown text-cream">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <img width={800} height={315} src="/wordmark.png" alt="Coxelli" className="h-8 w-auto rounded bg-cream px-1.5 py-0.5" />
          <span className="font-display text-lg font-extrabold uppercase tracking-widest text-secondary">Hub</span>
          <Link to="/admin/" className="ml-auto flex items-center gap-1 text-sm font-semibold text-cream/80 no-underline hover:text-white">
            <HiArrowLeft /> Painel
          </Link>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4" aria-label="Seções do hub">
          {ABAS.map(a => (
            <NavLink
              key={a.to}
              to={a.to}
              end={a.end}
              className={({ isActive }) => `shrink-0 rounded-t-lg px-3 py-2 text-sm font-semibold no-underline ${
                isActive ? 'bg-bg text-brown' : 'text-cream/75 hover:text-white'
              }`}
            >
              {a.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-5">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {PERIODOS_HUB.map(p => (
            <button
              key={p.key}
              type="button"
              onClick={() => escolher(p.key)}
              className={`cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ${
                periodoKey === p.key ? 'bg-brown text-cream ring-brown' : 'bg-white text-text-light ring-border hover:bg-cream'
              }`}
            >
              {p.label}
            </button>
          ))}
          <span className="text-xs text-text-light">
            {periodo.ini.toLocaleDateString('pt-BR')} a {periodo.fim.toLocaleDateString('pt-BR')}
            {' · comparado com '}{periodo.antIni.toLocaleDateString('pt-BR')} a {periodo.antFim.toLocaleDateString('pt-BR')}
          </span>
          <button
            type="button"
            onClick={() => buscarGoogle(true)}
            disabled={carregandoGoogle}
            title="Buscar de novo no Google (normalmente fica guardado por 3 horas)"
            className="ml-auto flex cursor-pointer items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-text-light ring-1 ring-border hover:bg-cream disabled:opacity-50"
          >
            <HiRefresh className={carregandoGoogle ? 'animate-spin' : ''} />
            {google?.atualizadoEm
              ? `Google às ${new Date(google.atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
              : 'Google'}
          </button>
        </div>

        {erroPedidos && <p className="mb-4 text-sm text-red-600">Não foi possível carregar os pedidos: {erroPedidos}</p>}
        <Outlet context={contexto} />
      </div>
    </div>
  )
}
