import { useEffect, useState } from 'react'
import { getAppInstallStats } from '../../services/appInstalls'

/**
 * Base instalada do app.
 *
 * São dois números porque a web não permite um só. Ninguém consegue saber quantas pessoas TÊM o
 * app agora: não existe evento nem consulta de desinstalação. O que dá pra medir é:
 *   - quantos aparelhos já instalaram (só sobe, nunca desce, mesmo depois de desinstalar);
 *   - quantos abriram o app nos últimos 30 dias — que é o número honesto de base viva, porque
 *     quem desinstalou some da conta sozinho.
 * O painel mostra "ativos" em destaque e o total como referência.
 */
export default function AppInstallsCard() {
  const [stats, setStats] = useState(null)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    getAppInstallStats().then(setStats).catch((e) => setErro(e.message))
  }, [])

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="font-semibold text-lg">App instalado</h2>
          <p className="text-gray-500 text-sm">Quantas pessoas usam o Coxelli como aplicativo</p>
        </div>
      </div>

      {erro && (
        <p className="text-sm text-red-600">
          Não foi possível carregar: {erro}
        </p>
      )}

      {!erro && !stats && <p className="text-sm text-gray-400">Carregando…</p>}

      {stats && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Numero
              destaque
              label="Usando o app (30 dias)"
              valor={stats.ativos_30d}
              nota="abriram pelo ícone"
            />
            <Numero label="Usando (7 dias)" valor={stats.ativos_7d} />
            <Numero label="Instalaram (30 dias)" valor={stats.novos_30d} />
            <Numero label="Já instalaram" valor={stats.instalados} nota="total histórico" />
          </div>

          <p className="mt-4 text-xs leading-relaxed text-gray-500">
            O navegador não avisa quando alguém desinstala o app, então{' '}
            <strong>Já instalaram</strong> nunca diminui. Para saber o tamanho real da base, use{' '}
            <strong>Usando o app</strong>: quem desinstalou para de aparecer sozinho.
          </p>
        </>
      )}
    </div>
  )
}

function Numero({ label, valor, nota, destaque }) {
  return (
    <div className={destaque ? 'rounded-lg bg-primary/5 p-3' : 'p-3'}>
      <p className="text-gray-500 text-xs">{label}</p>
      <p className={destaque ? 'text-3xl font-bold text-primary' : 'text-2xl font-bold'}>
        {valor ?? 0}
      </p>
      {nota && <p className="text-[11px] text-gray-400 mt-0.5">{nota}</p>}
    </div>
  )
}
