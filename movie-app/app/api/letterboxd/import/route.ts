import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getDb } from '@/lib/db'
import { scrapeLetterboxd } from '@/lib/letterboxd-scraper'

export const maxDuration = 120

function esc(s: string): string {
  return s.replace(/'/g, "''")
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.userId
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const db = await getDb()

    const userResult = await db.request().query(
      `SELECT letterboxd_username
       FROM lb_knn.app_users
       WHERE user_id = ${userId}`
    )

    const user = userResult.recordset[0]
    if (!user?.letterboxd_username) {
      return NextResponse.json(
        { error: 'No Letterboxd username linked to your account' },
        { status: 400 }
      )
    }

    console.log(`[Import] Starting Letterboxd import for user ${userId} (${user.letterboxd_username})`)
    const { watchlist, ratings } = await scrapeLetterboxd(user.letterboxd_username)

    // ── Build title+year lookup map ──────────────────────────────────────
    const moviesResult = await db.request().query(
      `SELECT movie_id, title, YEAR(release_date) AS release_year
       FROM lb_knn.raw_tmdb_movie_list
       WHERE title IS NOT NULL AND release_date IS NOT NULL`
    )

    const titleMap = new Map<string, number>()
    for (const row of moviesResult.recordset) {
      titleMap.set(`${row.title.toLowerCase().trim()}|${row.release_year}`, row.movie_id)
    }

    const resolve = (name: string, year: string): number | null => {
      return titleMap.get(`${name.toLowerCase().trim()}|${year}`) || null
    }

    // ── Batch MERGE watchlist (500 at a time) ────────────────────────────
    let watchlistNew = 0

    for (let i = 0; i < watchlist.length; i += 500) {
      const batch = watchlist.slice(i, i + 500)

      const values = batch.map(item => {
        const movieId = resolve(item.name, item.year)
        return `(${userId}, '${esc(item.filmId)}', N'${esc(item.name)}', '${esc(item.year)}', '${esc(item.slug)}', ${movieId || 'NULL'})`
      }).join(',\n')

      const result = await db.request().query(`
        MERGE lb_knn.app_user_watchlist AS target
        USING (VALUES ${values})
          AS source(user_id, letterboxd_film_id, letterboxd_name, letterboxd_year, letterboxd_slug, movie_id)
        ON target.user_id = source.user_id AND target.letterboxd_film_id = source.letterboxd_film_id
        WHEN NOT MATCHED THEN
          INSERT (user_id, letterboxd_film_id, letterboxd_name, letterboxd_year, letterboxd_slug, movie_id)
          VALUES (source.user_id, source.letterboxd_film_id, source.letterboxd_name, source.letterboxd_year, source.letterboxd_slug, source.movie_id)
        OUTPUT $action;
      `)

      watchlistNew += result.recordset.filter((r: any) => r['$action'] === 'INSERT').length
    }

    console.log(`[Import] Watchlist: ${watchlistNew} new of ${watchlist.length}`)

    // ── Batch MERGE ratings (500 at a time) ──────────────────────────────
    let ratingsNew = 0

    for (let i = 0; i < ratings.length; i += 500) {
      const batch = ratings.slice(i, i + 500)

      const values = batch.map(item => {
        const movieId = resolve(item.name, item.year)
        return `(${userId}, '${esc(item.filmId)}', N'${esc(item.name)}', '${esc(item.year)}', '${esc(item.slug)}', ${item.rating}, ${movieId || 'NULL'})`
      }).join(',\n')

      const result = await db.request().query(`
        MERGE lb_knn.app_user_ratings AS target
        USING (VALUES ${values})
          AS source(user_id, letterboxd_film_id, letterboxd_name, letterboxd_year, letterboxd_slug, rating, movie_id)
        ON target.user_id = source.user_id AND target.letterboxd_film_id = source.letterboxd_film_id
        WHEN MATCHED AND target.rating != source.rating THEN
          UPDATE SET rating = source.rating, movie_id = source.movie_id, rated_at = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (user_id, letterboxd_film_id, letterboxd_name, letterboxd_year, letterboxd_slug, rating, movie_id, source)
          VALUES (source.user_id, source.letterboxd_film_id, source.letterboxd_name, source.letterboxd_year, source.letterboxd_slug, source.rating, source.movie_id, 'letterboxd')
        OUTPUT $action;
      `)

      ratingsNew += result.recordset.filter((r: any) => r['$action'] === 'INSERT').length
    }

    console.log(`[Import] Ratings: ${ratingsNew} new of ${ratings.length}`)

    const matched = watchlist.filter(w => resolve(w.name, w.year)).length
    const ratingsMatched = ratings.filter(r => resolve(r.name, r.year)).length

    console.log(`[Import] Done — Watchlist: ${watchlistNew} new, ${matched} matched | Ratings: ${ratingsNew} new, ${ratingsMatched} matched`)

    return NextResponse.json({
      success: true,
      watchlist: { total: watchlist.length, matched, new: watchlistNew },
      ratings:   { total: ratings.length, matched: ratingsMatched, new: ratingsNew },
    })
  } catch (err: any) {
    console.error('[Import] Error:', err)
    return NextResponse.json({ error: err.message || 'Import failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.userId
  if (!userId) {
    return NextResponse.json({ imported: false })
  }

  try {
    const db = await getDb()
    const result = await db.request().query(
      `SELECT
        (SELECT COUNT(*) FROM lb_knn.app_user_watchlist WHERE user_id = ${userId}) AS watchlist_count,
        (SELECT COUNT(*) FROM lb_knn.app_user_ratings WHERE user_id = ${userId}) AS ratings_count,
        (SELECT letterboxd_username FROM lb_knn.app_users WHERE user_id = ${userId}) AS letterboxd_username`
    )

    const row = result.recordset[0]
    return NextResponse.json({
      imported: (row.watchlist_count > 0 || row.ratings_count > 0),
      watchlistCount: row.watchlist_count,
      ratingsCount: row.ratings_count,
      hasLetterboxd: !!row.letterboxd_username,
    })
  } catch {
    return NextResponse.json({ imported: false, hasLetterboxd: false })
  }
}