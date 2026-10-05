import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { HiHome, HiShoppingBag, HiTag, HiClipboardList, HiCog, HiLogout, HiStar, HiTicket, HiUsers, HiCalculator, HiCurrencyDollar, HiArchive, HiDownload, HiMap, HiBell } from 'react-icons/hi'
import { signOut } from '../../services/auth'
import { createElement, useState, useEffect, useRef } from 'react'
import { supabase } from '../../services/supabase'
import { playOrderAlert } from '../../utils/alertSound'
import { impressaoAutoLigada, impressaoAutoDesde, prontoParaComanda, comandaJaImpressa, marcarComandaImpressa, imprimirComanda, registrarImpressao } from '../../utils/impressao'
import { updateSetting } from '../../services/settings'
import toast from 'react-hot-toast'
import { usePushDoPainel } from '../../hooks/usePushDoPainel'
import { useAppDoPainel } from '../../hooks/useAppDoPainel'

const navItems = [
  // com a barra: o app do painel tem escopo /admin/, e /admin sem barra fica FORA dele — o
  // Chrome mostrava a faixa de "site externo" no topo toda vez que se abria o Dashboard
  { to: '/admin/', icon: HiHome, label: 'Dashboard' },
  { to: '/admin/pedidos', icon: HiClipboardList, label: 'Pedidos' },
  { to: '/admin/rotas', icon: HiMap, label: 'Rotas' },
  { to: '/admin/clientes', icon: HiUsers, label: 'Clientes' },
  { to: '/admin/produtos', icon: HiShoppingBag, label: 'Produtos' },
  { to: '/admin/margens', icon: HiCalculator, label: 'Margens' },
  { to: '/admin/precos', icon: HiCurrencyDollar, label: 'Preços' },
  { to: '/admin/estoque', icon: HiArchive, label: 'Estoque' },
  { to: '/admin/categorias', icon: HiTag, label: 'Categorias' },
  { to: '/admin/cupons', icon: HiTicket, label: 'Cupons' },
  { to: '/admin/avaliacoes', icon: HiStar, label: 'Avaliações' },
  { to: '/admin/configuracoes', icon: HiCog, label: 'Configurações' },
]

/** Quanto antes do horário marcado o agendado faz o alarme tocar. */
const ANTECEDENCIA_AGENDADO = 60 * 60 * 1000

