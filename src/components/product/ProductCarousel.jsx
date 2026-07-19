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
        <h2 className="font-display text-5xl md:text-6xl font-black uppercase leading-none text-left mb-8 text-brown">
          <span className="underline-hand">{title}</span>
        </h2>
      )}

      <div className="relative group">
        {/* Left arrow */}
        {canScrollLeft && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-secondary border-2 border-brown p-2.5 text-brown hover:bg-brand transition-colors opacity-0 group-hover:opacity-100 -translate-x-3 cursor-pointer"
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
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-secondary border-2 border-brown p-2.5 text-brown hover:bg-brand transition-colors opacity-0 group-hover:opacity-100 translate-x-3 cursor-pointer"
          >
            <HiChevronRight size={22} />
          </button>
        )}
      </div>

    </div>
  )
}
