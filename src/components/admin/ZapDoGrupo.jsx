import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import {
  lerConfigZap, gravarConfigZap, zapPronto, estadoDoZap, qrCodeDoZap, desconectarZap, gruposDoZap, mandarNoGrupo,
} from '../../utils/zapDoGrupo'

const ROTULO_ESTADO = {
  open: '✅ Conectado',
  connecting: '⏳ Esperando ler o QR Code',
  close: '❌ Desconectado',
}

/**
 * Botão e tela do "pedido no grupo do WhatsApp": conecta o número da Coxelli à Evolution do PC
 * da loja (QR Code), escolhe o grupo e liga o envio. Vale só para o computador onde é feito.
 */
export default function ZapDoGrupo() {
  const [aberto, setAberto] = useState(false)
  const [config, setConfig] = useState(lerConfigZap)
  const [estado, setEstado] = useState(undefined) // undefined = não verificado; null = sem instância
  const [erro, setErro] = useState('')
  const [qr, setQr] = useState(null)
  const [grupos, setGrupos] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  const mudar = (mudancas) => setConfig(gravarConfigZap(mudancas))

  const verificar = useCallback(async () => {
    if (!config.apikey) return
    try {
      const e = await estadoDoZap(config)
      setEstado(e)
      setErro('')
      if (e === 'open') setQr(null)
      return e
    } catch (err) {
      setEstado(undefined)
      setErro(err.message)
    }
  }, [config])

  useEffect(() => {
    if (aberto) verificar()
  }, [aberto, verificar])

  // com o QR na tela, confere a cada 3 s se o celular já leu
  useEffect(() => {
    if (!aberto || !qr) return
    const t = setInterval(verificar, 3000)
    return () => clearInterval(t)
  }, [aberto, qr, verificar])

  const executar = async (fn) => {
    setOcupado(true)
    try {
      await fn()
    } catch (err) {
      toast.error(err.message, { duration: 8000 })
    } finally {
      setOcupado(false)
    }
  }

  const gerarQr = () => executar(async () => {
    const imagem = await qrCodeDoZap(config)
    if (!imagem) throw new Error('A Evolution não devolveu o QR Code. Tente de novo em alguns segundos.')
    setQr(imagem)
    setEstado('connecting')
  })

  const carregarGrupos = () => executar(async () => setGrupos(await gruposDoZap(config)))

  const testar = () => executar(async () => {
    await mandarNoGrupo('✅ Teste do painel da Coxelli: os pedidos novos vão chegar aqui.', config)
    toast.success(`Mensagem de teste enviada para "${config.grupoNome}".`)
  })

  const desconectar = () => {
    if (!window.confirm('Desconectar o WhatsApp deste painel? Os pedidos param de ir para o grupo até ler o QR Code de novo.')) return
    executar(async () => {
      await desconectarZap(config)
      mudar({ ligado: false })
      await verificar()
    })
  }

  const alternar = () => {
    const ligar = !config.ligado
    mudar({ ligado: ligar })
    if (ligar) toast.success(`Pedidos novos vão para "${config.grupoNome}" a partir de agora.`)
    else toast('Envio para o grupo desligado neste computador')
  }

  const ativo = zapPronto(config)

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          ativo ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
        }`}
        title="Manda cada pedido novo para o grupo do WhatsApp. Vale só para o computador da loja, onde a Evolution está instalada"
      >
        📲
        <span className="hidden sm:inline">{ativo ? 'Grupo do Zap' : 'Grupo do Zap desligado'}</span>
      </button>

      <Modal isOpen={aberto} onClose={() => setAberto(false)} title="Pedidos no grupo do WhatsApp">
        <div className="space-y-5 text-sm">
          <p className="text-text-light">
            Funciona só no computador da loja, com a Evolution ligada. Cada pedido novo vai para o grupo
            quando a comanda imprime, e pedido cancelado não vai.
          </p>

          <section className="space-y-2">
            <h4 className="font-semibold">1. Evolution deste computador</h4>
            <label className="block">
              <span className="text-text-light">Chave (AUTHENTICATION_API_KEY do arquivo chave.env)</span>
              <input
                type="password"
                value={config.apikey}
                onChange={e => mudar({ apikey: e.target.value.trim() })}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2"
                autoComplete="off"
              />
            </label>
            <details>
              <summary className="cursor-pointer text-text-light">Avançado</summary>
              <label className="block mt-2">
                <span className="text-text-light">Endereço</span>
                <input value={config.url} onChange={e => mudar({ url: e.target.value.trim() })} className="mt-1 w-full rounded-lg border border-border px-3 py-2" />
              </label>
            </details>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => executar(verificar)} disabled={!config.apikey || ocupado}>Verificar</Button>
              <span>{erro ? <span className="text-red-600">{erro}</span>
                : estado === null ? 'Conectada. Falta ligar o número.'
                : ROTULO_ESTADO[estado] ?? ''}</span>
            </div>
          </section>

          {estado !== undefined && (
            <section className="space-y-2">
              <h4 className="font-semibold">2. Número da Coxelli</h4>
              {estado === 'open' ? (
                <div className="flex items-center gap-2">
                  <span>✅ WhatsApp conectado</span>
                  <Button size="sm" variant="ghost" onClick={desconectar} disabled={ocupado}>Desconectar</Button>
                </div>
              ) : (
                <>
                  <p className="text-text-light">
                    No celular: WhatsApp → ⋮ (ou Configurações) → <b>Dispositivos conectados</b> → <b>Conectar dispositivo</b>, e aponte para o QR Code.
                  </p>
                  {qr && <img src={qr} alt="QR Code do WhatsApp" className="w-64 h-64 border border-border rounded-lg" />}
                  <Button size="sm" onClick={gerarQr} disabled={ocupado}>{qr ? 'Gerar outro QR Code' : 'Mostrar QR Code'}</Button>
                </>
              )}
            </section>
          )}

          {estado === 'open' && (
            <section className="space-y-2">
              <h4 className="font-semibold">3. Grupo</h4>
              {config.grupoNome && <p>Grupo escolhido: <b>{config.grupoNome}</b></p>}
              {grupos ? (
                <select
                  value={config.grupo}
                  onChange={e => {
                    const g = grupos.find(x => x.id === e.target.value)
                    mudar({ grupo: g?.id ?? '', grupoNome: g?.nome ?? '' })
                  }}
                  className="w-full rounded-lg border border-border px-3 py-2"
                >
                  <option value="">Escolha o grupo…</option>
                  {grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
                </select>
              ) : (
                <Button size="sm" variant="secondary" onClick={carregarGrupos} disabled={ocupado}>
                  {config.grupo ? 'Trocar de grupo' : 'Ver grupos do WhatsApp'}
                </Button>
              )}
            </section>
          )}

          {estado === 'open' && config.grupo && (
            <section className="space-y-2">
              <h4 className="font-semibold">4. Ligar</h4>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={testar} disabled={ocupado}>Mandar teste no grupo</Button>
                <Button size="sm" variant={config.ligado ? 'ghost' : 'primary'} onClick={alternar}>
                  {config.ligado ? 'Desligar envio' : 'Ligar envio de pedidos'}
                </Button>
              </div>
              {config.ligado && <p className="text-green-700">Ligado: pedidos novos vão para o grupo.</p>}
            </section>
          )}
        </div>
      </Modal>
    </>
  )
}
