import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const genres         = searchParams.get('genre')?.split(',').map(s => s.trim()).filter(Boolean) ?? []
  const languages      = searchParams.get('language')?.split(',').map(s => s.trim()).filter(Boolean) ?? []
  const countries      = searchParams.get('country')?.split(',').map(s => s.trim()).filter(Boolean) ?? []
  const providers      = searchParams.get('provider')?.split(',').map(s => s.trim()).filter(Boolean) ?? []
  const includeRentBuy = searchParams.get('includeRentBuy') === 'true'
  const runtimeMin     = parseInt(searchParams.get('runtimeMin') || '0')
  const runtimeMax     = parseInt(searchParams.get('runtimeMax') || '999')
  const yearMin        = parseInt(searchParams.get('yearMin')    || '1900')
  const yearMax        = parseInt(searchParams.get('yearMax')    || '2100')
  const popularityPct  = parseInt(searchParams.get('popularityMin') || '0')
  const userId         = parseInt(searchParams.get('userId') || '0') || null
  const watchlistOnly  = searchParams.get('watchlistOnly') === 'true'

  // IDs to exclude in this session (skipped / already-seen in-flight)
  const skipIds = searchParams.get('skipIds')?.split(',').map(Number).filter(Boolean) ?? []

  try {
    const db = await getDb()

    // ── Popularity threshold ──────────────────────────────────────────────────
    let popularityWhere = ''
    if (popularityPct > 0) {
      const pctResult = await db.request().query(`
        SELECT PERCENTILE_CONT(${popularityPct / 100.0})
          WITHIN GROUP (ORDER BY vote_count ASC)
          OVER () AS threshold
        FROM lb_knn.raw_tmdb_movie_list
        WHERE vote_count IS NOT NULL
        ORDER BY (SELECT NULL)
        OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY
      `)
      const threshold = pctResult.recordset[0]?.threshold ?? 0
      popularityWhere = `AND ml.vote_count >= ${Math.round(threshold)}`
    }

    // ── Provider filter ───────────────────────────────────────────────────────
    let providerJoin  = ''
    let providerWhere = ''
    if (providers.length > 0) {
      const list       = providers.map(p => `'${p.replace(/'/g, "''")}'`).join(', ')
      const typeFilter = includeRentBuy
        ? `wpg.provider_name_grouped IN (${list})`
        : `wpg.provider_name_grouped IN (${list}) AND wpg.provider_type = 'flatrate'`
      providerJoin  = `INNER JOIN lb_knn.vw_watch_provider_groups wpg ON ml.movie_id = wpg.movie_id`
      providerWhere = `AND (${typeFilter}) AND wpg.provider_name_grouped IS NOT NULL`
    }

    // ── Watchlist filter ──────────────────────────────────────────────────────
    // Uses an INNER JOIN so only movies present in the user's watchlist survive.
    let watchlistJoin = ''
    if (watchlistOnly && userId) {
      watchlistJoin = `INNER JOIN lb_knn.app_user_watchlist uwl
        ON ml.movie_id = uwl.movie_id AND uwl.user_id = ${userId}`
    }

    const genreWhere = genres.length > 0
      ? `AND (${genres.map(g => `ml.genres LIKE '%${g.replace(/'/g, "''")}%'`).join(' OR ')})`
      : ''
    const langWhere = languages.length > 0
      ? `AND ml.original_language IN (${languages.map(l => `'${l.replace(/'/g, "''")}'`).join(', ')})`
      : ''
    const countryWhere = countries.length > 0
      ? `AND (${countries.map(c => `ml.production_countries LIKE '%${c.replace(/'/g, "''")}%'`).join(' OR ')})`
      : ''

    // Always exclude movies the user has already rated (= seen)
    const seenWhere = userId
      ? `AND ml.movie_id NOT IN (
           SELECT movie_id FROM lb_knn.app_user_ratings
           WHERE user_id = ${userId} AND movie_id IS NOT NULL
         )`
      : ''

    // Exclude movies skipped or marked-seen this session
    const skipWhere = skipIds.length > 0
      ? `AND ml.movie_id NOT IN (${skipIds.join(',')})`
      : ''

    // ═══════════════════════════════════════════════════════════════════════════
    // KNN MODEL INTEGRATION POINT
    // ───────────────────────────────────────────────────────────────────────────
    // When the KNN model is ready, replace the random ORDER BY NEWID() below with:
    //
    //  1. Pull the current user's rating vector:
    //       SELECT movie_id, rating FROM lb_knn.app_user_ratings WHERE user_id = {userId}
    //
    //  2. Call your KNN inference service / Python model with:
    //       - userId
    //       - The full candidate set (all movie_ids that pass the WHERE clauses below)
    //       - K = however many neighbors you're using
    //     It returns: [{ movieId, predictedRating, probAbove3 }, ...]
    //     ranked highest → lowest by predicted enjoyment
    //
    //  3. Take the top-ranked movieId that is not in skipIds / seenWhere,
    //     use its predictedRating and probAbove3 from the model output.
    //
    //  Suggested call shape:
    //    const knnResult = await runKnnModel(userId, candidateMovieIds, k)
    //    const { movieId, predictedRating, probAbove3 } = knnResult[0]
    //
    //  Then replace ORDER BY NEWID() with ORDER BY your ranked list,
    //  and replace the Math.random() placeholders below with the real values.
    // ═══════════════════════════════════════════════════════════════════════════

    // DISTINCT lives in the inner subquery; ORDER BY NEWID() is in the outer TOP 1.
    // SQL Server does not allow ORDER BY on expressions absent from the SELECT list
    // when DISTINCT is present, so the two must be separated into different scopes.
    const query = `
      SELECT TOP 1 *
      FROM (
        SELECT DISTINCT
          ml.movie_id,
          ml.title,
          ml.popularity,
          ml.release_date,
          ml.vote_average,
          ml.vote_count,
          ml.original_language,
          ml.overview,
          ml.runtime,
          ml.genres,
          ml.production_countries,
          ml.budget,
          ml.revenue,
          ml.imdb_id,
          p.file_path AS poster_path
        FROM lb_knn.raw_tmdb_movie_list ml
        ${providerJoin}
        ${watchlistJoin}
        OUTER APPLY (
          SELECT TOP 1 file_path
          FROM lb_knn.raw_tmdb_posters
          WHERE movie_id = ml.movie_id
          ORDER BY vote_count DESC
        ) p
        WHERE 1=1
          ${genreWhere}
          ${langWhere}
          ${countryWhere}
          ${providerWhere}
          ${popularityWhere}
          ${seenWhere}
          ${skipWhere}
          AND (ml.runtime IS NULL OR (ml.runtime >= ${runtimeMin} AND ml.runtime <= ${runtimeMax}))
          AND (ml.release_date IS NULL OR (
            YEAR(ml.release_date) >= ${yearMin} AND YEAR(ml.release_date) <= ${yearMax}
          ))
      ) AS candidates
      ORDER BY NEWID()
    `

    const result = await db.request().query(query)
    const movie  = result.recordset[0] ?? null

    if (!movie) {
      return NextResponse.json({ movie: null, prediction: null })
    }

    // ── PLACEHOLDER PREDICTIONS ───────────────────────────────────────────────
    // TODO: Replace both values with real KNN model output (see above).
    //   predictedRating → model's predicted star rating on the 0.5–5.0 scale
    //   probAbove3      → P(rating > 3 stars) as an integer 0–100
    const predictedRating = parseFloat((Math.random() * 1.5 + 3.2).toFixed(1)) // 3.2–4.7
    const probAbove3      = Math.floor(Math.random() * 35 + 60)                 // 60–94 %
    // ─────────────────────────────────────────────────────────────────────────

    return NextResponse.json({ movie, prediction: { predictedRating, probAbove3 } })

  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
}