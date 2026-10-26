import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { HiCamera, HiPhotograph, HiLink, HiTrash, HiRefresh, HiExternalLink } from 'react-icons/hi'
import Button from '../../components/ui/Button'
import Loading from '../../components/ui/Loading'
import { formatCurrency } from '../../utils/format'
import { abrirCupom, confirmarCodigo, gravarCompra, listarCompras, apagarCompra, replanilhar, confirmarPendente, estadoDoRobo, CATEGORIAS } from '../../services/compras'

/**
 * Compras pelo cupom de mercado.
 *
 * Fluxo: ler o QR code (câmera, foto ou link colado) → a SEFAZ-RN mostra uma imagem com um
 * código de 6 letras, que a pessoa digita → os itens aparecem com o bloco sugerido (Comida /
 * Limpeza e embalagens) → confere e grava. A gravação entra aqui e nas duas planilhas do Google.
 *
 * O QR code é lido no próprio celular: BarcodeDetector quando o navegador tem (Chrome no Android),
 * senão jsQR lendo os quadros do vídeo. Os dois rodam sem mandar imagem para lugar nenhum.
 */

const ETAPAS = { INICIO: 'inicio', LENDO_QR: 'lendo_qr', ABRINDO: 'abrindo', CODIGO: 'codigo', CONFERIR: 'conferir', GRAVANDO: 'gravando' }

