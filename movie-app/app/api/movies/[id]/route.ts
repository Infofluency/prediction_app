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

    // Cast (sorted by cast_order)
    const castResult = await db.request().query(`
      SELECT name, cast_order
      FROM lb_knn.raw_tmdb_credits_cast
      WHERE movie_id = ${movieId}
      ORDER BY cast_order ASC
    `)

    // Crew (director, producer, screenplay, original music composer)
    const crewResult = await db.request().query(`
      SELECT name, job
      FROM lb_knn.raw_tmdb_credits_crew
      WHERE movie_id = ${movieId}
        AND job IN ('Director', 'Producer', 'Screenplay', 'Original Music Composer')
      ORDER BY
        CASE job
          WHEN 'Director'                  THEN 1
          WHEN 'Screenplay'                THEN 2
          WHEN 'Producer'                  THEN 3
          WHEN 'Original Music Composer'   THEN 4
          ELSE 5
        END
    `)

    // Watch providers — build "Available on" display
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
      availableOn,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
}
