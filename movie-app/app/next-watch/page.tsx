'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession, signOut }               from 'next-auth/react'
import { useRouter }                          from 'next/navigation'
import Link                                   from 'next/link'
import Image                                  from 'next/image'
import { Sparkles, Eye, SkipForward, CheckCircle2, Star } from 'lucide-react'

import FilterPanel          from '@/components/FilterPanel'
import MovieModal           from '@/components/MovieModal'
import NextWatchRatingModal from '@/components/NextWatchRatingModal'
import LetterboxdImport     from '@/components/LetterboxdImport'
import ManualRating         from '@/components/ManualRating'
import type { Movie, Filters, FilterOptions } from '@/app/page'

// ── Types ─────────────────────────────────────────────────────────────────────

type Prediction = {
  predictedRating: number   // 0.5–5.0
  probAbove3:      number   // 0–100 integer
}

type NextWatchResult = {
  movie:      Movie
  prediction: Prediction
}

// LocalStorage key for persisting a "selected" movie across sessions
const LS_KEY = 'nextwatch_selected'

type PersistedWatch = {
  movie:      Movie
  prediction: Prediction
}

// ── Default filters (same as home, minus hideWatched which is always true here) ──

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
  hideWatched:    true,   // always true on this page; not shown in filter panel
  watchlistOnly:  false,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildParams(
  f:       Filters,
  userId:  string | number | null,
  skipIds: number[],
  opts:    FilterOptions | null,
) {
  return new URLSearchParams({
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
    userId:         String(userId || ''),
    skipIds:        skipIds.join(','),
    watchlistOnly:  String(f.watchlistOnly),
  })
}

function formatRuntime(mins: number | null) {
  if (!mins) return null
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LoadingDots() {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex gap-2.5">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-2.5 h-2.5 rounded-full bg-[#C9A84C] animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
      <p className="text-sm text-[#8C8375] tracking-wide">Finding your perfect match…</p>
    </div>
  )
}

