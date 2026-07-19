import { HiStar } from 'react-icons/hi'
import { useLoyaltyStore } from '../../store/loyaltyStore'

export default function LoyaltyCard({ goal }) {
  const loyaltyGoal = parseInt(goal) || 0
  const getProgress = useLoyaltyStore(s => s.getProgress)

  if (loyaltyGoal <= 0) return null

  const { current, canRedeem, totalEarned } = getProgress(loyaltyGoal)
  const percentage = Math.min((current / loyaltyGoal) * 100, 100)

  return (
    <div className="bg-cream border-[3px] border-brown p-5 shadow-[5px_5px_0_#5d2b04]">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-secondary border-2 border-brown flex items-center justify-center">
          <HiStar className="text-primary" size={22} />
        </div>
        <div>
          <h3 className="font-display font-extrabold uppercase text-brown text-xl leading-none">Cartão fidelidade</h3>
          <p className="text-text-light text-sm">A cada {loyaltyGoal} coxinhas, ganhe 1 grátis!</p>
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex gap-1.5 justify-center mb-3">
        {Array.from({ length: loyaltyGoal }).map((_, i) => (
          <div
            key={i}
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              i < current
                ? 'bg-secondary text-primary-dark scale-105'
                : 'bg-border/40 text-text-light'
            }`}
          >
            {i < current ? <HiStar size={14} /> : i + 1}
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="w-full bg-border/30 rounded-full h-2 mb-2">
        <div
          className="bg-gradient-to-r from-secondary to-primary h-2 rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>

      <p className="text-center text-xs text-text-light">
        {canRedeem ? (
          <span className="text-accent font-bold">Você tem {totalEarned} coxinha(s) grátis! Avise no pedido.</span>
        ) : (
          <span>Faltam <strong className="text-primary">{loyaltyGoal - current}</strong> coxinhas para ganhar 1 gratis</span>
        )}
      </p>
    </div>
  )
}
