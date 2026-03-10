import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const genre           = searchParams.get('genre') || ''
  const language        = searchParams.get('language') || ''
  const country         = searchParams.get('country') || ''
  const provider        = searchParams.get('provider') || ''
  const includeRentBuy  = searchParams.get('includeRentBuy') === 'true'
  const runtimeMin      = parseInt(searchParams.get('runtimeMin') || '0')
  const runtimeMax      = parseInt(searchParams.get('runtimeMax') || '999')
  const yearMin         = parseInt(searchParams.get('yearMin') || '1900')
  const yearMax         = parseInt(searchParams.get('yearMax') || '2100')

  try {
    const db = await getDb()

    // Build provider filter subquery
    let providerJoin = ''
    let providerWhere = ''
    if (provider) {
      const providerTypeFilter = includeRentBuy
        ? `wp.provider_name = '${provider.replace(/'/g, "''")}'`
        : `wp.provider_name = '${provider.replace(/'/g, "''")}' AND wp.provider_type = 'flatrate'`

      providerJoin  = `INNER JOIN lb_knn.raw_tmdb_watch_providers wp ON ml.id = wp.movie_id`
      providerWhere = `AND (${providerTypeFilter})`
    }

    const query = `
      SELECT DISTINCT
        ml.id,
        ml.title,
        ml.popularity,
        ml.release_date,
        ml.vote_average,
        ml.vote_count,
        ml.original_language,
        ml.overview,
        d.runtime,
        d.genres,
        d.production_countries,
        d.budget,
        d.revenue,
        d.imdb_id,
        p.file_path AS poster_path
      FROM lb_knn.raw_tmdb_movie_list ml
      LEFT JOIN lb_knn.raw_tmdb_details d ON ml.id = d.movie_id
      ${providerJoin}
      OUTER APPLY (
        SELECT TOP 1 file_path
        FROM lb_knn.raw_tmdb_posters
        WHERE movie_id = ml.id
        ORDER BY vote_count DESC
      ) p
      WHERE 1=1
        ${genre    ? `AND d.genres LIKE '%${genre.replace(/'/g, "''")}%'` : ''}
        ${language ? `AND ml.original_language = '${language.replace(/'/g, "''")}'` : ''}
        ${country  ? `AND d.production_countries LIKE '%${country.replace(/'/g, "''")}%'` : ''}
        ${providerWhere}
        AND (d.runtime IS NULL OR (d.runtime >= ${runtimeMin} AND d.runtime <= ${runtimeMax}))
        AND (ml.release_date IS NULL OR (YEAR(ml.release_date) >= ${yearMin} AND YEAR(ml.release_date) <= ${yearMax}))
      ORDER BY ml.popularity DESC
    `

    const result = await db.request().query(query)
    return NextResponse.json(result.recordset)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
}
