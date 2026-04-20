import { execSync } from 'child_process'
import path from 'path'

export type ScrapeResult = {
  watchlist: { filmId: string; name: string; slug: string; year: string }[]
  ratings:   { filmId: string; name: string; slug: string; year: string; rating: number; tmdbId: number | null }[]
}

export async function scrapeLetterboxd(username: string): Promise<ScrapeResult> {
  const scriptPath = path.join(process.cwd(), 'lib', 'letterboxd_scrape.py')

  console.log(`[Letterboxd] Running Python scraper for ${username}...`)

  const output = execSync(`python "${scriptPath}" "${username}"`, {
    encoding: 'utf-8',
    timeout: 300000, // 5 minutes max
    maxBuffer: 50 * 1024 * 1024, // 50MB
  })

  const data = JSON.parse(output)

  if (data.error) {
    throw new Error(data.error)
  }

  // Add tmdbId: null to ratings (Python script doesn't have TMDB IDs)
  const ratings = (data.ratings || []).map((r: any) => ({
    ...r,
    tmdbId: null,
  }))

  console.log(`[Letterboxd] Python returned ${ratings.length} ratings, ${data.watchlist?.length || 0} watchlist`)

  return {
    watchlist: data.watchlist || [],
    ratings,
  }
}