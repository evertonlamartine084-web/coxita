// Chave liga/desliga que salva no clique. Mesmo desenho da chave das
// Configuracoes, em tamanho menor para caber numa linha de tabela.
export default function Interruptor({ ligado, onClick, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={label}
      title={ligado ? 'No cardápio · clique para tirar' : 'Fora do cardápio · clique para pôr'}
      disabled={disabled}
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${ligado ? 'bg-green-600' : 'bg-gray-300'}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${ligado ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}
