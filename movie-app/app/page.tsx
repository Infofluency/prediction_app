'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import FilterPanel from '@/components/FilterPanel'
import MovieGrid from '@/components/MovieGrid'
import MovieModal from '@/components/MovieModal'
import LetterboxdImport from '@/components/LetterboxdImport'
import ManualRating from '@/components/ManualRating'
import OnboardingModal from '@/components/OnboardingModal'

export type Movie = {
  movie_id: number
  title: string
  popularity: number
  release_date: string
  vote_average: number
  vote_count: number
  original_language: string
  overview: string
  runtime: number | null
  genres: string | null
  production_countries: string | null
  budget: number | null
  revenue: number | null
  imdb_id: string | null
  poster_path: string | null
}

export type Filters = {
  genres: string[]
  languages: string[]
  countries: string[]
  providers: string[]
  includeRentBuy: boolean
  runtimeMin: number
  runtimeMax: number
  yearMin: number
  yearMax: number
  popularityMin: number
  hideWatched: boolean
  watchlistOnly: boolean
}

export type FilterOptions = {
  providers: string[]
  genres: string[]
  languages: string[]
  countries: string[]
  yearRange: { min_year: number; max_year: number }
  popularityRange: { min_popularity: number; max_popularity: number }
}

export type SortOption = { value: string; label: string }

export const SORT_OPTIONS: SortOption[] = [
  { value: 'vote_count',        label: 'Most Popular' },
  { value: 'vote_average',      label: 'Highest Rated' },
  { value: 'release_date_desc', label: 'Newest First' },
  { value: 'release_date_asc',  label: 'Oldest First' },
  { value: 'title_asc',         label: 'A → Z' },
  { value: 'title_desc',        label: 'Z → A' },
  { value: 'runtime_asc',       label: 'Shortest First' },
  { value: 'runtime_desc',      label: 'Longest First' },
]

const DEFAULT_FILTERS: Filters = {
  genres:         [],
  languages:      [],
  countries:      [],
  providers:      [],
  includeRentBuy: false,
  runtimeMin:     0,
  runtimeMax:     300,
  yearMin:        1900,
  yearMax:        new Date().getFullYear(),
  popularityMin:  0,
  hideWatched:    false,
  watchlistOnly:  false,
}

const PAGE_SIZE = 100