export default function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const lastOrderCountRef = useRef(null)
  // null = ainda lendo. Lido direto do banco, sem o cache de settings: é o estado do site agora
  const [emManutencao, setEmManutencao] = useState(null)
  const [trocandoSite, setTrocandoSite] = useState(false)
  const appDoPainel = useAppDoPainel()
  const pushDoPainel = usePushDoPainel()

  useEffect(() => {
    supabase.from('settings').select('value').eq('key', 'site_em_manutencao').maybeSingle()
      .then(({ data }) => setEmManutencao(data?.value === 'sim'))
  }, [])

  // Liga e desliga o aviso "Voltamos já" no lugar do site (middleware.js). O painel continua
  // funcionando com o site em manutenção.
  const alternarSite = async () => {
    const ligar = !emManutencao
    const pergunta = ligar
      ? 'Colocar o site em manutenção? Os clientes vão ver o aviso "Voltamos já" com o botão do WhatsApp, e não vão conseguir fazer pedidos pelo site.'
      : 'Colocar o site de volta no ar? Os clientes voltam a ver o cardápio e a fazer pedidos.'
    if (!window.confirm(pergunta)) return
    setTrocandoSite(true)
    try {
      await updateSetting('site_em_manutencao', ligar ? 'sim' : 'nao')
      setEmManutencao(ligar)
      toast.success(ligar
        ? 'Site em manutenção. Em até 15 segundos os clientes veem o aviso.'
        : 'Site de volta no ar. Em até 15 segundos os clientes veem o cardápio.')
    } catch (e) {
      toast.error(`Não foi possível trocar: ${e.message}`)
    } finally {
      setTrocandoSite(false)
    }
  }

  // Poll for new orders every 15 seconds
  useEffect(() => {
    const checkNewOrders = async () => {
      try {
        const { count } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })

        if (lastOrderCountRef.current !== null && count > lastOrderCountRef.current) {
          const newCount = count - lastOrderCountRef.current
          setPendingCount(c => c + newCount)
          const soundOn = localStorage.getItem('coxita_admin_sound') !== 'off'
          if (soundOn) playOrderAlert()
          toast.success(`${newCount} novo(s) pedido(s)!`, { duration: 5000 })
        }
        lastOrderCountRef.current = count
      } catch (e) {
        console.warn('Error checking orders:', e)
      }
    }

    checkNewOrders()
    const interval = setInterval(checkNewOrders, 15000)
    return () => clearInterval(interval)
  }, [])

  // Alarme dos agendados: toca 1 h antes do horário marcado. O alarme de pedido novo só toca
  // quando o pedido ENTRA — encomenda feita no dia anterior chegava na hora sem ninguém lembrar
  // (03/10: #113 e #115). Cada pedido toca uma vez por aparelho; o aviso fica na tela até fechar.
  useEffect(() => {
    const CHAVE = 'coxelli_agendados_avisados'
    const lerAvisados = () => {
      try { return new Set(JSON.parse(localStorage.getItem(CHAVE) || '[]')) } catch { return new Set() }
    }
    const verificar = async () => {
      try {
        const agora = Date.now()
        const { data } = await supabase
          .from('orders')
          .select('id, order_number, customer_name, scheduled_for, delivery_type')
          .in('status', ['pendente', 'em_preparo'])
          .gte('scheduled_for', new Date(agora - 30 * 60 * 1000).toISOString())
          .lte('scheduled_for', new Date(agora + ANTECEDENCIA_AGENDADO).toISOString())
        const avisados = lerAvisados()
        const novos = (data ?? []).filter(o => !avisados.has(o.id))
        if (!novos.length) return
        if (localStorage.getItem('coxita_admin_sound') !== 'off') playOrderAlert()
        for (const o of novos) {
          const hora = new Date(o.scheduled_for).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          toast(t => (
            <button type="button" onClick={() => toast.dismiss(t.id)} className="cursor-pointer text-left">
              <strong>⏰ Agendado #{o.order_number} — {o.customer_name}</strong><br />
              {o.delivery_type === 'entrega' ? 'Entrega' : 'Retirada'} às {hora}. Hora de preparar!
              <span className="mt-1 block text-xs text-gray-500">Toque para fechar</span>
            </button>
          ), { duration: Infinity, id: `agendado-${o.id}` })
          avisados.add(o.id)
        }
        // só os últimos 200: a lista não cresce para sempre
        try { localStorage.setItem(CHAVE, JSON.stringify([...avisados].slice(-200))) } catch { /* sem armazenamento */ }
      } catch (e) {
        console.warn('Erro ao verificar agendados:', e)
      }
    }
    verificar()
    const intervalo = setInterval(verificar, 60000)
    return () => clearInterval(intervalo)
  }, [])

  // Impressão automática da comanda, assim que o pedido chega. Fica aqui, e não na tela de
  // pedidos, para imprimir em qualquer página do painel e independente da aba de status aberta.
  useEffect(() => {
    let imprimindo = false
    // o registro não repete a mesma coisa a cada 15 s: cada pedido/motivo aparece uma vez, e um
    // sinal de vida a cada 5 min mostra que o painel segue rodando
    const jaRegistrado = new Set()
    let ultimoSinal = 0

    registrarImpressao('painel_aberto', null, {
      chave: impressaoAutoLigada(), desde: impressaoAutoDesde(), pagina: window.location.pathname,
      navegador: navigator.userAgent,
    })

    const imprimirPendentes = async () => {
      if (imprimindo) return
      if (!impressaoAutoLigada()) {
        if (Date.now() - ultimoSinal > 5 * 60 * 1000) {
          ultimoSinal = Date.now()
          registrarImpressao('verificando_chave_desligada')
        }
        return
      }
      imprimindo = true
      try {
        // Pix pago minutos depois ainda precisa sair, então a janela olha as últimas 24h
        const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const desde = impressaoAutoDesde()
        const { data, error } = await supabase
          .from('orders')
          .select('*, order_items(*, order_item_flavors(*))')
          .gte('created_at', desde && desde > ontem ? desde : ontem)
          .order('created_at', { ascending: true })
        if (error) throw error

        if (Date.now() - ultimoSinal > 5 * 60 * 1000) {
          ultimoSinal = Date.now()
          registrarImpressao('verificando', null, { desde, pedidos_na_janela: data.length })
        }
        for (const p of data) {
          const motivo = comandaJaImpressa(p.id) ? 'ja_impressa'
            : p.status === 'cancelado' ? 'cancelado'
            : !prontoParaComanda(p) ? 'aguardando_pagamento'
            : null
          if (motivo && !jaRegistrado.has(p.id + motivo)) {
            jaRegistrado.add(p.id + motivo)
            registrarImpressao('ignorado', p.order_number, { motivo })
          }
        }

        for (const pedido of data.filter(p => prontoParaComanda(p) && !comandaJaImpressa(p.id))) {
          // Duas abas do painel abertas no mesmo computador imprimiriam em dobro: a trava
          // deixa uma de cada vez, e a outra vê a comanda já marcada.
          const imprimir = async () => {
            if (comandaJaImpressa(pedido.id)) return
            marcarComandaImpressa(pedido.id)
            registrarImpressao('imprimindo_comanda', pedido.order_number)
            await imprimirComanda(pedido)
          }
          if (navigator.locks) await navigator.locks.request('coxelli-comanda', imprimir)
          else await imprimir()
        }
      } catch (e) {
        console.warn('Impressão automática falhou:', e)
        registrarImpressao('erro_na_verificacao', null, { erro: String(e?.message ?? e) })
      } finally {
        imprimindo = false
      }
    }

    imprimirPendentes()
    const interval = setInterval(imprimirPendentes, 15000)
    return () => clearInterval(interval)
  }, [])

  // O computador da impressora fica com o painel aberto por dias: sem isto, ele segue rodando a
  // versão de quando foi aberto, e correção publicada não chega nele (foi o que fez o cupom sair
  // encolhido depois de corrigido). Versão nova no ar = script de entrada com outro nome.
  useEffect(() => {
    const scriptAtual = document.querySelector('script[type="module"][src*="/assets/"]')?.getAttribute('src')
    if (!scriptAtual) return // em dev não há bundle para comparar

    const conferirVersao = async () => {
      try {
        const html = await fetch('/', { cache: 'no-store' }).then(r => r.text())
        const scriptNoAr = html.match(/<script[^>]+type="module"[^>]+src="([^"]*\/assets\/[^"]+)"/)?.[1]
        if (!scriptNoAr || scriptNoAr === scriptAtual) return
        // não recarrega no meio de alguém digitando (mensagem ao cliente, edição de pedido)
        const digitando = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
        if (!digitando) window.location.reload()
      } catch {
        // sem rede agora: confere na próxima volta
      }
    }

    const interval = setInterval(conferirVersao, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const displayedPendingCount = location.pathname === '/admin/pedidos' ? 0 : pendingCount

  const handleLogout = async () => {
    await signOut()
    navigate('/admin/login')
  }

  return (
    <div className="admin-shell min-h-screen flex bg-cream">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:sticky lg:top-0 h-screen lg:h-screen inset-y-0 left-0 z-50 w-72 bg-brown text-white flex flex-col transform transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-3 gingham-blue border-b-2 border-secondary shrink-0" aria-hidden="true" />
        <div className="p-5 border-b border-white/15 shrink-0">
          <div className="bg-cream border-2 border-secondary p-3 shadow-[4px_4px_0_#ffcd5e]">
            <img width={800} height={315} src="/wordmark.png" alt="Coxelli" className="h-10 w-auto object-contain" />
            <p className="font-display text-xs font-extrabold uppercase tracking-[0.16em] text-brown mt-1">Painel da cozinha</p>
          </div>
        </div>
        {emManutencao !== null && (
          <div className="px-4 pt-4 shrink-0">
            <button
              type="button"
              onClick={alternarSite}
              disabled={trocandoSite}
              title={emManutencao ? 'Clique para colocar o site de volta no ar' : 'Clique para colocar o site em manutenção'}
              className={`flex w-full items-center gap-2 border-2 px-3 py-2.5 text-left text-sm font-bold transition-colors disabled:opacity-60 ${
                emManutencao
                  ? 'border-red-400 bg-red-600 text-white hover:bg-red-700'
                  : 'border-green-400/60 bg-green-700/40 text-cream hover:bg-green-700/60'
              }`}
            >
              <span aria-hidden="true">{emManutencao ? '🔴' : '🟢'}</span>
              <span className="flex-1">{emManutencao ? 'Site em manutenção' : 'Site no ar'}</span>
              <span className="text-xs font-semibold opacity-80">{trocandoSite ? '…' : emManutencao ? 'Reabrir' : 'Pausar'}</span>
            </button>
          </div>
        )}
        <nav className="flex-1 min-h-0 overflow-y-auto p-4 space-y-1.5">
          {navItems.map(({ to, icon, label }) => {
            const active = location.pathname === to || (to === '/admin/' && location.pathname === '/admin')
            return (
              <Link
                key={to}
                to={to}
                onClick={() => {
                  setSidebarOpen(false)
                  if (to === '/admin/pedidos') setPendingCount(0)
                }}
                className={`flex items-center gap-3 px-3 py-3 border-2 no-underline font-semibold transition-colors ${
                  active ? 'bg-secondary border-secondary text-brown shadow-[3px_3px_0_#3f6bb5]' : 'border-transparent text-cream/80 hover:bg-white/10 hover:text-white'
                }`}
              >
                {createElement(icon, { size: 20 })}
                <span className="flex-1">{label}</span>
                {to === '/admin/pedidos' && displayedPendingCount > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
                    {displayedPendingCount}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
        <div className="shrink-0 p-4 border-t border-white/15 bg-brown">
          {appDoPainel.podeInstalar && (
            <button
              onClick={appDoPainel.instalar}
              className="mb-2 flex items-center gap-3 px-3 py-2.5 w-full border-2 border-secondary text-secondary hover:bg-secondary hover:text-brown font-semibold transition-colors"
            >
              <HiDownload size={20} />
              <span>Instalar o painel</span>
            </button>
          )}
          {pushDoPainel.estado === 'desligado' && (
            <button
              onClick={() => pushDoPainel.ativar()
                .then(() => toast.success('Pronto: este aparelho avisa quando chegar pedido.'))
                .catch(() => toast.error('Não foi possível ativar as notificações.'))}
              className="mb-2 flex items-center gap-3 px-3 py-2.5 w-full border-2 border-secondary text-secondary hover:bg-secondary hover:text-brown font-semibold transition-colors"
            >
              <HiBell size={20} />
              <span>Ativar notificações</span>
            </button>
          )}
          {pushDoPainel.estado === 'ativo' && (
            <p className="mb-2 flex items-center gap-2 px-3 text-xs text-cream/70"><HiBell size={16} /> Notificações ligadas neste aparelho</p>
          )}
          {pushDoPainel.estado === 'bloqueado' && (
            <p className="mb-2 px-3 text-xs text-cream/70">Notificações bloqueadas. Libere nos Ajustes do aparelho para o Painel.</p>
          )}
          {pushDoPainel.estado === 'abrir-app' && (
            <p className="mb-2 px-3 text-xs text-cream/70">Para receber aviso de pedido no iPhone, abra o painel pelo app instalado na Tela de Início.</p>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 text-cream/70 hover:text-white w-full border-2 border-transparent hover:border-white/20 transition-colors"
          >
            <HiLogout size={20} />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-cream border-b-4 border-festa px-4 py-3 flex items-center lg:hidden sticky top-0 z-30">
          <button onClick={() => setSidebarOpen(true)} className="text-brown text-2xl mr-3" aria-label="Abrir menu">☰</button>
          <img width={800} height={315} src="/wordmark.png" alt="Coxelli" className="h-9 w-auto" />
          <span className="ml-auto font-display text-xs font-extrabold uppercase tracking-widest text-festa">Admin</span>
        </header>
        <main className="admin-content flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
