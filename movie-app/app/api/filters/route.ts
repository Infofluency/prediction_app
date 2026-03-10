import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const db = await getDb()

    const [providers, genresRaw, languages, countriesRaw, yearsRaw] = await Promise.all([
      db.request().query(`
        SELECT DISTINCT provider_name
        FROM lb_knn.raw_tmdb_watch_providers
        ORDER BY provider_name
      `),
      db.request().query(`
        SELECT DISTINCT genres FROM lb_knn.raw_tmdb_details WHERE genres IS NOT NULL
      `),
      db.request().query(`
        SELECT DISTINCT original_language
        FROM lb_knn.raw_tmdb_movie_list
        WHERE original_language IS NOT NULL
        ORDER BY original_language
      `),
      db.request().query(`
        SELECT DISTINCT production_countries
        FROM lb_knn.raw_tmdb_details
        WHERE production_countries IS NOT NULL
      `),
      db.request().query(`
        SELECT MIN(YEAR(release_date)) AS min_year, MAX(YEAR(release_date)) AS max_year
        FROM lb_knn.raw_tmdb_movie_list
        WHERE release_date IS NOT NULL
      `),
    ])

    // Parse pipe-delimited genres into unique set
    const genreSet = new Set<string>()
    for (const row of genresRaw.recordset) {
      if (row.genres) {
        row.genres.split('|').forEach((g: string) => genreSet.add(g.trim()))
      }
    }

    // Parse pipe-delimited countries into unique set
    const countrySet = new Set<string>()
    for (const row of countriesRaw.recordset) {
      if (row.production_countries) {
        row.production_countries.split('|').forEach((c: string) => countrySet.add(c.trim()))
      }
    }

    return NextResponse.json({
      providers:  providers.recordset.map((r: { provider_name: string }) => r.provider_name),
      genres:     Array.from(genreSet).sort(),
      languages:  languages.recordset.map((r: { original_language: string }) => r.original_language),
      countries:  Array.from(countrySet).sort(),
      yearRange:  yearsRaw.recordset[0],
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
}
