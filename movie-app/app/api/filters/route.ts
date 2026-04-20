import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const db = await getDb()

    const [providers, genresRaw, languages, countriesRaw, yearsRaw, voteCountRaw] = await Promise.all([
      db.request().query(`
        SELECT DISTINCT provider_name_grouped AS provider_name
        FROM lb_knn.vw_watch_provider_groups
        WHERE provider_name_grouped IS NOT NULL
        ORDER BY provider_name_grouped
      `),
      db.request().query(`
        SELECT DISTINCT genres
        FROM lb_knn.raw_tmdb_movie_list
        WHERE genres IS NOT NULL AND genres != ''
      `),
      db.request().query(`
        SELECT DISTINCT original_language
        FROM lb_knn.raw_tmdb_movie_list
        WHERE original_language IS NOT NULL
        ORDER BY original_language
      `),
      db.request().query(`
        SELECT DISTINCT production_countries
        FROM lb_knn.raw_tmdb_movie_list
        WHERE production_countries IS NOT NULL AND production_countries != ''
      `),
      db.request().query(`
        SELECT
          MIN(YEAR(release_date)) AS min_year,
          MAX(YEAR(release_date)) AS max_year
        FROM lb_knn.raw_tmdb_movie_list
        WHERE release_date IS NOT NULL
      `),
      db.request().query(`
        SELECT
          MIN(vote_count) AS min_vote_count,
          MAX(vote_count) AS max_vote_count
        FROM lb_knn.raw_tmdb_movie_list
        WHERE vote_count IS NOT NULL
      `),
    ])

    const genreSet = new Set<string>()
    for (const row of genresRaw.recordset) {
      if (row.genres) {
        row.genres.split('|').forEach((g: string) => {
          const trimmed = g.trim()
          if (trimmed) genreSet.add(trimmed)
        })
      }
    }

    const countrySet = new Set<string>()
    for (const row of countriesRaw.recordset) {
      if (row.production_countries) {
        row.production_countries.split('|').forEach((c: string) => {
          const trimmed = c.trim()
          if (trimmed) countrySet.add(trimmed)
        })
      }
    }

    return NextResponse.json({
      providers:      providers.recordset.map((r: { provider_name: string }) => r.provider_name),
      genres:         Array.from(genreSet).sort(),
      languages:      languages.recordset.map((r: { original_language: string }) => r.original_language),
      countries:      Array.from(countrySet).sort(),
      yearRange:      yearsRaw.recordset[0],
      popularityRange: {
        min_popularity: voteCountRaw.recordset[0].min_vote_count,
        max_popularity: voteCountRaw.recordset[0].max_vote_count,
      },
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
}