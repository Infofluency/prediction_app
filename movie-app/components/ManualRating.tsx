'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'

const TMDB_IMG = 'https://image.tmdb.org/t/p/w342'

type MovieResult = {
  movie_id: number
  title: string
  year: number
  poster_path: string | null
  vote_count: number
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0)

  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map(star => {
        const halfVal = star - 0.5
        return (
          <div key={star} className="relative w-9 h-9 cursor-pointer">
            {/* Left half — half star */}
            <div
              className="absolute inset-y-0 left-0 w-1/2 z-10"
              onMouseEnter={() => setHover(halfVal)}
              onClick={() => onChange(halfVal)}
            />
            {/* Right half — full star */}
            <div
              className="absolute inset-y-0 right-0 w-1/2 z-10"
              onMouseEnter={() => setHover(star)}
              onClick={() => onChange(star)}
            />
            {/* Star display */}
            <svg viewBox="0 0 24 24" className="w-9 h-9">
              <defs>
                <clipPath id={`half-${star}`}>
                  <rect x="0" y="0" width="12" height="24" />
                </clipPath>
              </defs>
              {/* Full star background (empty) */}
              <path
                d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                fill={(hover || value) >= star ? '#C9A84C' : '#2A2520'}
                stroke="#C9A84C"
                strokeWidth="0.5"
              />
              {/* Half star overlay */}
              {(hover || value) >= halfVal && (hover || value) < star && (
                <path
                  d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                  fill="#C9A84C"
                  clipPath={`url(#half-${star})`}
                />
              )}
            </svg>
          </div>
        )
      })}
      {(hover || value) > 0 && (
        <span className="text-sm text-[#E8C97A] ml-2 min-w-[2rem]">
          {(hover || value) % 1 === 0 ? (hover || value).toFixed(0) : (hover || value).toFixed(1)}
        </span>
      )}
      {(hover || value) === 0 && (
        <span className="text-sm ml-2 min-w-[2rem]">&nbsp;</span>
      )}
    </div>
  )
}

