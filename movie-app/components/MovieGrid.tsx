'use client'

import Image from 'next/image'
import type { Movie } from '@/app/page'

const TMDB_IMG = 'https://image.tmdb.org/t/p/w342'

type Props = {
  movies: Movie[]
  loading: boolean
  onSelect: (m: Movie) => void
  userWatchlist: Set<number>
  userRatings: Record<number, number>
}

export default function MovieGrid({ movies, loading, onSelect, userWatchlist, userRatings }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} className="rounded-lg overflow-hidden bg-[#1A1714] animate-pulse"
            style={{ aspectRatio: '2/3' }} />
        ))}
      </div>
    )
  }

  if (movies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <p className="text-3xl text-[#C9A84C] mb-3"
          style={{ fontFamily: 'Playfair Display, serif' }}>
          No films found
        </p>
        <p className="text-[#8C8375] text-sm">Try adjusting your filters</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {movies.map((movie, i) => (
        <MovieCard
          key={movie.movie_id}
          movie={movie}
          index={i}
          onClick={() => onSelect(movie)}
          inWatchlist={userWatchlist.has(movie.movie_id)}
          userRating={userRatings[movie.movie_id] ?? null}
        />
      ))}
    </div>
  )
}

function MovieCard({
  movie,
  index,
  onClick,
  inWatchlist,
  userRating,
}: {
  movie: Movie
  index: number
  onClick: () => void
  inWatchlist: boolean
  userRating: number | null
}) {
  const posterUrl = movie.poster_path ? `${TMDB_IMG}${movie.poster_path}` : null
  const year = movie.release_date ? new Date(movie.release_date).getFullYear() : null

  return (
    <button
      onClick={onClick}
      className="movie-card text-left rounded-lg overflow-hidden bg-[#1A1714] border border-[rgba(201,168,76,0.08)] cursor-pointer group focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
      style={{
        animation: `fadeUp 0.4s ease forwards`,
        animationDelay: `${Math.min(index * 20, 400)}ms`,
        opacity: 0,
      }}
    >
      <div className="relative overflow-hidden" style={{ aspectRatio: '2/3' }}>
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={movie.title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#231F1B]">
            <span className="text-[#8C8375] text-xs text-center px-2">{movie.title}</span>
          </div>
        )}

        {/* Watchlist indicator — top left */}
        {inWatchlist && (
          <div className="absolute top-2 left-2 bg-[rgba(13,13,13,0.85)] backdrop-blur-sm rounded px-1.5 py-0.5 text-xs">
            🕐
          </div>
        )}

        {/* User rating — top right (only if user has rated) */}
        {userRating !== null && userRating > 0 && (
          <div className="absolute top-2 right-2 bg-[rgba(13,13,13,0.85)] backdrop-blur-sm rounded px-1.5 py-0.5 text-xs font-medium text-[#E8C97A]">
            ★ {userRating % 1 === 0 ? userRating.toFixed(0) : userRating.toFixed(1)}
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-[rgba(13,13,13,0.9)] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
          <span className="text-xs text-[#F5F0E8] leading-tight line-clamp-3">
            {movie.overview}
          </span>
        </div>
      </div>

      <div className="p-2.5">
        <p className="text-sm font-semibold text-[#F5F0E8] leading-tight line-clamp-2 group-hover:text-[#E8C97A] transition-colors"
          style={{ fontFamily: 'Playfair Display, serif' }}>
          {movie.title}
        </p>
        <p className="text-xs text-[#8C8375] mt-1">{year}</p>
      </div>
    </button>
  )
}