export default function ComprasPage() {
  const [etapa, setEtapa] = useState(ETAPAS.INICIO)
  const [erro, setErro] = useState('')
  const [sessao, setSessao] = useState(null)      // { sessao_id, captcha, url }
  const [codigo, setCodigo] = useState('')
  const [nota, setNota] = useState(null)
  const [itens, setItens] = useState([])
  const [linkColado, setLinkColado] = useState('')
  const [compras, setCompras] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [aberta, setAberta] = useState(null)
  const [pendente, setPendente] = useState(null)   // compra da Receita sendo conferida (id)
  const [robo, setRobo] = useState(null)

  const carregar = useCallback(() => {
    listarCompras()
      .then(setCompras)
      .catch(() => toast.error('Erro ao carregar as compras.'))
      .finally(() => setCarregando(false))
    estadoDoRobo().then(setRobo).catch(() => {})
  }, [])

  // Compra que chegou pela Receita: abre na mesma tela de conferência do cupom
  const conferirPendente = (c) => {
    setPendente(c.id)
    setNota({
      emitente_nome: c.emitente_nome, emitente_nome_sefaz: c.emitente_nome_sefaz, emitente_cnpj: c.emitente_cnpj,
      emitida_em: c.emitida_em, total: Number(c.total), forma_pagamento: c.forma_pagamento, numero: c.numero,
    })
    setItens(c.compras_itens.map(i => ({ ...i, quantidade: Number(i.quantidade), valor_unitario: Number(i.valor_unitario), valor_total: Number(i.valor_total) })))
    setErro('')
    setEtapa(ETAPAS.CONFERIR)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  useEffect(() => { carregar() }, [carregar])

  const recomecar = () => {
    setEtapa(ETAPAS.INICIO); setErro(''); setSessao(null); setCodigo(''); setNota(null); setItens([]); setLinkColado(''); setPendente(null)
  }

  // 1. com a URL do QR code em mãos, abre a consulta na SEFAZ
  const abrir = async (url) => {
    setErro(''); setEtapa(ETAPAS.ABRINDO)
    try {
      const r = await abrirCupom(url)
      if (r.precisa_codigo) {
        setSessao({ sessao_id: r.sessao_id, captcha: r.captcha, url })
        setCodigo('')
        setEtapa(ETAPAS.CODIGO)
      } else {
        setNota(r.nota); setItens(r.itens); setEtapa(ETAPAS.CONFERIR)
      }
    } catch (e) {
      setErro(e.message); setEtapa(ETAPAS.INICIO)
    }
  }

  // 2. manda o código da imagem
  const confirmar = async (ev) => {
    ev?.preventDefault()
    if (!sessao || codigo.trim().length < 4) return
    setErro(''); setEtapa(ETAPAS.ABRINDO)
    try {
      const r = await confirmarCodigo(sessao.sessao_id, codigo.trim())
      if (r.codigo_errado) {
        setSessao(s => ({ ...s, captcha: r.captcha })); setCodigo('')
        setErro('Código não bateu. Tente com a imagem nova.')
        setEtapa(ETAPAS.CODIGO)
        return
      }
      setNota(r.nota); setItens(r.itens); setEtapa(ETAPAS.CONFERIR)
    } catch (e) {
      setErro(e.message); setEtapa(ETAPAS.CODIGO)
      if (/expirou|de novo/i.test(e.message)) setEtapa(ETAPAS.INICIO)
    }
  }

  // 3. grava no painel e nas planilhas
  const gravar = async () => {
    setEtapa(ETAPAS.GRAVANDO); setErro('')
    try {
      const r = pendente
        ? await confirmarPendente(pendente, itens, nota.emitente_nome)
        : await gravarCompra(nota, itens, sessao?.sessao_id)
      const p = r.planilhas ?? {}
      if (p.erro) toast.error(`Lançado no painel, mas a planilha falhou: ${p.erro}`, { duration: 8000 })
      else toast.success(`Lançado: ${p.itens?.lancados ?? 0} itens na aba "${p.itens?.aba ?? ''}" e o total na linha ${p.totais?.linha ?? '?'}.`, { duration: 6000 })
      recomecar(); carregar()
    } catch (e) {
      setErro(e.message); setEtapa(ETAPAS.CONFERIR)
    }
  }

  const trocarCategoria = (ordem, categoria) =>
    setItens(lista => lista.map(i => (i.ordem === ordem ? { ...i, categoria } : i)))
  const trocarLoja = (nome) => setNota(n => ({ ...n, emitente_nome: nome }))

  const tentarPlanilha = async (c) => {
    try {
      const r = await replanilhar(c.id)
      const p = r.planilhas ?? {}
      toast.success(`Planilhas ok: ${p.itens?.lancados ?? 0} itens${p.totais?.linha ? `, total na linha ${p.totais.linha}` : ''}.`)
      carregar()
    } catch (e) {
      toast.error(e.message, { duration: 8000 }); carregar()
    }
  }

  const apagar = async (c) => {
    if (!window.confirm(`Apagar a compra de ${c.emitente_nome} (${formatCurrency(c.total)}) do painel? A planilha não muda.`)) return
    try { await apagarCompra(c.id); toast.success('Apagada do painel.'); carregar() } catch { toast.error('Não consegui apagar.') }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-black uppercase text-brown">Compras</h1>
        <p className="text-sm text-text-warm">
          Leia o QR code do cupom do mercado: os itens entram aqui e nas planilhas de itens e de totais.
        </p>
      </div>

      <section className="bg-white rounded-2xl border-2 border-border p-5 mb-8">
        {etapa === ETAPAS.INICIO && (
          <Inicio
            erro={erro}
            linkColado={linkColado}
            setLinkColado={setLinkColado}
            aoLer={abrir}
            aoCamera={() => { setErro(''); setEtapa(ETAPAS.LENDO_QR) }}
          />
        )}

        {etapa === ETAPAS.LENDO_QR && (
          <LeitorDeQr aoLer={abrir} aoCancelar={recomecar} aoErro={(m) => { setErro(m); setEtapa(ETAPAS.INICIO) }} />
        )}

        {(etapa === ETAPAS.ABRINDO || etapa === ETAPAS.GRAVANDO) && (
          <div className="py-8 text-center">
            <Loading />
            <p className="mt-3 text-sm text-text-warm">
              {etapa === ETAPAS.GRAVANDO ? 'Gravando no painel e nas planilhas…' : 'Falando com a Fazenda do RN…'}
            </p>
          </div>
        )}

        {etapa === ETAPAS.CODIGO && sessao && (
          <form onSubmit={confirmar} className="max-w-sm mx-auto text-center">
            <p className="font-semibold text-brown mb-1">Digite o código da imagem</p>
            <p className="text-xs text-text-warm mb-4">A Fazenda pede isso antes de mostrar a nota. São 6 letras ou números.</p>
            <img src={sessao.captcha} alt="Código de segurança da SEFAZ" className="mx-auto mb-3 rounded border border-border" style={{ width: 240 }} />
            <input
              autoFocus
              value={codigo}
              onChange={e => setCodigo(e.target.value.replace(/\s/g, ''))}
              maxLength={6}
              inputMode="text"
              autoComplete="off"
              autoCapitalize="characters"
              className="w-44 mx-auto block text-center tracking-[0.4em] text-2xl font-mono px-3 py-2 border-2 border-border rounded-xl focus:border-primary outline-none"
            />
            {erro && <p className="text-danger text-sm mt-3">{erro}</p>}
            <div className="flex gap-2 justify-center mt-4">
              <Button type="button" variant="outline" size="sm" onClick={recomecar}>Cancelar</Button>
              <Button type="submit" size="sm" disabled={codigo.trim().length < 4}>Ver a nota</Button>
            </div>
          </form>
        )}

        {etapa === ETAPAS.CONFERIR && nota && (
          <Conferencia nota={nota} itens={itens} erro={erro} trocarCategoria={trocarCategoria} trocarLoja={trocarLoja} aoGravar={gravar} aoCancelar={recomecar} />
        )}
      </section>

      {compras.some(c => c.conferida === false) && (
        <section className="mb-8">
          <h2 className="font-display text-xl font-black uppercase text-brown mb-1">Chegaram da Receita, para conferir</h2>
          <p className="text-xs text-text-warm mb-3">Notas de empresa emitidas para o CNPJ da Coxelli. Confira os blocos e lance.</p>
          <div className="space-y-2">
            {compras.filter(c => c.conferida === false).map(c => (
              <div key={c.id} className="bg-amber-50 border-2 border-amber-300 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[12rem]">
                  <p className="font-semibold text-brown">{c.emitente_nome}</p>
                  <p className="text-xs text-text-warm">
                    {c.emitida_em ? new Date(c.emitida_em).toLocaleDateString('pt-BR') : 'sem data'} · {c.qtd_itens} {c.qtd_itens === 1 ? 'item' : 'itens'}
                    {c.forma_pagamento ? ` · ${c.forma_pagamento}` : ''}
                  </p>
                </div>
                <span className="font-display font-extrabold text-brown">{formatCurrency(c.total)}</span>
                <Button type="button" size="sm" onClick={() => conferirPendente(c)}>Conferir e lançar</Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-display text-xl font-black uppercase text-brown">Lançadas</h2>
        {robo?.visto_em && (
          <span className="text-[11px] text-text-warm">
            robô da Receita visto {new Date(robo.visto_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
          </span>
        )}
      </div>
      {carregando ? <Loading /> : compras.length === 0 ? (
        <p className="text-sm text-text-warm">Nenhuma compra lançada ainda.</p>
      ) : (
        <div className="space-y-2">
          {compras.filter(c => c.conferida !== false).map(c => (
            <div key={c.id} className="bg-white rounded-xl border border-border">
              <button type="button" onClick={() => setAberta(aberta === c.id ? null : c.id)}
                className="w-full text-left px-4 py-3 flex items-center gap-3 cursor-pointer">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-brown truncate">{c.emitente_nome}</p>
                  <p className="text-xs text-text-warm">
                    {c.emitida_em ? new Date(c.emitida_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'sem data'}
                    {' · '}{c.qtd_itens} {c.qtd_itens === 1 ? 'item' : 'itens'}
                    {c.forma_pagamento ? ` · ${c.forma_pagamento}` : ''}
                    {c.origem === 'nfe' ? ' · NF-e pela Receita' : ''}
                    {c.planilha_erro ? ' · ⚠️ planilha falhou' : c.planilha_totais_linha ? ' · planilhas ok' : ''}
                  </p>
                </div>
                <span className="font-display font-extrabold text-brown">{formatCurrency(c.total)}</span>
              </button>
              {aberta === c.id && (
                <div className="px-4 pb-4 border-t border-border">
                  {c.planilha_erro && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <p className="text-xs text-danger flex-1 min-w-[12rem]">Planilha: {c.planilha_erro}</p>
                      <Button type="button" variant="outline" size="sm" onClick={() => tentarPlanilha(c)}>
                        <HiRefresh className="mr-1" /> Tentar a planilha de novo
                      </Button>
                    </div>
                  )}
                  <table className="w-full text-sm mt-2">
                    <tbody>
                      {c.compras_itens.map(i => (
                        <tr key={i.id} className="border-b border-border/60 last:border-0">
                          <td className="py-1.5 pr-2">{i.nome}</td>
                          <td className="py-1.5 pr-2 text-text-warm whitespace-nowrap">{Number(i.quantidade).toLocaleString('pt-BR')} {i.unidade}</td>
                          <td className="py-1.5 pr-2 text-xs text-text-warm whitespace-nowrap">{CATEGORIAS.find(k => k.valor === i.categoria)?.rotulo}</td>
                          <td className="py-1.5 text-right whitespace-nowrap">{formatCurrency(i.valor_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex gap-3 mt-3 text-xs">
                    {c.url_qrcode && (
                      <a href={c.url_qrcode} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">
                        <HiExternalLink /> nota na SEFAZ
                      </a>
                    )}
                    <button type="button" onClick={() => apagar(c)} className="inline-flex items-center gap-1 text-danger cursor-pointer ml-auto">
                      <HiTrash /> apagar do painel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Inicio({ erro, linkColado, setLinkColado, aoLer, aoCamera }) {
  const arquivoRef = useRef(null)

  const lerDaFoto = async (ev) => {
    const arquivo = ev.target.files?.[0]
    ev.target.value = ''
    if (!arquivo) return
    try {
      const texto = await decodificarImagem(arquivo)
      if (!texto) { toast.error('Não achei um QR code nessa foto. Tente mais de perto e com luz.'); return }
      aoLer(texto)
    } catch {
      toast.error('Não consegui ler a foto.')
    }
  }

  return (
    <div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Button type="button" onClick={aoCamera} className="w-full">
          <HiCamera className="mr-2 text-xl" /> Ler com a câmera
        </Button>
        <Button type="button" variant="secondary" onClick={() => arquivoRef.current?.click()} className="w-full">
          <HiPhotograph className="mr-2 text-xl" /> Enviar foto do cupom
        </Button>
        <input ref={arquivoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={lerDaFoto} />
      </div>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => { e.preventDefault(); if (linkColado.trim()) aoLer(linkColado.trim()) }}
      >
        <div className="relative flex-1">
          <HiLink className="absolute left-3 top-1/2 -translate-y-1/2 text-text-warm" />
          <input
            value={linkColado}
            onChange={e => setLinkColado(e.target.value)}
            placeholder="ou cole o link do QR code (nfce.sefaz.rn.gov.br/…)"
            className="w-full pl-9 pr-3 py-2.5 border-2 border-border rounded-xl text-sm outline-none focus:border-primary"
          />
        </div>
        <Button type="submit" variant="outline" size="sm" disabled={!linkColado.trim()}>Abrir</Button>
      </form>
      {erro && <p className="text-danger text-sm mt-3">{erro}</p>}
    </div>
  )
}

function Conferencia({ nota, itens, erro, trocarCategoria, trocarLoja, aoGravar, aoCancelar }) {
  const somaComida = itens.filter(i => i.categoria === 'comida').reduce((s, i) => s + Number(i.valor_total), 0)
  const somaLimpeza = itens.filter(i => i.categoria === 'limpeza').reduce((s, i) => s + Number(i.valor_total), 0)
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-4">
        <div>
          <input
            value={nota.emitente_nome}
            onChange={e => trocarLoja(e.target.value)}
            aria-label="Nome da loja"
            className="font-display font-extrabold text-brown text-lg bg-transparent border-b-2 border-dashed border-border focus:border-primary outline-none min-w-[10rem] max-w-full"
          />
          {nota.emitente_nome_sefaz && nota.emitente_nome_sefaz !== nota.emitente_nome && (
            <p className="text-[11px] text-text-warm">na nota: {nota.emitente_nome_sefaz}</p>
          )}
          {nota.emitente_nome_sefaz && nota.emitente_nome_sefaz === nota.emitente_nome && (
            <p className="text-[11px] text-text-warm">Pode encurtar o nome da loja; o painel lembra para a próxima.</p>
          )}
        </div>
        <p className="text-sm text-text-warm">
          {nota.emitida_em ? new Date(nota.emitida_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'sem data'}
          {nota.forma_pagamento ? ` · ${nota.forma_pagamento}` : ''}
          {nota.numero ? ` · cupom ${nota.numero}` : ''}
        </p>
        <p className="ml-auto font-display font-extrabold text-brown text-lg">{formatCurrency(nota.total)}</p>
      </div>
      <p className="text-xs text-text-warm mb-2">
        Confira o bloco de cada item. O painel lembra sua escolha para a próxima compra do mesmo item.
      </p>
      <div className="divide-y divide-border/60">
        {itens.map(i => (
          <div key={i.ordem} className="py-2 flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-[12rem]">
              <p className="text-sm font-semibold text-text">{i.nome}</p>
              <p className="text-xs text-text-warm">
                {Number(i.quantidade).toLocaleString('pt-BR')} {i.unidade} × {formatCurrency(i.valor_unitario)}
              </p>
            </div>
            <select
              value={i.categoria}
              onChange={e => trocarCategoria(i.ordem, e.target.value)}
              className={`text-xs font-semibold rounded-lg border-2 px-2 py-1.5 cursor-pointer ${
                i.categoria === 'comida' ? 'border-amber-300 bg-amber-50 text-amber-900'
                : i.categoria === 'limpeza' ? 'border-sky-300 bg-sky-50 text-sky-900'
                : 'border-border bg-gray-50 text-text-warm'}`}
            >
              {CATEGORIAS.map(c => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
            </select>
            <span className="w-20 text-right text-sm font-semibold">{formatCurrency(i.valor_total)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 text-xs text-text-warm flex flex-wrap gap-x-4">
        <span>Comida: <b>{formatCurrency(somaComida)}</b></span>
        <span>Limpeza e embalagens: <b>{formatCurrency(somaLimpeza)}</b></span>
      </div>
      {erro && <p className="text-danger text-sm mt-3">{erro}</p>}
      <div className="flex gap-2 justify-end mt-4">
        <Button type="button" variant="outline" size="sm" onClick={aoCancelar}>Cancelar</Button>
        <Button type="button" size="sm" onClick={aoGravar}>Lançar no painel e nas planilhas</Button>
      </div>
    </div>
  )
}

// -------------------------------------------------------------------------------------------
// Leitura do QR code no aparelho
// -------------------------------------------------------------------------------------------

let jsQRPromise = null
const carregarJsQR = () => (jsQRPromise ??= import('jsqr').then(m => m.default))

/** Decodifica um QR code de um ImageData; BarcodeDetector quando houver, jsQR quando não. */
async function decodificarImageData(imageData, bitmap) {
  if ('BarcodeDetector' in window && bitmap) {
    try {
      const det = new window.BarcodeDetector({ formats: ['qr_code'] })
      const r = await det.detect(bitmap)
      if (r?.[0]?.rawValue) return r[0].rawValue
    } catch { /* cai no jsQR */ }
  }
  const jsQR = await carregarJsQR()
  return jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' })?.data ?? null
}

async function decodificarImagem(arquivo) {
  const bitmap = await createImageBitmap(arquivo)
  // fotos de celular são grandes; 1600 px de lado basta para o QR e poupa memória
  const escala = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * escala)
  canvas.height = Math.round(bitmap.height * escala)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return decodificarImageData(ctx.getImageData(0, 0, canvas.width, canvas.height), bitmap)
}

function LeitorDeQr({ aoLer, aoCancelar, aoErro }) {
  const videoRef = useRef(null)
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    let parar = false
    let stream = null
    let timer = null
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    const ler = async () => {
      if (parar) return
      const v = videoRef.current
      if (v && v.readyState >= 2 && v.videoWidth) {
        const escala = Math.min(1, 800 / Math.max(v.videoWidth, v.videoHeight))
        canvas.width = Math.round(v.videoWidth * escala)
        canvas.height = Math.round(v.videoHeight * escala)
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
        try {
          const texto = await decodificarImageData(ctx.getImageData(0, 0, canvas.width, canvas.height), 'BarcodeDetector' in window ? v : null)
          if (texto && !parar) { parar = true; aoLer(texto); return }
        } catch { /* próximo quadro */ }
      }
      timer = setTimeout(ler, 250)
    }

    navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false })
      .then(s => {
        if (parar) { s.getTracks().forEach(t => t.stop()); return }
        stream = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
          videoRef.current.play().catch(() => {})
        }
        setPronto(true)
        timer = setTimeout(ler, 400)
      })
      .catch(() => aoErro('Sem acesso à câmera. Libere a câmera para o painel, ou use "Enviar foto do cupom".'))

    return () => {
      parar = true
      clearTimeout(timer)
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [aoLer, aoErro])

  return (
    <div className="text-center">
      <div className="relative mx-auto rounded-xl overflow-hidden bg-black" style={{ maxWidth: 420, aspectRatio: '3 / 4' }}>
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-56 border-4 border-secondary rounded-xl" />
        </div>
        {!pronto && <div className="absolute inset-0 flex items-center justify-center text-white text-sm">Abrindo a câmera…</div>}
      </div>
      <p className="text-xs text-text-warm mt-2">Enquadre o QR code do cupom. A leitura é automática.</p>
      <Button type="button" variant="outline" size="sm" className="mt-3" onClick={aoCancelar}>
        <HiRefresh className="mr-1" /> Cancelar
      </Button>
    </div>
  )
}