function PredictionBadge({ prediction }: { prediction: Prediction }) {
  const stars = Math.round(prediction.predictedRating * 2) / 2  // round to nearest 0.5
  const filled = Math.floor(stars)
  const half   = stars % 1 !== 0

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-xs">
      <div className="flex items-center gap-1.5 text-xs text-[#8C8375] tracking-widest uppercase">
        <Sparkles size={12} className="text-[#C9A84C]" />
        <span>Predicted for you</span>
      </div>

      <div className="flex items-stretch gap-px rounded-lg overflow-hidden border border-[rgba(201,168,76,0.2)] w-full">
        {/* Predicted rating */}
        <div className="flex-1 bg-[#1A1714] px-4 py-3 flex flex-col items-center gap-1">
          <span className="text-xs text-[#8C8375] uppercase tracking-wider">Predicted Rating</span>
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => {
              const fill = i < filled ? '#C9A84C' : (i === filled && half) ? 'url(#pred-half)' : '#2A2420'
              return (
                <svg key={i} width="14" height="14" viewBox="0 0 24 24">
                  <defs>
                    <linearGradient id="pred-half">
                      <stop offset="50%" stopColor="#C9A84C" />
                      <stop offset="50%" stopColor="#2A2420" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                    fill={fill} stroke="#C9A84C" strokeWidth="1" strokeLinejoin="round"
                  />
                </svg>
              )
            })}
            <span className="text-sm font-semibold text-[#E8C97A] ml-1">
              {prediction.predictedRating.toFixed(1)}
            </span>
          </div>
        </div>

        <div className="w-px bg-[rgba(201,168,76,0.1)]" />

        {/* Probability */}
        <div className="flex-1 bg-[#1A1714] px-4 py-3 flex flex-col items-center gap-1">
          <span className="text-xs text-[#8C8375] uppercase tracking-wider">Love Probability</span>
          <div className="flex items-baseline gap-0.5">
            <span className="text-2xl font-bold text-[#E8C97A]" style={{ fontFamily: 'Playfair Display, serif' }}>
              {prediction.probAbove3}
            </span>
            <span className="text-sm text-[#C9A84C]">%</span>
          </div>
          <span className="text-[10px] text-[#8C8375]">chance you rate it 3+ ★</span>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NextWatchPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const userId = (session?.user as any)?.userId ?? null

  // Filter state
  const [filters,       setFilters]       = useState<Filters>(DEFAULT_FILTERS)
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null)

  // Page phase
  const [phase,   setPhase]   = useState<'idle' | 'loading' | 'result'>('idle')
  const [result,  setResult]  = useState<NextWatchResult | null>(null)

  // Session-level skip list (cleared on page refresh — KNN will own this permanently later)
  const [skipIds, setSkipIds] = useState<number[]>([])

  // Modal state
  const [detailMovie,      setDetailMovie]      = useState<Movie | null>(null)
  const [showRatingModal,  setShowRatingModal]  = useState<'seen' | 'watched' | null>(null)
  const [showManualRating, setShowManualRating] = useState(false)

  // "Did you finish?" — surfaces when user returns after selecting a movie
  const [pendingWatch,     setPendingWatch]     = useState<PersistedWatch | null>(null)
  const [showDidYouFinish, setShowDidYouFinish] = useState(false)

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (status === 'unauthenticated') {
      const isGuest = document.cookie.includes('guest=true')
      if (!isGuest) router.push('/login')
    }
  }, [status, router])

  // ── Load filter options ─────────────────────────────────────────────────────
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

  // ── Check localStorage for a previously-selected movie ──────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) {
        const saved: PersistedWatch = JSON.parse(raw)
        if (saved?.movie) {
          setPendingWatch(saved)
          setShowDidYouFinish(true)
        }
      }
    } catch { /* corrupt data — ignore */ }
  }, [])

  // ── Core fetch ──────────────────────────────────────────────────────────────
  const findNextWatch = useCallback(async (extraSkip: number[] = []) => {
    setPhase('loading')
    setResult(null)
    try {
      const allSkip = [...skipIds, ...extraSkip]
      const params  = buildParams(filters, userId, allSkip, filterOptions)
      const res     = await fetch(`/api/next-watch?${params}`)
      const data    = await res.json()

      if (data.movie) {
        setResult({ movie: data.movie, prediction: data.prediction })
        setPhase('result')
      } else {
        // No matching movie found — drop back to idle with a soft message
        setPhase('idle')
      }
    } catch {
      setPhase('idle')
    }
  }, [filters, userId, filterOptions, skipIds])

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleAlreadySeen = () => setShowRatingModal('seen')

  const handleSkip = () => {
    if (!result) return
    const newSkips = [...skipIds, result.movie.movie_id]
    setSkipIds(newSkips)
    findNextWatch([result.movie.movie_id])
  }

  const handleSelectMovie = () => {
    if (!result) return
    // Persist so "Did you finish?" surfaces on next visit
    localStorage.setItem(LS_KEY, JSON.stringify(result))
    setShowRatingModal('watched')
  }

  // Called after the user rates the movie (either "seen" or post-watch)
  const handleRated = (_rating: number) => {
    setShowRatingModal(null)
    localStorage.removeItem(LS_KEY)
    setPendingWatch(null)
    // Add to skip list so it can't resurface
    const id = showRatingModal === 'seen' ? result?.movie?.movie_id
                                          : pendingWatch?.movie?.movie_id ?? result?.movie?.movie_id
    if (id) setSkipIds(prev => [...prev, id])
    // Back to idle so they can find their next film
    setResult(null)
    setPhase('idle')
  }

  // "Watched" modal — user clicks "Got it, I'll rate later"
  const handleWatchedConfirm = () => {
    setShowRatingModal(null)
    // Page stays on result view; localStorage already written
  }

  // "Did you finish?" handlers
  const handleFinishedYes = () => {
    setShowDidYouFinish(false)
    // Surface the rating modal for the pending movie
    setShowRatingModal('watched')
  }

  const handleFinishedNotYet = () => {
    setShowDidYouFinish(false)
    // Keep localStorage — we'll ask again next time
  }

  const handleFinishedAbandoned = () => {
    setShowDidYouFinish(false)
    localStorage.removeItem(LS_KEY)
    setPendingWatch(null)
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  const activeMovie  = result?.movie ?? null
  const posterUrl    = activeMovie?.poster_path
    ? `https://image.tmdb.org/t/p/w342${activeMovie.poster_path}`
    : null

  const genres  = activeMovie?.genres?.split('|').map(g => g.trim()).filter(Boolean) ?? []
  const runtime = formatRuntime(activeMovie?.runtime ?? null)
  const year    = activeMovie?.release_date ? new Date(activeMovie.release_date).getFullYear() : null

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

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-[rgba(201,168,76,0.15)] bg-[rgba(13,13,13,0.9)] backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#E8C97A]"
                style={{ fontFamily: 'Playfair Display, serif' }}>
                CineMatch
              </h1>
              <p className="text-xs text-[#8C8375] mt-0.5 tracking-widest uppercase">Movie Discovery</p>
            </div>
            {/* Nav tabs */}
            <nav className="flex items-center gap-1">
              <Link
                href="/"
                className="px-3 py-1.5 rounded-md text-xs font-medium tracking-wider uppercase text-[#8C8375] hover:text-[#E8C97A] hover:bg-[rgba(201,168,76,0.08)] transition-colors"
              >
                Browse
              </Link>
              <span
                className="px-3 py-1.5 rounded-md text-xs font-medium tracking-wider uppercase text-[#E8C97A] bg-[rgba(201,168,76,0.12)] border border-[rgba(201,168,76,0.2)] cursor-default"
              >
                My Next Watch
              </span>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            {session ? (
              <div className="flex items-center gap-2 border-l border-[rgba(201,168,76,0.15)] pl-4">
                <LetterboxdImport onImportComplete={() => {}} />
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

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="max-w-[1600px] mx-auto px-6 py-8 flex gap-8">

        {/* Left: filter panel */}
        <aside className="w-64 flex-shrink-0">
          <FilterPanel
            filters={filters}
            options={filterOptions}
            onChange={f => {
              setFilters(f)
              // Reset result when filters change so stale pick is cleared
              if (phase === 'result') { setResult(null); setPhase('idle') }
            }}
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
            showHideWatched={false}   // Always hidden — this page never shows seen films
          />
        </aside>

        {/* Right: content area */}
        <div className="flex-1 min-w-0 flex items-start justify-center">

          {/* ── IDLE: hero CTA ─────────────────────────────────────────────── */}
          {phase === 'idle' && (
            <div
              className="flex flex-col items-center text-center gap-8 pt-16 max-w-md"
              style={{ animation: 'fadeUp 0.4s ease forwards' }}
            >
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-[rgba(201,168,76,0.1)] border border-[rgba(201,168,76,0.2)] flex items-center justify-center">
                  <Sparkles size={28} className="text-[#C9A84C]" />
                </div>
                <div>
                  <h2
                    className="text-3xl font-bold text-[#F5F0E8] leading-tight"
                    style={{ fontFamily: 'Playfair Display, serif' }}
                  >
                    Your Perfect Film Awaits
                  </h2>
                  <p className="text-sm text-[#8C8375] mt-3 leading-relaxed">
                    Dial in your mood with the filters on the left — genre, runtime, streaming
                    service, whatever feels right tonight. When you're ready, we'll find the one
                    film in our catalogue we think you'll love most.
                  </p>
                </div>
              </div>

              <button
                onClick={() => findNextWatch()}
                className="group flex items-center gap-2.5 px-8 py-3.5 rounded-xl font-medium text-sm text-[#1A1714] bg-[#C9A84C] hover:bg-[#E8C97A] transition-all shadow-lg shadow-[rgba(201,168,76,0.2)] hover:shadow-[rgba(201,168,76,0.35)]"
              >
                <Sparkles size={16} />
                Find My Next Watch
              </button>

              <p className="text-xs text-[#4A4540] leading-relaxed">
                Films you've already seen are automatically excluded.
              </p>
            </div>
          )}

          {/* ── LOADING ─────────────────────────────────────────────────────── */}
          {phase === 'loading' && (
            <div className="flex items-center justify-center pt-32">
              <LoadingDots />
            </div>
          )}

          {/* ── RESULT ──────────────────────────────────────────────────────── */}
          {phase === 'result' && result && (
            <div
              className="flex flex-col items-center gap-6 pt-8 w-full max-w-sm"
              style={{ animation: 'fadeUp 0.4s ease forwards' }}
            >
              {/* Prediction badges */}
              <PredictionBadge prediction={result.prediction} />

              {/* Poster — clickable for detail modal */}
              <button
                onClick={() => setDetailMovie(result.movie)}
                className="group relative rounded-xl overflow-hidden shadow-2xl shadow-[rgba(0,0,0,0.5)] hover:shadow-[rgba(201,168,76,0.2)] transition-all duration-300 hover:scale-[1.02]"
                style={{ width: 240, aspectRatio: '2/3' }}
              >
                {posterUrl ? (
                  <Image
                    src={posterUrl}
                    alt={result.movie.title}
                    fill
                    className="object-cover"
                    sizes="240px"
                  />
                ) : (
                  <div className="w-full h-full bg-[#1A1714] flex items-center justify-center">
                    <span className="text-[#8C8375] text-sm px-4 text-center">{result.movie.title}</span>
                  </div>
                )}
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-[rgba(13,13,13,0.7)] opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                  <span className="text-xs text-[#E8C97A] border border-[rgba(201,168,76,0.5)] rounded-full px-3 py-1">
                    View details
                  </span>
                </div>
              </button>

              {/* Movie info */}
              <div className="text-center">
                <h3
                  className="text-xl font-bold text-[#F5F0E8]"
                  style={{ fontFamily: 'Playfair Display, serif' }}
                >
                  {result.movie.title}
                </h3>
                <p className="text-xs text-[#8C8375] mt-1 flex items-center justify-center gap-2 flex-wrap">
                  {year && <span>{year}</span>}
                  {runtime && <><span className="opacity-40">·</span><span>{runtime}</span></>}
                  {genres[0] && <><span className="opacity-40">·</span><span>{genres[0]}</span></>}
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex items-stretch gap-2 w-full">
                {/* Already seen */}
                <button
                  onClick={handleAlreadySeen}
                  className="flex-1 flex flex-col items-center gap-1.5 py-3 px-2 rounded-lg border border-[rgba(201,168,76,0.15)] text-[#8C8375] hover:text-[#C5BFB4] hover:border-[rgba(201,168,76,0.3)] hover:bg-[rgba(201,168,76,0.05)] transition-all text-center"
                >
                  <Eye size={15} />
                  <span className="text-[11px] leading-tight">Already Seen</span>
                </button>

                {/* Skip */}
                <button
                  onClick={handleSkip}
                  className="flex-1 flex flex-col items-center gap-1.5 py-3 px-2 rounded-lg border border-[rgba(201,168,76,0.15)] text-[#8C8375] hover:text-[#C5BFB4] hover:border-[rgba(201,168,76,0.3)] hover:bg-[rgba(201,168,76,0.05)] transition-all text-center"
                >
                  <SkipForward size={15} />
                  <span className="text-[11px] leading-tight">Skip</span>
                </button>

                {/* Select */}
                <button
                  onClick={handleSelectMovie}
                  className="flex-2 flex-[2] flex flex-col items-center gap-1.5 py-3 px-4 rounded-lg bg-[#C9A84C] hover:bg-[#E8C97A] text-[#1A1714] transition-all font-medium text-center"
                >
                  <CheckCircle2 size={15} />
                  <span className="text-[11px] leading-tight font-semibold">This Is Tonight's Film</span>
                </button>
              </div>

              {/* Restart link */}
              <button
                onClick={() => { setResult(null); setPhase('idle') }}
                className="text-xs text-[#4A4540] hover:text-[#8C8375] transition-colors"
              >
                ← Change my preferences
              </button>
            </div>
          )}

        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      {/* Movie detail modal */}
      {detailMovie && (
        <MovieModal movie={detailMovie} onClose={() => setDetailMovie(null)} />
      )}

      {/* Rate a movie they've already seen */}
      {showRatingModal === 'seen' && result?.movie && (
        <NextWatchRatingModal
          movie={result.movie}
          title="You've Seen This One"
          subtitle="How did you find it? Your rating helps us improve future picks."
          onClose={() => setShowRatingModal(null)}
          onRated={handleRated}
          allowSkip
          onSkip={() => {
            setShowRatingModal(null)
            // Still add to skip list so it doesn't resurface
            if (result?.movie) setSkipIds(prev => [...prev, result.movie.movie_id])
            setResult(null); setPhase('idle')
          }}
        />
      )}

      {/* "Select Movie" confirmation — after user picks tonight's film */}
      {showRatingModal === 'watched' && (result?.movie || pendingWatch?.movie) && (() => {
        const movie = pendingWatch?.movie ?? result!.movie
        const isPendingRating = !!pendingWatch  // coming back after watching

        if (isPendingRating) {
          return (
            <NextWatchRatingModal
              movie={movie}
              title={`How Was ${movie.title}?`}
              subtitle="Rate it below — your feedback trains the model for next time."
              onClose={() => { setShowRatingModal(null); setPendingWatch(null) }}
              onRated={handleRated}
              allowSkip
              onSkip={() => {
                setShowRatingModal(null)
                setPendingWatch(null)
                localStorage.removeItem(LS_KEY)
              }}
            />
          )
        }

        // First visit: confirmation that film is selected
        return (
          <div
            className="fixed inset-0 flex items-center justify-center px-4"
            style={{ zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.85)' }}
          >
            <div
              className="bg-[#1A1714] border border-[rgba(201,168,76,0.2)] rounded-xl w-full max-w-sm shadow-2xl overflow-hidden"
              style={{ animation: 'fadeUp 0.25s ease forwards' }}
            >
              <div className="p-6 flex flex-col items-center gap-5 text-center">
                <div className="w-12 h-12 rounded-full bg-[rgba(201,168,76,0.1)] border border-[rgba(201,168,76,0.3)] flex items-center justify-center">
                  <CheckCircle2 size={22} className="text-[#C9A84C]" />
                </div>
                <div>
                  <h3
                    className="text-lg font-bold text-[#F5F0E8]"
                    style={{ fontFamily: 'Playfair Display, serif' }}
                  >
                    Enjoy the Film!
                  </h3>
                  <p className="text-sm text-[#8C8375] mt-2 leading-relaxed">
                    <span className="text-[#C5BFB4]">{movie.title}</span> is locked in for tonight.
                    Come back when you're done and we'll ask how it went.
                  </p>
                </div>
                <button
                  onClick={handleWatchedConfirm}
                  className="w-full py-2.5 rounded-lg text-sm font-medium bg-[#C9A84C] hover:bg-[#E8C97A] text-[#1A1714] transition-colors"
                >
                  Let's Go! →
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* "Did you finish?" — shown on return visit */}
      {showDidYouFinish && pendingWatch && (
        <div
          className="fixed inset-0 flex items-center justify-center px-4"
          style={{ zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.85)' }}
        >
          <div
            className="bg-[#1A1714] border border-[rgba(201,168,76,0.2)] rounded-xl w-full max-w-sm shadow-2xl overflow-hidden"
            style={{ animation: 'fadeUp 0.25s ease forwards' }}
          >
            <div className="p-6 flex flex-col items-center gap-5 text-center">
              <div className="w-12 h-12 rounded-full bg-[rgba(201,168,76,0.1)] border border-[rgba(201,168,76,0.3)] flex items-center justify-center">
                <Star size={22} className="text-[#C9A84C]" />
              </div>

              <div>
                <h3
                  className="text-lg font-bold text-[#F5F0E8]"
                  style={{ fontFamily: 'Playfair Display, serif' }}
                >
                  Did you finish{' '}
                  <span className="text-[#E8C97A]">{pendingWatch.movie.title}</span>?
                </h3>
                <p className="text-sm text-[#8C8375] mt-2">
                  If so, we'd love to know what you thought.
                </p>
              </div>

              <div className="flex flex-col gap-2 w-full">
                <button
                  onClick={handleFinishedYes}
                  className="w-full py-2.5 rounded-lg text-sm font-medium bg-[#C9A84C] hover:bg-[#E8C97A] text-[#1A1714] transition-colors"
                >
                  Yes — let me rate it!
                </button>
                <button
                  onClick={handleFinishedNotYet}
                  className="w-full py-2 rounded-lg text-sm text-[#8C8375] hover:text-[#C5BFB4] border border-[rgba(201,168,76,0.1)] hover:border-[rgba(201,168,76,0.2)] transition-colors"
                >
                  Not yet — still watching
                </button>
                <button
                  onClick={handleFinishedAbandoned}
                  className="text-xs text-[#4A4540] hover:text-[#8C8375] transition-colors mt-1"
                >
                  I'm not going to watch it anymore
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual rating modal (accessed via header button) */}
      {showManualRating && (
        <ManualRating
          onClose={() => setShowManualRating(false)}
          onRated={() => {}}
        />
      )}

    </main>
  )
}