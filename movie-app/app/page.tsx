'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import FilterPanel from '@/components/FilterPanel'
import MovieGrid from '@/components/MovieGrid'
import MovieModal from '@/components/MovieModal'

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
  popularityMin: number  // 0–100 percentile
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
}

const PAGE_SIZE = 100

export default function Home() {
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchMovies(filters, sortBy, filterOptions)
  }, [filters, sortBy, filterOptions]) // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [loadingMore, hasMore, loading, page, filters, sortBy, filterOptions]) // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <main className="min-h-screen">
      <header className="border-b border-[rgba(201,168,76,0.15)] bg-[rgba(13,13,13,0.9)] backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#E8C97A]"
              style={{ fontFamily: 'Playfair Display, serif' }}>
              CineMatch
            </h1>
            <p className="text-xs text-[#8C8375] mt-0.5 tracking-widest uppercase">Movie Discovery</p>
          </div>

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
          />
        </aside>

        <div className="flex-1 min-w-0">
          <MovieGrid movies={movies} loading={loading} onSelect={setSelectedMovie} />
          <div ref={sentinelRef} className="h-20 flex items-center justify-center mt-4">
            {loadingMore && (
              <div className="flex gap-2">
                {[0,1,2].map(i => (
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
    </main>
  )
}