'use client'

import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import Image from 'next/image'
import { X, Users, Clapperboard, Tv } from 'lucide-react'
import type { Movie } from '@/app/page'

const TMDB_IMG_LG = 'https://image.tmdb.org/t/p/w500'

type DetailData = {
  cast: { name: string; cast_order: number }[]
  crew: { name: string | null; job: string }[]
  availableOn: string[]
}

type Props = {
  movie: Movie
  onClose: () => void
}

export default function MovieModal({ movie, onClose }: Props) {
  const [detail, setDetail]   = useState<DetailData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!movie?.movie_id) return
    fetch(`/api/movies/${movie.movie_id}`)
      .then(r => r.json())
      .then((data: DetailData) => {
        setDetail({
          cast:        data.cast        ?? [],
          crew:        data.crew        ?? [],
          availableOn: data.availableOn ?? [],
        })
        setLoading(false)
      })
      .catch(() => {
        setDetail({ cast: [], crew: [], availableOn: [] })
        setLoading(false)
      })
  }, [movie?.movie_id])

  if (!movie) return null

  const year   = movie.release_date ? new Date(movie.release_date).getFullYear() : null
  const genres = movie.genres?.split('|').map(g => g.trim()).filter(Boolean) ?? []

  // Group crew by job
  const crewByJob: Record<string, string[]> = {}
  if (detail?.crew) {
    for (const c of detail.crew) {
      if (!c.name) continue
      if (!crewByJob[c.job]) crewByJob[c.job] = []
      crewByJob[c.job].push(c.name)
    }
  }

  return (
    <Dialog.Root open onOpenChange={open => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content
          className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8"
          style={{ pointerEvents: 'none' }}
        >
          <div
            className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-[#1A1714] border border-[rgba(201,168,76,0.15)] shadow-2xl"
            style={{ pointerEvents: 'auto', animation: 'fadeUp 0.3s ease forwards' }}
          >
            <Dialog.Close asChild>
              <button className="absolute top-4 right-4 z-10 p-2 rounded-full bg-[rgba(13,13,13,0.7)] text-[#8C8375] hover:text-[#F5F0E8] hover:bg-[rgba(201,168,76,0.15)] transition-all">
                <X size={18} />
              </button>
            </Dialog.Close>

            {/* Hero */}
            <div className="relative h-44 md:h-56 overflow-hidden rounded-t-xl">
              {movie.poster_path ? (
                <Image
                  src={`${TMDB_IMG_LG}${movie.poster_path}`}
                  alt={movie.title}
                  fill
                  className="object-cover object-top blur-sm scale-105"
                />
              ) : (
                <div className="w-full h-full bg-[#231F1B]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#1A1714] via-[rgba(26,23,20,0.5)] to-transparent" />

              <div className="absolute bottom-0 left-0 right-0 flex items-end gap-4 p-5">
                {movie.poster_path && (
                  <div className="flex-shrink-0 w-16 rounded-lg overflow-hidden shadow-xl border border-[rgba(201,168,76,0.2)]"
                    style={{ aspectRatio: '2/3' }}>
                    <Image
                      src={`${TMDB_IMG_LG}${movie.poster_path}`}
                      alt={movie.title}
                      width={64} height={96}
                      className="object-cover w-full h-full"
                    />
                  </div>
                )}
                <div className="pb-1">
                  <Dialog.Title
                    className="text-lg md:text-xl font-bold text-[#F5F0E8] leading-tight"
                    style={{ fontFamily: 'Playfair Display, serif' }}
                  >
                    {movie.title}
                  </Dialog.Title>
                  <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1.5 items-center text-xs text-[#8C8375]">
                    {year && <span>{year}</span>}
                    {movie.runtime && <span>· {movie.runtime} min</span>}
                    {movie.vote_average > 0 && (
                      <span className="text-[#E8C97A]">· ★ {movie.vote_average.toFixed(1)}</span>
                    )}
                    {movie.original_language && (
                      <span className="uppercase">· {movie.original_language}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="p-5 space-y-5">

              {/* Overview */}
              {movie.overview && (
                <p className="text-sm text-[#C5BFB4] leading-relaxed">{movie.overview}</p>
              )}

              {/* Genres */}
              {genres.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {genres.map(g => (
                    <span key={g} className="text-xs px-2.5 py-1 rounded-full bg-[rgba(201,168,76,0.1)] text-[#E8C97A] border border-[rgba(201,168,76,0.2)]">
                      {g}
                    </span>
                  ))}
                </div>
              )}

              {/* Loading state */}
              {loading ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => (
                    <div key={i} className="h-4 bg-[#231F1B] rounded animate-pulse" />
                  ))}
                </div>
              ) : detail ? (
                <>
                  {/* Available On */}
                  {detail.availableOn.length > 0 && (
                    <Section icon={<Tv size={13} />} title="Available On">
                      <p className="text-sm text-[#C5BFB4]">{detail.availableOn.join(', ')}</p>
                    </Section>
                  )}

                  {/* Crew */}
                  {Object.keys(crewByJob).length > 0 && (
                    <Section icon={<Clapperboard size={13} />} title="Crew">
                      <div className="space-y-1">
                        {Object.entries(crewByJob).map(([job, names]) => (
                          <div key={job} className="flex gap-3 text-sm">
                            <span className="text-[#8C8375] w-32 flex-shrink-0 text-xs">{job}</span>
                            <span className="text-[#C5BFB4] text-xs">{names.join(', ')}</span>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  {/* Cast */}
                  {detail.cast.length > 0 && (
                    <Section icon={<Users size={13} />} title="Cast">
                      <div className="flex flex-wrap gap-1.5">
                        {detail.cast.map(actor => (
                          <span
                            key={`${actor.name}-${actor.cast_order}`}
                            className="text-xs px-2.5 py-1 rounded-full bg-[#231F1B] text-[#C5BFB4] border border-[rgba(140,131,117,0.15)]"
                          >
                            {actor.name}
                          </span>
                        ))}
                      </div>
                    </Section>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[#C9A84C]">{icon}</span>
        <p className="text-xs uppercase tracking-wider font-medium text-[#C9A84C]">{title}</p>
      </div>
      {children}
    </div>
  )
}