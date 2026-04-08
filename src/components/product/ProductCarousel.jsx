import { useRef, useState, useEffect } from 'react'
import { HiChevronLeft, HiChevronRight } from 'react-icons/hi'
import ProductCard from './ProductCard'

export default function ProductCarousel({ products, title }) {
  const scrollRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  const checkScroll = () => {
    if (!scrollRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
    setCanScrollLeft(scrollLeft > 10)
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.addEventListener('scroll', checkScroll, { passive: true })
      checkScroll()
      return () => el.removeEventListener('scroll', checkScroll)
    }
  }, [products])

  const scroll = (direction) => {
    if (!scrollRef.current) return
    const distance = 320
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    })
  }

  if (!products?.length) return null

  return (
    <div className="relative">
      {title && (
        <h2 className="font-display text-2xl md:text-3xl font-extrabold text-center mb-8">
          <span className="underline-hand">{title}</span>
        </h2>
      )}

      <div className="relative group">
        {/* Left arrow */}
        {canScrollLeft && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white shadow-xl rounded-full p-2.5 text-primary hover:bg-primary hover:text-white transition-all duration-200 opacity-0 group-hover:opacity-100 -translate-x-3 hover:scale-110 cursor-pointer"
          >
            <HiChevronLeft size={22} />
          </button>
        )}

        {/* Cards */}
        <div
          ref={scrollRef}
          className="flex gap-5 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-4 px-1 scrollbar-hide"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {products.map((product) => (
            <div
              key={product.id}
              className="snap-start shrink-0 w-[280px] sm:w-[300px]"
            >
              <ProductCard product={product} />
            </div>
          ))}
        </div>

        {/* Right arrow */}
        {canScrollRight && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white shadow-xl rounded-full p-2.5 text-primary hover:bg-primary hover:text-white transition-all duration-200 opacity-0 group-hover:opacity-100 translate-x-3 hover:scale-110 cursor-pointer"
          >
            <HiChevronRight size={22} />
          </button>
        )}
      </div>

      {/* Scroll hint dots */}
      {products.length > 1 && (
        <div className="flex justify-center gap-1 mt-5">
          {products.slice(0, Math.min(products.length, 6)).map((_, i) => (
            <button
              key={i}
              onClick={() => {
                if (!scrollRef.current) return
                const cardWidth = 300 + 20
                scrollRef.current.scrollTo({ left: cardWidth * i, behavior: 'smooth' })
              }}
              className="w-2 h-2 rounded-full bg-primary/20 hover:bg-primary/60 transition-colors cursor-pointer"
            />
          ))}
          {products.length > 6 && (
            <span className="text-text-light text-xs ml-1">...</span>
          )}
        </div>
      )}
    </div>
  )
}
