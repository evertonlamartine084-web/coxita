import { useEffect, useState } from 'react'
import { HiStar } from 'react-icons/hi'
import { getAllReviews } from '../../services/reviews'
import { formatDate } from '../../utils/format'

export default function ReviewsPage() {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAllReviews()
      .then(setReviews)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : 0

  const ratingCounts = [5, 4, 3, 2, 1].map(star => ({
    star,
    count: reviews.filter(r => r.rating === star).length,
  }))

  if (loading) return <p className="text-gray-500">Carregando...</p>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Avaliacoes</h1>

      {reviews.length === 0 ? (
        <p className="text-gray-500">Nenhuma avaliacao ainda.</p>
      ) : (
        <>
          {/* Summary */}
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6 flex flex-col sm:flex-row gap-6 items-center">
            <div className="text-center">
              <p className="text-5xl font-bold text-gray-900">{avgRating}</p>
              <div className="flex justify-center gap-0.5 my-1">
                {[1, 2, 3, 4, 5].map(s => (
                  <HiStar key={s} size={18} className={s <= Math.round(avgRating) ? 'text-yellow-400' : 'text-gray-200'} />
                ))}
              </div>
              <p className="text-gray-500 text-sm">{reviews.length} avaliacoes</p>
            </div>
            <div className="flex-1 w-full space-y-1.5">
              {ratingCounts.map(({ star, count }) => (
                <div key={star} className="flex items-center gap-2 text-sm">
                  <span className="w-3 text-gray-500">{star}</span>
                  <HiStar size={14} className="text-yellow-400" />
                  <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                    <div
                      className="bg-yellow-400 h-2.5 rounded-full transition-all"
                      style={{ width: reviews.length > 0 ? `${(count / reviews.length) * 100}%` : '0%' }}
                    />
                  </div>
                  <span className="w-6 text-right text-gray-400">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Reviews list */}
          <div className="space-y-3">
            {reviews.map(review => (
              <div key={review.id} className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-semibold text-gray-900">{review.customer_name}</p>
                    <p className="text-xs text-gray-400">Pedido #{review.order_number}</p>
                  </div>
                  <div className="text-right">
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map(s => (
                        <HiStar key={s} size={16} className={s <= review.rating ? 'text-yellow-400' : 'text-gray-200'} />
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDate(review.created_at)}</p>
                  </div>
                </div>
                {review.comment && (
                  <p className="text-gray-600 text-sm italic">"{review.comment}"</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
