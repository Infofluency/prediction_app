'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import Image from 'next/image'
import type { Movie } from '@/app/page'

const TMDB_IMG = 'https://image.tmdb.org/t/p/w185'

// ── Half-star rating widget ───────────────────────────────────────────────────

type StarProps = { fill: 'full' | 'half' | 'empty' }

function Star({ fill }: StarProps) {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="nw-half-star">
          <stop offset="50%" stopColor="#C9A84C" />
          <stop offset="50%" stopColor="#2A2420" />
        </linearGradient>
      </defs>
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        fill={
          fill === 'full' ? '#C9A84C'
          : fill === 'half' ? 'url(#nw-half-star)'
          : '#2A2420'
        }
        stroke="#C9A84C"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  )
}

type StarRatingProps = { value: number; onChange: (v: number) => void }

function StarRating({ value, onChange }: StarRatingProps) {
  const [hover, setHover] = useState(0)
  const display = hover || value

  const getFill = (star: number): 'full' | 'half' | 'empty' => {
    if (display >= star)       return 'full'
    if (display >= star - 0.5) return 'half'
    return 'empty'
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map(star => (
          <div key={star} className="relative cursor-pointer">
            {/* Left half → half-star */}
            <div
              className="absolute left-0 top-0 w-1/2 h-full z-10"
              onMouseEnter={() => setHover(star - 0.5)}
              onClick={() => onChange(star - 0.5)}
            />
            {/* Right half → full star */}
            <div
              className="absolute right-0 top-0 w-1/2 h-full z-10"
              onMouseEnter={() => setHover(star)}
              onClick={() => onChange(star)}
            />
            <Star fill={getFill(star)} />
          </div>
        ))}
      </div>

      <span className="text-sm text-[#8C8375] h-5">
        {display > 0
          ? `${display % 1 === 0 ? display.toFixed(1) : display} / 5.0`
          : 'Tap a star to rate'}
      </span>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

export type NextWatchRatingModalProps = {
  movie:       Movie
  /** Headline shown at the top of the modal */
  title?:      string
  /** Subtext shown above the poster */
  subtitle?:   string
  onClose:     () => void
  /** Called with the chosen rating once saved successfully */
  onRated:     (rating: number) => void
  /** Show a "skip for now" link below the CTA */
  allowSkip?:  boolean
  onSkip?:     () => void
}

export default function NextWatchRatingModal({
  movie,
  title    = 'Rate This Film',
  subtitle,
  onClose,
  onRated,
  allowSkip,
  onSkip,
}: NextWatchRatingModalProps) {
  const [rating, setRating] = useState(0)
  const [saving, setSaving] = useState(false)

  const posterUrl = movie.poster_path ? `${TMDB_IMG}${movie.poster_path}` : null
  const year      = movie.release_date ? new Date(movie.release_date).getFullYear() : null

  const handleSave = async () => {
    if (rating === 0 || saving) return
    setSaving(true)
    try {
      await fetch('/api/user/rate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ movieId: movie.movie_id, rating }),
      })
      onRated(rating)
    } catch {
      // silent — caller can retry
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center px-4"
      style={{ zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.85)' }}
    >
      <div
        className="bg-[#1A1714] border border-[rgba(201,168,76,0.2)] rounded-xl w-full max-w-sm shadow-2xl overflow-hidden"
        style={{ animation: 'fadeUp 0.25s ease forwards' }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[rgba(201,168,76,0.1)] flex items-center justify-between">
          <h3
            className="text-base font-semibold text-[#F5F0E8]"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-[#8C8375] hover:text-[#F5F0E8] hover:bg-[rgba(201,168,76,0.1)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col items-center gap-5">
          {subtitle && (
            <p className="text-xs text-[#8C8375] text-center leading-relaxed">{subtitle}</p>
          )}

          {/* Poster */}
          <div className="w-24 h-36 rounded-lg overflow-hidden bg-[#231F1B] shadow-lg flex-shrink-0">
            {posterUrl ? (
              <Image
                src={posterUrl}
                alt={movie.title}
                width={96}
                height={144}
                className="object-cover w-full h-full"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center px-2">
                <span className="text-xs text-[#8C8375] text-center">{movie.title}</span>
              </div>
            )}
          </div>

          {/* Title + year */}
          <div className="text-center">
            <p
              className="font-semibold text-[#F5F0E8] leading-snug"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              {movie.title}
            </p>
            {year && <p className="text-xs text-[#8C8375] mt-0.5">{year}</p>}
          </div>

          {/* Stars */}
          <StarRating value={rating} onChange={setRating} />

          {/* CTA */}
          <button
            onClick={handleSave}
            disabled={rating === 0 || saving}
            className="w-full py-2.5 rounded-lg text-sm font-medium transition-all
              bg-[#C9A84C] hover:bg-[#E8C97A] text-[#1A1714]
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save Rating'}
          </button>

          {allowSkip && onSkip && (
            <button
              onClick={onSkip}
              className="text-xs text-[#8C8375] hover:text-[#C5BFB4] transition-colors"
            >
              Skip for now
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}