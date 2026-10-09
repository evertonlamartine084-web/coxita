import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabase'
import { getSettings } from '../../services/settings'
import { horarioDeEntrega, DIAS_DE_ENTREGA } from '../../utils/funcionamento'

const MIN = 60 * 1000
// sinal de vida é a cada 5 min; 15 sem notícia = parou (PC desligado, painel fechado, sem internet)
const SEM_NOTICIA = 15 * MIN
// o refresh_token do Bling dura 30 dias sem uso; avisa com folga para reconectar
const BLING_VELHO_DIAS = 25

const minutos = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0) }

/**
 * Faixa no topo do painel quando algo que trabalha sozinho parou: Bling (nota fiscal), a
 * impressora da loja (comanda) e o grupo do Zap. Em 02/10 o Bling caiu e ficou 6 dias assim sem
 * ninguém saber. Impressora e Zap só avisam no horário da loja: de noite o PC fica desligado.
 * Dados: status_integracoes() (supabase/avisos-painel.sql).
 */
export default function AvisosDoPainel() {
  const [status, setStatus] = useState(null)
  const [settings, setSettings] = useState({})
  const [fechados, setFechados] = useState([])

  useEffect(() => {
    getSettings().then(setSettings).catch(() => {})
    const ler = () => supabase.rpc('status_integracoes').then(({ data }) => data && setStatus(data))
    ler()
    const t = setInterval(ler, 2 * MIN)
    return () => clearInterval(t)
  }, [])

  if (!status) return null

  const agora = new Date(status.agora)
  const desde = (iso) => (iso ? agora - new Date(iso) : Infinity)
  const { abre, fecha } = horarioDeEntrega(settings)
  const minAgora = agora.getHours() * 60 + agora.getMinutes()
  // da 1 h antes de abrir até o fechamento
  const lojaAberta = DIAS_DE_ENTREGA.includes(agora.getDay())
    && minAgora >= minutos(abre) - 60 && minAgora <= minutos(fecha)

  const avisos = []
  if (status.bling_erro) {
    avisos.push({ id: 'bling', grave: true, texto: `Bling desconectado: as notas fiscais não estão saindo. Reconecte o Bling (ou me chame). Erro: ${status.bling_erro}` })
  } else if (desde(status.bling_atualizado) > BLING_VELHO_DIAS * 24 * 60 * MIN) {
    avisos.push({ id: 'bling-velho', texto: 'A conexão com o Bling está há quase 30 dias sem renovar e vai vencer. Emita uma nota pelo painel ou reconecte o Bling.' })
  }
  if (lojaAberta && desde(status.impressao_viva) > SEM_NOTICIA) {
    avisos.push({ id: 'impressora', grave: true, texto: 'A impressão automática parou: nenhum painel com a impressora ligada deu sinal nos últimos 15 minutos. Confira se o PC da loja está ligado e com o painel aberto.' })
  }
  if (lojaAberta && status.zap_vivo !== null && desde(status.zap_vivo) > SEM_NOTICIA) {
    avisos.push({ id: 'zap', grave: true, texto: 'O grupo do Zap parou: o PC da loja não deu sinal nos últimos 15 minutos. Confira se ele está ligado e com o painel aberto.' })
  } else if (status.zap_estado && status.zap_estado !== 'open' && desde(status.zap_vivo) <= SEM_NOTICIA) {
    const motivo = status.zap_estado === 'sem_evolution'
      ? 'a Evolution não está respondendo no PC da loja'
      : 'o WhatsApp desconectou (precisa ler o QR Code de novo em Pedidos → 📲)'
    avisos.push({ id: 'zap-estado', grave: true, texto: `Os pedidos não estão indo para o grupo do Zap: ${motivo}.` })
  }

  const visiveis = avisos.filter(a => !fechados.includes(a.id))
  if (!visiveis.length) return null

  return (
    <div className="mb-4 space-y-2" role="alert">
      {visiveis.map(a => (
        <div key={a.id} className={`flex items-start gap-3 rounded-lg px-4 py-3 text-sm font-semibold ring-1 ${
          a.grave ? 'bg-red-50 text-red-800 ring-red-200' : 'bg-amber-50 text-amber-900 ring-amber-200'
        }`}>
          <span aria-hidden="true">⚠️</span>
          <p className="flex-1">{a.texto}</p>
          <button type="button" onClick={() => setFechados(f => [...f, a.id])}
            className="cursor-pointer text-xs font-normal underline" aria-label="Esconder este aviso">
            esconder
          </button>
        </div>
      ))}
    </div>
  )
}
