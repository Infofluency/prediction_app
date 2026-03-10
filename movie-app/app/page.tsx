'use client'

import { useEffect, useState, useCallback } from 'react'
import FilterPanel from '@/components/FilterPanel'
import MovieGrid from '@/components/MovieGrid'
import MovieModal from '@/components/MovieModal'

export type Movie = {
  id: number
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
  genre: string
  language: string
  country: string
  provider: string
  includeRentBuy: boolean
  runtimeMin: number
  runtimeMax: number
  yearMin: number
  yearMax: number
}

export type FilterOptions = {
  providers: string[]
  genres: string[]
  languages: string[]
  countries: string[]
  yearRange: { min_year: number; max_year: number }
}

const DEFAULT_FILTERS: Filters = {
  genre: '',
  language: '',
  country: '',
  provider: '',
  includeRentBuy: false,
  runtimeMin: 0,
  runtimeMax: 300,
  yearMin: 1900,
  yearMax: new Date().getFullYear(),
}

export default function Home() {
  const [movies, setMovies]           = useState<Movie[]>([])
  const [loading, setLoading]         = useState(true)
  const [filters, setFilters]         = useState<Filters>(DEFAULT_FILTERS)
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null)
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null)

  // Load filter options once
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

  // Load movies whenever filters change
  const fetchMovies = useCallback(async (f: Filters) => {
    setLoading(true)
    const params = new URLSearchParams({
      genre:          f.genre,
      language:       f.language,
      country:        f.country,
      provider:       f.provider,
      includeRentBuy: String(f.includeRentBuy),
      runtimeMin:     String(f.runtimeMin),
      runtimeMax:     String(f.runtimeMax),
      yearMin:        String(f.yearMin),
      yearMax:        String(f.yearMax),
    })
    try {
      const res = await fetch(`/api/movies?${params}`)
      const data = await res.json()
      setMovies(Array.isArray(data) ? data : [])
    } catch {
      setMovies([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMovies(filters)
  }, [filters, fetchMovies])

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-[rgba(201,168,76,0.15)] bg-[rgba(13,13,13,0.9)] backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1
              className="text-2xl font-bold tracking-tight text-[#E8C97A]"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              CineMatch
            </h1>
            <p className="text-xs text-[#8C8375] mt-0.5 tracking-widest uppercase">
              Movie Discovery
            </p>
          </div>
          <div className="text-sm text-[#8C8375]">
            {loading ? (
              <span className="animate-pulse">Loading…</span>
            ) : (
              <span>{movies.length.toLocaleString()} films</span>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-6 py-8 flex gap-8">
        {/* Sidebar filters */}
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

        {/* Movie grid */}
        <div className="flex-1 min-w-0">
          <MovieGrid
            movies={movies}
            loading={loading}
            onSelect={setSelectedMovie}
          />
        </div>
      </div>

      {/* Movie detail modal */}
      {selectedMovie && (
        <MovieModal
          movie={selectedMovie}
          onClose={() => setSelectedMovie(null)}
        />
      )}
    </main>
  )
}
