import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { HiHome, HiShoppingBag, HiTag, HiClipboardList, HiCog, HiLogout, HiStar, HiTicket, HiUsers, HiCalculator, HiCurrencyDollar, HiArchive, HiDownload, HiMap, HiBell, HiChartBar } from 'react-icons/hi'
import { signOut } from '../../services/auth'
import { createElement, useState, useEffect, useRef } from 'react'
import { supabase } from '../../services/supabase'
import { playOrderAlert } from '../../utils/alertSound'
import { impressaoAutoLigada, impressaoAutoDesde, prontoParaComanda, comandaJaImpressa, marcarComandaImpressa, imprimirComanda, registrarImpressao } from '../../utils/impressao'
import { lerConfigZap, zapPronto, zapJaEnviado, marcarZapEnviado, mandarNoGrupo, textoDoPedido, estadoDoZap, avisoDevido, numeroDoCliente, mensagemParaCliente, mandarParaCliente, resumoDasConversas } from '../../utils/zapDoGrupo'
import AvisosDoPainel from '../admin/AvisosDoPainel'
import { mensagemDeCarrinho, noHorarioDoFluxo, mensagemDePosVenda, alertaDeNotaBaixa } from '../../utils/crm'
import { updateSetting } from '../../services/settings'
import toast from 'react-hot-toast'
import { usePushDoPainel } from '../../hooks/usePushDoPainel'
import { useAppDoPainel } from '../../hooks/useAppDoPainel'
import { aCada } from '../../utils/aCada'

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
    return aCada(checkNewOrders, 15000)
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
    return aCada(imprimirPendentes, 15000)
  }, [])

  // Pedido novo no grupo do WhatsApp, pela Evolution do PC da loja (utils/zapDoGrupo). Mesma
  // regra e mesma volta da comanda; fica separado para um não travar o outro.
  useEffect(() => {
    let enviando = false
    const jaRegistrado = new Set()
    let ultimoSinal = 0

    // Sinal de vida do grupo do Zap, a cada 5 min, só no aparelho com o envio ligado: é por ele
    // que os outros painéis avisam quando o WhatsApp caiu ou o PC da loja está desligado.
    const sinalDeVida = async (config) => {
      if (Date.now() - ultimoSinal < 5 * 60 * 1000) return
      ultimoSinal = Date.now()
      let estado
      try { estado = await estadoDoZap(config) ?? 'sem_instancia' } catch { estado = 'sem_evolution' }
      registrarImpressao('zap_vivo', null, { estado })
    }

    // Status do pedido para o cliente, no WhatsApp dele. Só pedido do site e do WhatsApp (o iFood
    // avisa sozinho), mexido nas últimas 2 h: ligar isto não sai mandando mensagem de pedido velho.
    let avisoDeLinkDeAvaliacao = null
    let linkLidoEm = 0
    const avisarClientes = async (config) => {
      const duasHoras = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, codigo_cliente, public_token, customer_name, customer_phone, status, entregue_em, canal, delivery_type, scheduled_for, total, sinal_valor, payment_status, payment_method, zap_cliente')
        .in('canal', ['site', 'whatsapp'])
        .is('reposicao_de', null)
        .neq('status', 'cancelado')
        .gte('updated_at', duasHoras)
      if (error) throw error
      // relido a cada 10 min: trocar o link no hub muda isto sem recarregar o painel
      if (avisoDeLinkDeAvaliacao === null || Date.now() - linkLidoEm > 10 * 60 * 1000) {
        linkLidoEm = Date.now()
        const { data: s } = await supabase.from('settings').select('value').eq('key', 'google_avaliacao_url').maybeSingle()
        avisoDeLinkDeAvaliacao = s?.value ?? ''
      }
      for (const p of data ?? []) {
        const evento = avisoDevido(p)
        // "recebido" só com o pedido valendo: Pix/cartão do site, só depois de pago
        if (!evento || (evento === 'recebido' && !prontoParaComanda(p))) continue
        // pedido entregue há horas (ex.: telefone posto depois, no hub) não ganha "obrigado" fora de hora
        if (evento === 'entregue' && p.entregue_em && Date.now() - new Date(p.entregue_em) > 3 * 60 * 60 * 1000) continue
        const marcar = (valor) => supabase.from('orders')
          .update({ zap_cliente: { ...(p.zap_cliente ?? {}), [evento]: valor } }).eq('id', p.id)
        const numero = numeroDoCliente(p.customer_phone)
        if (!numero) { await marcar('sem_numero'); continue }
        try {
          await mandarParaCliente(numero, mensagemParaCliente(p, evento, { avaliacaoUrl: avisoDeLinkDeAvaliacao }), config)
          await marcar(new Date().toISOString())
          registrarImpressao('zap_cliente', p.order_number, { evento })
        } catch (e) {
          // número que não tem WhatsApp (400) não adianta tentar de novo; o resto tenta na próxima volta
          if (e.status === 400) await marcar('erro')
          registrarImpressao('zap_cliente_falhou', p.order_number, { evento, erro: e.message })
        }
      }
    }

    // Pós-venda: cada envio é registrado em crm_envios ANTES de mandar (o índice único por
    // etapa + pedido impede mandar duas vezes); se a Evolution falhar, o registro sai e tenta de novo.
    const enviarPosVenda = async (cfg, config) => {
      const { data: devidos, error } = await supabase.rpc('crm_pos_venda_devidos')
      if (error) throw error
      if (!devidos?.length) return
      const { data: g } = await supabase.from('settings').select('value').eq('key', 'google_avaliacao_url').maybeSingle()
      for (const item of devidos ?? []) {
        const alerta = item.etapa === 'alerta'
        // o alerta vai para o grupo da loja a qualquer hora; mensagem ao cliente, só no horário
        if (!alerta && !noHorarioDoFluxo(cfg)) continue
        const { data: reg, error: erroReg } = await supabase.from('crm_envios').insert({
          fluxo: 'pos_venda', etapa: item.etapa, status: 'enviando',
          order_id: alerta ? null : item.order_id, review_id: alerta ? item.review_id : null,
          telefone_digitos: (item.telefone || '').replace(/\D/g, '').slice(-11),
        }).select('id').single()
        if (erroReg) continue // outra aba já pegou
        const marcar = (campos) => supabase.from('crm_envios').update(campos).eq('id', reg.id)
        try {
          if (alerta) {
            await mandarNoGrupo(alertaDeNotaBaixa(item), config)
          } else {
            const numero = numeroDoCliente(item.telefone)
            if (!numero) { await marcar({ status: 'erro', motivo: 'telefone inválido' }); continue }
            await mandarParaCliente(numero, mensagemDePosVenda(item, cfg[item.etapa] ?? {}, g?.value || ''), config)
          }
          await marcar({ status: 'enviado', enviado_em: new Date().toISOString() })
          registrarImpressao('crm_pos_venda', item.order_number, { etapa: item.etapa })
        } catch (e) {
          if (e.status === 400) await marcar({ status: 'erro', motivo: 'número sem WhatsApp' })
          else await supabase.from('crm_envios').delete().eq('id', reg.id)
          registrarImpressao('crm_pos_venda_falhou', item.order_number, { etapa: item.etapa, erro: e.message })
        }
      }
    }

    // CRM (hub → CRM): carrinho abandonado. O banco diz quem está devendo mensagem; aqui o
    // carrinho é "pego" (aberto → avisado) antes de mandar, para duas abas não mandarem em dobro.
    let ultimoCrm = 0
    // Contatos do Zap para o hub (achar o telefone de pedido sem número): quando o hub pede, ou
    // uma vez por dia. Só o resumo (número, nome, dias com conversa) sobe para o banco.
    let sincronizando = false
    const sincronizarContatos = async (config) => {
      if (sincronizando) return
      const { data: s } = await supabase.from('settings').select('key, value').in('key', ['zap_sincronizar_pedido', 'zap_sincronizado_em'])
      const valor = (k) => s?.find(x => x.key === k)?.value || ''
      const feito = valor('zap_sincronizado_em')
      const pedido = valor('zap_sincronizar_pedido')
      const umDia = !feito || Date.now() - new Date(feito) > 24 * 60 * 60 * 1000
      if (!umDia && !(pedido && pedido > feito)) return
      sincronizando = true
      try {
        const { contatos: linhas, cartoes } = await resumoDasConversas(config)
        for (let i = 0; i < linhas.length; i += 200) {
          const { error } = await supabase.from('zap_contatos').upsert(linhas.slice(i, i + 200))
          if (error) throw error
        }
        // sem mexer em "descartado": o hub marca, a sincronização só acrescenta
        for (let i = 0; i < cartoes.length; i += 200) {
          const { error } = await supabase.from('zap_cartoes').upsert(cartoes.slice(i, i + 200))
          if (error) throw error
        }
        await updateSetting('zap_sincronizado_em', new Date().toISOString())
        registrarImpressao('zap_contatos', null, { contatos: linhas.length, cartoes: cartoes.length })
      } finally {
        sincronizando = false
      }
    }

    const fluxosDoCrm = async (config) => {
      if (Date.now() - ultimoCrm < 2 * 60 * 1000) return
      ultimoCrm = Date.now()
      // em paralelo: ler o histórico leva minutos e não pode segurar pedido indo para o grupo
      sincronizarContatos(config).catch(e => registrarImpressao('zap_contatos_falhou', null, { erro: e.message }))
      const { data: fluxos } = await supabase.from('crm_fluxos').select('id, ativo, config')
      const posVenda = fluxos?.find(f => f.id === 'pos_venda')
      if (posVenda?.ativo) await enviarPosVenda(posVenda.config, config)
      const fluxo = fluxos?.find(f => f.id === 'carrinho_abandonado')
      if (!fluxo?.ativo || !noHorarioDoFluxo(fluxo.config)) return
      const { data: devidos, error } = await supabase.rpc('crm_carrinhos_devidos')
      if (error) throw error
      for (const c of devidos ?? []) {
        const { data: pego } = await supabase.from('carrinhos')
          .update({ status: 'avisado', avisado_em: new Date().toISOString() })
          .eq('id', c.id).eq('status', 'aberto').select('id')
        if (!pego?.length) continue
        const falhou = (motivo) => supabase.from('carrinhos').update({ status: 'erro', motivo }).eq('id', c.id)
        const numero = numeroDoCliente(c.telefone)
        if (!numero) { await falhou('telefone inválido'); continue }
        try {
          await mandarParaCliente(numero, mensagemDeCarrinho(c, fluxo.config), config)
          registrarImpressao('crm_carrinho', null, { carrinho: c.id })
        } catch (e) {
          // número sem WhatsApp (400) não adianta repetir; Evolution fora do ar volta para a fila
          if (e.status === 400) await falhou('número sem WhatsApp')
          else await supabase.from('carrinhos').update({ status: 'aberto', avisado_em: null }).eq('id', c.id)
          registrarImpressao('crm_carrinho_falhou', null, { carrinho: c.id, erro: e.message })
        }
      }
    }

    const enviarPendentes = async () => {
      const config = lerConfigZap()
      if (enviando || !zapPronto(config)) return
      sinalDeVida(config)
      enviando = true
      try {
        const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const { data, error } = await supabase
          .from('orders')
          .select('*, order_items(*, order_item_flavors(*))')
          .gte('created_at', config.desde && config.desde > ontem ? config.desde : ontem)
          .order('created_at', { ascending: true })
        if (error) throw error

        for (const pedido of data.filter(p => prontoParaComanda(p) && !zapJaEnviado(p.id))) {
          const enviar = async () => {
            if (zapJaEnviado(pedido.id)) return
            try {
              await mandarNoGrupo(textoDoPedido(pedido), config)
              marcarZapEnviado(pedido.id)
              registrarImpressao('zap_enviado', pedido.order_number)
            } catch (e) {
              // fica sem marcar: tenta de novo na próxima volta, e o erro entra uma vez no registro
              const chave = `${pedido.id}${e.message}`
              if (!jaRegistrado.has(chave)) {
                jaRegistrado.add(chave)
                registrarImpressao('zap_falhou', pedido.order_number, { erro: e.message })
              }
            }
          }
          if (navigator.locks) await navigator.locks.request('coxelli-zap', enviar)
          else await enviar()
        }

        if (config.avisarClientes !== false) await avisarClientes(config)
        await fluxosDoCrm(config)
      } catch (e) {
        console.warn('Envio ao grupo do WhatsApp falhou:', e)
      } finally {
        enviando = false
      }
    }

    enviarPendentes()
    return aCada(enviarPendentes, 15000)
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
          <Link
            to="/hub"
            className="mb-2 flex items-center gap-3 px-3 py-2.5 w-full border-2 border-secondary/60 text-secondary no-underline hover:bg-secondary hover:text-brown font-semibold transition-colors"
          >
            <HiChartBar size={20} />
            <span>Hub de números</span>
          </Link>
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
          <AvisosDoPainel />
          <Outlet />
        </main>
      </div>
    </div>
  )
}
