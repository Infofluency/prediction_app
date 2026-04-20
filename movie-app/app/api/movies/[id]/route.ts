import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const movieId = parseInt(params.id)
  if (isNaN(movieId)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
  }

  try {
    const db = await getDb()

    // Cast sorted by cast_order
    const castResult = await db.request().query(`
      SELECT name, cast_order
      FROM lb_knn.raw_tmdb_credits_cast
      WHERE movie_id = ${movieId}
      ORDER BY cast_order ASC
    `)

    // Crew
    const crewResult = await db.request().query(`
      SELECT cr.job, cc.name
      FROM lb_knn.raw_tmdb_credits_crew cr
      LEFT JOIN lb_knn.raw_tmdb_credits_cast cc
        ON cr.movie_id = cc.movie_id AND cr.person_id = cc.person_id
      WHERE cr.movie_id = ${movieId}
        AND cr.job IN ('Director', 'Screenplay', 'Producer', 'Original Music Composer')
      ORDER BY
        CASE cr.job
          WHEN 'Director'                THEN 1
          WHEN 'Screenplay'              THEN 2
          WHEN 'Producer'                THEN 3
          WHEN 'Original Music Composer' THEN 4
          ELSE 5
        END
    `)

    // Watch providers — use raw table so nothing is null
    const providersResult = await db.request().query(`
      SELECT COALESCE(provider_name_grouped, provider_name) AS provider_name, provider_type
      FROM lb_knn.vw_watch_provider_groups
      WHERE movie_id = ${movieId}
      GROUP BY COALESCE(provider_name_grouped, provider_name), provider_type
      ORDER BY
        CASE provider_type WHEN 'flatrate' THEN 0 WHEN 'rent' THEN 1 WHEN 'buy' THEN 2 ELSE 3 END,
        COALESCE(provider_name_grouped, provider_name)
    `)

    // Group by provider name, collect all types
    type ProviderRow = { provider_name: string; provider_type: string }
    const providerMap = new Map<string, Set<string>>()
    for (const row of providersResult.recordset as ProviderRow[]) {
      if (!row.provider_name) continue
      if (!providerMap.has(row.provider_name)) {
        providerMap.set(row.provider_name, new Set())
      }
      providerMap.get(row.provider_name)!.add(row.provider_type)
    }

    // Build display list:
    // - Flatrate providers first, no label
    // - Rent/buy providers after, with (rent), (buy), or (rent/buy) label
    const flatrate: string[] = []
    const rentBuy: string[] = []

    for (const [name, types] of Array.from(providerMap.entries())) {
      if (types.has('flatrate')) {
        flatrate.push(name)
      } else {
        const labels: string[] = []
        if (types.has('rent')) labels.push('rent')
        if (types.has('buy')) labels.push('buy')
        if (labels.length > 0) {
          rentBuy.push(`${name} (${labels.join('/')})`)
        } else {
          rentBuy.push(name)
        }
      }
    }

    const availableOn = [...flatrate, ...rentBuy]

    return NextResponse.json({
      cast:        castResult.recordset,
      crew:        crewResult.recordset,
      availableOn: availableOn,
      flatrateCount: flatrate.length,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
}