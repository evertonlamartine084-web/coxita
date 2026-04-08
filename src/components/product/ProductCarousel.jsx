import { useRef } from 'react'
import { HiChevronLeft, HiChevronRight } from 'react-icons/hi'
import ProductCard from './ProductCard'

export default function ProductCarousel({ products, title }) {
  const scrollRef = useRef(null)

  const scroll = (direction) => {
    if (!scrollRef.current) return
    const cardWidth = 300
    const gap = 24
    const distance = cardWidth + gap
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    })
  }

  if (!products?.length) return null

  return (
    <div className="relative">
      {title && <h2 className="text-2xl md:text-3xl font-bold text-center mb-6">{title}</h2>}

      <div className="relative group">
        {/* Left arrow */}
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/90 shadow-lg rounded-full p-2 text-primary hover:bg-primary hover:text-white transition-colors opacity-0 group-hover:opacity-100 -translate-x-1/2"
        >
          <HiChevronLeft size={24} />
        </button>

        {/* Cards */}
        <div
          ref={scrollRef}
          className="flex gap-6 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-4 px-1 scrollbar-hide"
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
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/90 shadow-lg rounded-full p-2 text-primary hover:bg-primary hover:text-white transition-colors opacity-0 group-hover:opacity-100 translate-x-1/2"
        >
          <HiChevronRight size={24} />
        </button>
      </div>

      {/* Dots indicator */}
      <div className="flex justify-center gap-1.5 mt-4">
        {products.map((_, i) => (
          <button
            key={i}
            onClick={() => {
              if (!scrollRef.current) return
              const cardWidth = 300 + 24
              scrollRef.current.scrollTo({ left: cardWidth * i, behavior: 'smooth' })
            }}
            className="w-2 h-2 rounded-full bg-primary/30 hover:bg-primary transition-colors"
          />
        ))}
      </div>
    </div>
  )
}
