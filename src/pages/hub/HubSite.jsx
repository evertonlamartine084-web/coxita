import { useOutletContext } from 'react-router-dom'
import Loading from '../../components/ui/Loading'
import { Bloco, Cartao, Funil, GraficoDias, Ranking, SemDados } from '../../components/hub/HubUi'
import { formatPercent } from '../../utils/format'
import { variacao, normalizarData, diasDoPeriodo, formatarNumero, formatarDuracao, CANAIS_GA, APARELHOS } from '../../utils/hub'

/** Site (Google Analytics): quantos visitaram, de onde vieram, o que viram e onde desistiram. */
export default function HubSite() {
  const { periodo, google, carregandoGoogle } = useOutletContext()
  if (!google || (carregandoGoogle && !google.analytics)) return <Loading />
  const ga = google.analytics
  if (!ga) return <SemDados fonte="Google Analytics" erro={google.erro || google.erros?.join(' ')} />

  const t = ga.totais.find(x => (x.periodo ?? 0) === 0) ?? {}
  const t0 = ga.totais.find(x => x.periodo === 1) ?? {}
  const porDia = new Map(ga.porDia.map(d => [normalizarData(d.date), d]))
  const grafico = diasDoPeriodo(periodo).map(data => ({
    data, barra: porDia.get(data)?.sessions ?? 0, linha: porDia.get(data)?.activeUsers ?? 0,
  }))

  // cada pedido tem a própria página de confirmação e de acompanhar: junta numa linha só
  const juntar = (lista, chave, metrica) => {
    const m = new Map()
    for (const x of lista) {
      const nome = (x[chave] || '(sem página)').replace(/^\/(pedido-confirmado|pagamento-falhou|acompanhar)\/.+/, '/$1/…')
      m.set(nome, (m.get(nome) ?? 0) + x[metrica])
    }
    return [...m].map(([nome, valor]) => ({ nome, valor })).sort((x, y) => y.valor - x.valor)
  }

  const ev = (nome, p = 0) => ga.funil.find(f => f.eventName === nome && (f.periodo ?? 0) === p)?.totalUsers ?? 0
  const totalCanais = ga.canais.reduce((s, c) => s + c.sessions, 0) || 1

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cartao titulo="Visitas" valor={formatarNumero(t.sessions)} variacao={variacao(t.sessions, t0.sessions)} destaque />
        <Cartao titulo="Pessoas" valor={formatarNumero(t.activeUsers)} variacao={variacao(t.activeUsers, t0.activeUsers)} detalhe={`${formatarNumero(t.newUsers)} pela 1ª vez`} />
        <Cartao titulo="Páginas vistas" valor={formatarNumero(t.screenPageViews)} variacao={variacao(t.screenPageViews, t0.screenPageViews)} />
        <Cartao titulo="Tempo médio" valor={formatarDuracao(t.averageSessionDuration)} detalhe={`${formatPercent((t.engagementRate || 0) * 100, 0)} engajadas`} />
      </div>

      <Bloco titulo="Visitas por dia" subtitulo="Barras: visitas. Linha: pessoas diferentes.">
        <GraficoDias dados={grafico} nomeBarra="Visitas" nomeLinha="Pessoas" formatarBarra={(v) => `${v} visitas`} formatarLinha={(v) => `${v} pessoas`} />
      </Bloco>

      <div className="grid gap-5 md:grid-cols-2">
        <Bloco titulo="De onde vieram" subtitulo="Pelo tipo de origem.">
          <Ranking
            itens={ga.canais.map(c => ({
              nome: CANAIS_GA[c.sessionDefaultChannelGroup] ?? c.sessionDefaultChannelGroup,
              valor: c.sessions,
              texto: `${c.sessions}`,
              extra: formatPercent((c.sessions / totalCanais) * 100, 0),
            }))}
          />
        </Bloco>

        <Bloco titulo="Do carrinho ao pedido" subtitulo="Pessoas que chegaram em cada etapa no site.">
          <Funil etapas={[
            { nome: 'Entraram no site', valor: ev('session_start') },
            { nome: 'Puseram no carrinho', valor: ev('add_to_cart') },
            { nome: 'Foram para o checkout', valor: ev('begin_checkout') },
            { nome: 'Fizeram o pedido', valor: ev('purchase') },
          ]} />
          <p className="mt-3 text-sm">
            <strong>{ev('generate_lead')}</strong> pessoas clicaram para chamar no WhatsApp
            <span className="text-text-light"> (antes: {ev('generate_lead', 1)})</span>.
          </p>
        </Bloco>

        <Bloco titulo="Sites e redes que mandaram visita" subtitulo="Origem / meio, como o Google registra.">
          <Ranking itens={ga.origens.map(o => ({ nome: `${o.sessionSource} / ${o.sessionMedium}`, valor: o.sessions, extra: o.keyEvents ? `${o.keyEvents} conv.` : null }))} />
        </Bloco>

        <Bloco titulo="Página de entrada" subtitulo="Onde a visita começou.">
          <Ranking itens={juntar(ga.entrada, 'landingPage', 'sessions')} cor="bg-accent/15" />
        </Bloco>

        <Bloco titulo="Páginas mais vistas">
          <Ranking itens={juntar(ga.paginas, 'pagePath', 'screenPageViews')} formatar={(v) => `${v} vistas`} cor="bg-accent/15" />
        </Bloco>

        <Bloco titulo="Celular ou computador">
          <Ranking itens={ga.aparelhos.map(a => ({ nome: APARELHOS[a.deviceCategory] ?? a.deviceCategory, valor: a.sessions }))} cor="bg-festa/15" />
          <h3 className="mb-2 mt-5 text-sm font-semibold text-brown">Cidades</h3>
          <Ranking itens={ga.cidades.map(c => ({ nome: c.city === '(not set)' ? 'Não identificada' : c.city, valor: c.activeUsers }))} cor="bg-festa/15" limite={6} />
        </Bloco>

        <Bloco titulo="Horário das visitas">
          <Ranking
            itens={[...ga.horas].sort((x, y) => y.sessions - x.sessions).map(h => ({ nome: `${Number(h.hour)}h`, valor: h.sessions }))}
            limite={8}
          />
        </Bloco>
      </div>
    </div>
  )
}