export default function ManualRating({
  onClose,
  onRated,
}: {
  onClose: () => void
  onRated: () => void
}) {
  const [currentMovie, setCurrentMovie] = useState<MovieResult | null>(null)
  const [rating, setRating]             = useState(0)
  const [queue, setQueue]               = useState<MovieResult[]>([])
  const [search, setSearch]             = useState('')
  const [searchResults, setSearchResults] = useState<MovieResult[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [saving, setSaving]             = useState(false)
  const [ratedCount, setRatedCount]     = useState(0)
  const searchRef                       = useRef<HTMLInputElement>(null)
  const debounceRef                     = useRef<NodeJS.Timeout>()
  const seenIds                         = useRef<Set<number>>(new Set())

  // Load random movies
  const loadQueue = useCallback(async () => {
    const res = await fetch('/api/movies/random')
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) {
      // Filter out movies already shown this session
      const fresh = data.filter((m: MovieResult) => !seenIds.current.has(m.movie_id))
      if (fresh.length > 0) {
        if (!currentMovie) {
          seenIds.current.add(fresh[0].movie_id)
          setCurrentMovie(fresh[0])
          setQueue(fresh.slice(1))
        } else {
          setQueue(prev => [...prev, ...fresh])
        }
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadQueue()
  }, [loadQueue])

  // Search debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (search.length < 2) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/movies/search?q=${encodeURIComponent(search)}`)
      const data = await res.json()
      setSearchResults(Array.isArray(data) ? data : [])
      setShowDropdown(true)
    }, 300)
  }, [search])

  const selectMovie = (movie: MovieResult) => {
    seenIds.current.add(movie.movie_id)
    setCurrentMovie(movie)
    setRating(0)
    setSearch('')
    setSearchResults([])
    setShowDropdown(false)
  }

  const nextMovie = () => {
    setRating(0)
    // Find next unseen movie in queue
    let next: MovieResult | null = null
    let remaining = [...queue]

    while (remaining.length > 0) {
      const candidate = remaining.shift()!
      if (!seenIds.current.has(candidate.movie_id)) {
        next = candidate
        break
      }
    }

    if (next) {
      seenIds.current.add(next.movie_id)
      setCurrentMovie(next)
      setQueue(remaining)
      if (remaining.length < 5) loadQueue()
    } else {
      setCurrentMovie(null)
      loadQueue()
    }
  }

  const handleRate = async () => {
    if (!currentMovie || rating === 0 || saving) return

    setSaving(true)
    try {
      await fetch('/api/user/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movieId: currentMovie.movie_id, rating }),
      })
      setRatedCount(prev => prev + 1)
      onRated()
      nextMovie()
    } finally {
      setSaving(false)
    }
  }

  const posterUrl = currentMovie?.poster_path ? `${TMDB_IMG}${currentMovie.poster_path}` : null

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center px-4"
      style={{ zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.85)' }}
    >
      <div className="bg-[#1A1714] border border-[rgba(201,168,76,0.2)] rounded-lg w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header with search */}
        <div className="p-5 pb-3 border-b border-[rgba(201,168,76,0.1)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-[#F5F0E8]"
              style={{ fontFamily: 'Playfair Display, serif' }}>
              Rate Movies
            </h3>
            {ratedCount > 0 && (
              <span className="text-xs text-[#8C8375]">{ratedCount} rated</span>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onFocus={() => { if (searchResults.length > 0) setShowDropdown(true) }}
              placeholder="Search for a movie..."
              className="w-full bg-[#231F1B] border border-[rgba(201,168,76,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F0E8] placeholder-[#8C8375] focus:outline-none focus:border-[#C9A84C]"
            />

            {/* Search dropdown */}
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#1A1714] border border-[rgba(201,168,76,0.2)] rounded-md overflow-hidden z-50 max-h-64 overflow-y-auto">
                {searchResults.map(movie => (
                  <button
                    key={movie.movie_id}
                    onClick={() => selectMovie(movie)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-[#231F1B] transition-colors"
                  >
                    <div className="w-8 h-12 flex-shrink-0 rounded overflow-hidden bg-[#231F1B]">
                      {movie.poster_path ? (
                        <Image
                          src={`${TMDB_IMG}${movie.poster_path}`}
                          alt={movie.title}
                          width={32}
                          height={48}
                          className="object-cover w-full h-full"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#8C8375] text-[8px]">?</div>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-[#F5F0E8]">{movie.title}</p>
                      <p className="text-xs text-[#8C8375]">{movie.year}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Movie display */}
        {currentMovie ? (
          <div className="p-5 flex flex-col items-center">
            {/* Poster */}
            <div className="w-48 rounded-lg overflow-hidden shadow-lg mb-4" style={{ aspectRatio: '2/3' }}>
              {posterUrl ? (
                <Image
                  src={posterUrl}
                  alt={currentMovie.title}
                  width={192}
                  height={288}
                  className="object-cover w-full h-full"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#231F1B]">
                  <span className="text-[#8C8375] text-xs text-center px-2">{currentMovie.title}</span>
                </div>
              )}
            </div>

            {/* Title */}
            <h4 className="text-lg font-semibold text-[#F5F0E8] text-center mb-1"
              style={{ fontFamily: 'Playfair Display, serif' }}>
              {currentMovie.title}
            </h4>
            <p className="text-xs text-[#8C8375] mb-5">{currentMovie.year}</p>

            {/* Star rating */}
            <div className="mb-6">
              <StarRating value={rating} onChange={setRating} />
            </div>

            {/* Actions */}
            <div className="flex gap-3 w-full">
              <button
                onClick={handleRate}
                disabled={rating === 0 || saving}
                className="flex-1 bg-[#C9A84C] text-[#0D0D0D] font-medium rounded-md py-2.5 text-sm hover:bg-[#E8C97A] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Log Rating'}
              </button>
              <button
                onClick={nextMovie}
                className="px-4 border border-[rgba(201,168,76,0.2)] rounded-md py-2.5 text-sm text-[#8C8375] hover:text-[#E8C97A] hover:border-[rgba(201,168,76,0.4)] transition-colors"
              >
                Haven't Seen It
              </button>
            </div>
          </div>
        ) : (
          <div className="p-12 flex items-center justify-center">
            <div className="flex gap-2">
              {[0,1,2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-[#C9A84C] animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[rgba(201,168,76,0.1)]">
          <button
            onClick={onClose}
            className="w-full text-center text-xs text-[#8C8375] hover:text-[#E8C97A] transition-colors py-1"
          >
            Exit Ratings
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}