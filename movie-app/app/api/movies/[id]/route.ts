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

    // Crew — no 'name' column in raw_tmdb_credits_crew, join to cast table for name lookup
    // Instead we just return job + person_id; for display we use what we have
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

    // Watch providers
    const providersResult = await db.request().query(`
      SELECT provider_name, provider_type
      FROM lb_knn.raw_tmdb_watch_providers
      WHERE movie_id = ${movieId}
      ORDER BY
        CASE provider_type WHEN 'flatrate' THEN 0 ELSE 1 END,
        provider_name
    `)

    // Aggregate providers: flatrate = plain name, rent/buy = "Name (rent/buy)"
    type ProviderRow = { provider_name: string; provider_type: string }
    const providerMap = new Map<string, Set<string>>()
    for (const row of providersResult.recordset as ProviderRow[]) {
      if (!providerMap.has(row.provider_name)) {
        providerMap.set(row.provider_name, new Set())
      }
      providerMap.get(row.provider_name)!.add(row.provider_type)
    }

    const availableOn = Array.from(providerMap.entries()).map(([name, types]) => {
      if (types.has('flatrate')) return name
      const labels = Array.from(types).filter(t => t !== 'flatrate')
      return `${name} (${labels.join('/')})`
    })

    return NextResponse.json({
      cast:        castResult.recordset,
      crew:        crewResult.recordset,
      availableOn: availableOn ?? [],
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
}