export default function Home() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [movies, setMovies]               = useState<Movie[]>([])
  const [loading, setLoading]             = useState(true)
  const [loadingMore, setLoadingMore]     = useState(false)
  const [page, setPage]                   = useState(1)
  const [hasMore, setHasMore]             = useState(true)
  const [filters, setFilters]             = useState<Filters>(DEFAULT_FILTERS)
  const [sortBy, setSortBy]               = useState('vote_count')
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null)
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null)
  const sentinelRef                       = useRef<HTMLDivElement>(null)

  // User library data
  const [userWatchlist, setUserWatchlist] = useState<Set<number>>(new Set())
  const [userRatings, setUserRatings]     = useState<Record<number, number>>({})

  // Modal states
  const [showOnboarding, setShowOnboarding]     = useState(false)
  const [showManualRating, setShowManualRating] = useState(false)
  const [importKey, setImportKey]               = useState(0)
  const [hasLetterboxd, setHasLetterboxd]       = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') {
      const isGuest = document.cookie.includes('guest=true')
      if (!isGuest) {
        router.push('/login')
      }
    }
  }, [status, router])

  useEffect(() => {
    fetch('/api/filters')
      .then(r => r.json())
      .then((opts: FilterOptions) => {
        setFilterOptions(opts)
        if (opts.yearRange) {
          setFilters(f => ({
            ...f,
            yearMin: opts.yearRange.min_year,
            yearMax: opts.yearRange.max_year,
          }))
        }
      })
  }, [])

  // Fetch user library + check onboarding
  const refreshLibrary = useCallback(() => {
    fetch('/api/user/library')
      .then(r => r.json())
      .then(data => {
        setUserWatchlist(new Set(data.watchlist || []))
        setUserRatings(data.ratings || {})
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (session) {
      refreshLibrary()

      // Show onboarding if:
      // 1. Coming from signup with ?onboard=true
      // 2. New Google user (isNewUser flag in session)
      const shouldOnboard =
        searchParams.get('onboard') === 'true' || !!(session.user as any)?.isNewUser

      if (shouldOnboard) {
        fetch('/api/letterboxd/import')
          .then(r => r.json())
          .then(data => {
            // Only show onboarding if they haven't imported data yet
            if (!data.imported) {
              setHasLetterboxd(!!data.hasLetterboxd)
              setShowOnboarding(true)
            }
            // Clean up URL if it has the param
            if (searchParams.get('onboard')) {
              router.replace('/', { scroll: false })
            }
          })
          .catch(() => {})
      }
    }
  }, [session, searchParams, refreshLibrary, router])

  const buildParams = (f: Filters, s: string, p: number, opts: FilterOptions | null) =>
    new URLSearchParams({
      genre:          (f.genres    ?? []).join(','),
      language:       (f.languages ?? []).join(','),
      country:        (f.countries ?? []).join(','),
      provider:       (f.providers ?? []).join(','),
      includeRentBuy: String(f.includeRentBuy),
      runtimeMin:     String(f.runtimeMin),
      runtimeMax:     String(f.runtimeMax),
      yearMin:        String(f.yearMin),
      yearMax:        String(f.yearMax),
      popularityMin:  String(f.popularityMin ?? 0),
      popRawMin:      String(opts?.popularityRange?.min_popularity ?? 0),
      popRawMax:      String(opts?.popularityRange?.max_popularity ?? 999999),
      sortBy:         s,
      page:           String(p),
      hideWatched:    String(f.hideWatched),
      watchlistOnly:  String(f.watchlistOnly),
      userId:         String((session?.user as any)?.userId || ''),
    })

  const fetchMovies = useCallback(async (f: Filters, s: string, opts: FilterOptions | null) => {
    setLoading(true)
    setMovies([])
    setPage(1)
    setHasMore(true)
    try {
      const res  = await fetch(`/api/movies?${buildParams(f, s, 1, opts)}`)
      const data = await res.json()
      const rows = Array.isArray(data) ? data : []
      setMovies(rows)
      setHasMore(rows.length === PAGE_SIZE)
    } catch {
      setMovies([])
    } finally {
      setLoading(false)
    }
  }, [session]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchMovies(filters, sortBy, filterOptions)
  }, [filters, sortBy, filterOptions, session]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || loading) return
    setLoadingMore(true)
    const nextPage = page + 1
    try {
      const res  = await fetch(`/api/movies?${buildParams(filters, sortBy, nextPage, filterOptions)}`)
      const data = await res.json()
      const rows = Array.isArray(data) ? data : []
      setMovies(prev => [...prev, ...rows])
      setPage(nextPage)
      setHasMore(rows.length === PAGE_SIZE)
    } catch {
      // silent
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore, loading, page, filters, sortBy, filterOptions, session]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) loadMore() },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore])

  if (status === 'loading') {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="flex gap-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full bg-[#C9A84C] animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-[rgba(201,168,76,0.15)] bg-[rgba(13,13,13,0.9)] backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">

          {/* Left: branding + nav */}
          <div className="flex items-center gap-8">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#E8C97A]"
                style={{ fontFamily: 'Playfair Display, serif' }}>
                CineMatch
              </h1>
              <p className="text-xs text-[#8C8375] mt-0.5 tracking-widest uppercase">Movie Discovery</p>
            </div>
            <nav className="flex items-center gap-1">
              <span
                className="px-3 py-1.5 rounded-md text-xs font-medium tracking-wider uppercase text-[#E8C97A] bg-[rgba(201,168,76,0.12)] border border-[rgba(201,168,76,0.2)] cursor-default"
              >
                Browse
              </span>
              <Link
                href="/next-watch"
                className="px-3 py-1.5 rounded-md text-xs font-medium tracking-wider uppercase text-[#8C8375] hover:text-[#E8C97A] hover:bg-[rgba(201,168,76,0.08)] transition-colors"
              >
                My Next Watch
              </Link>
            </nav>
          </div>

          {/* Right: sort + user controls */}
          <div className="flex items-center gap-4">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="bg-[#1A1714] border border-[rgba(201,168,76,0.2)] rounded-md px-3 py-1.5 text-sm text-[#F5F0E8] focus:outline-none focus:border-[#C9A84C] transition-colors cursor-pointer"
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <div className="text-sm text-[#8C8375] w-24 text-right">
              {loading
                ? <span className="animate-pulse">Loading…</span>
                : <span>{movies.length.toLocaleString()} films</span>
              }
            </div>

            {session ? (
              <div className="flex items-center gap-2 border-l border-[rgba(201,168,76,0.15)] pl-4">
                <LetterboxdImport key={importKey} onImportComplete={refreshLibrary} />
                <button
                  onClick={() => setShowManualRating(true)}
                  className="text-xs px-2 py-1 border border-[rgba(201,168,76,0.2)] rounded text-[#8C8375] hover:text-[#E8C97A] hover:border-[rgba(201,168,76,0.4)] transition-colors"
                >
                  Rate Movies
                </button>
                <span className="text-xs text-[#8C8375] max-w-[120px] truncate ml-1">
                  {session.user?.name || session.user?.email}
                </span>
                <button
                  onClick={() => {
                    document.cookie = 'guest=; path=/; max-age=0'
                    signOut({ callbackUrl: '/login' })
                  }}
                  className="text-xs text-[#8C8375] hover:text-[#E8C97A] transition-colors"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="text-xs px-3 py-1.5 border border-[rgba(201,168,76,0.3)] rounded-md text-[#E8C97A] hover:bg-[rgba(201,168,76,0.1)] transition-colors"
              >
                Sign in
              </Link>
            )}
          </div>

        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-6 py-8 flex gap-8">
        <aside className="w-64 flex-shrink-0">
          <FilterPanel
            filters={filters}
            options={filterOptions}
            onChange={setFilters}
            onReset={() => setFilters(
              filterOptions
                ? {
                    ...DEFAULT_FILTERS,
                    yearMin: filterOptions.yearRange?.min_year ?? DEFAULT_FILTERS.yearMin,
                    yearMax: filterOptions.yearRange?.max_year ?? DEFAULT_FILTERS.yearMax,
                  }
                : DEFAULT_FILTERS
            )}
            isLoggedIn={!!session}
          />
        </aside>

        <div className="flex-1 min-w-0">
          <MovieGrid
            movies={movies}
            loading={loading}
            onSelect={setSelectedMovie}
            userWatchlist={userWatchlist}
            userRatings={userRatings}
          />
          <div ref={sentinelRef} className="h-20 flex items-center justify-center mt-4">
            {loadingMore && (
              <div className="flex gap-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full bg-[#C9A84C] animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            )}
            {!hasMore && movies.length > 0 && !loading && (
              <p className="text-xs text-[#8C8375]">All films loaded</p>
            )}
          </div>
        </div>
      </div>

      {selectedMovie && (
        <MovieModal movie={selectedMovie} onClose={() => setSelectedMovie(null)} />
      )}

      {/* Onboarding modal — first login only */}
      {showOnboarding && (
        <OnboardingModal
          hasLetterboxd={hasLetterboxd}
          onSyncLetterboxd={() => {
            setShowOnboarding(false)
            refreshLibrary()
            setImportKey(k => k + 1)
          }}
          onRateManually={() => {
            setShowOnboarding(false)
            setShowManualRating(true)
          }}
          onClose={() => {
            setShowOnboarding(false)
          }}
        />
      )}

      {/* Manual rating modal */}
      {showManualRating && (
        <ManualRating
          onClose={() => setShowManualRating(false)}
          onRated={refreshLibrary}
        />
      )}
    </main>
  )
}