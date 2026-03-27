import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const genres    = searchParams.get('genre')    ? searchParams.get('genre')!.split(',').map(s => s.trim()).filter(Boolean)    : []
  const languages = searchParams.get('language') ? searchParams.get('language')!.split(',').map(s => s.trim()).filter(Boolean) : []
  const countries = searchParams.get('country')  ? searchParams.get('country')!.split(',').map(s => s.trim()).filter(Boolean)  : []
  const providers = searchParams.get('provider') ? searchParams.get('provider')!.split(',').map(s => s.trim()).filter(Boolean) : []

  const includeRentBuy = searchParams.get('includeRentBuy') === 'true'
  const runtimeMin     = parseInt(searchParams.get('runtimeMin') || '0')
  const runtimeMax     = parseInt(searchParams.get('runtimeMax') || '999')
  const yearMin        = parseInt(searchParams.get('yearMin')    || '1900')
  const yearMax        = parseInt(searchParams.get('yearMax')    || '2100')
  const page           = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const pageSize       = 100
  const offset         = (page - 1) * pageSize
  const popularityPct  = parseInt(searchParams.get('popularityMin') || '0')

  const sortMap: Record<string, string> = {
    vote_count:        'ml.vote_count DESC',
    vote_average:      'ml.vote_average DESC',
    release_date_desc: 'ml.release_date DESC',
    release_date_asc:  'ml.release_date ASC',
    title_asc:         'ml.title ASC',
    title_desc:        'ml.title DESC',
    runtime_asc:       'ml.runtime ASC',
    runtime_desc:      'ml.runtime DESC',
  }
  const orderBy = sortMap[searchParams.get('sortBy') || 'vote_count'] ?? 'ml.vote_count DESC'

  try {
    const db = await getDb()

    // Step 1: if popularity filter active, get the threshold vote_count via percentile
    // Run this as a separate query to avoid conflicts with OFFSET/FETCH
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

    let providerJoin  = ''
    let providerWhere = ''
    if (providers.length > 0) {
      const list = providers.map(p => `'${p.replace(/'/g, "''")}'`).join(', ')
      const typeFilter = includeRentBuy
        ? `wp.provider_name IN (${list})`
        : `wp.provider_name IN (${list}) AND wp.provider_type = 'flatrate'`
      providerJoin  = `INNER JOIN lb_knn.raw_tmdb_watch_providers wp ON ml.movie_id = wp.movie_id`
      providerWhere = `AND (${typeFilter})`
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

    const query = `
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
        AND (ml.runtime IS NULL OR (ml.runtime >= ${runtimeMin} AND ml.runtime <= ${runtimeMax}))
        AND (ml.release_date IS NULL OR (YEAR(ml.release_date) >= ${yearMin} AND YEAR(ml.release_date) <= ${yearMax}))
      ORDER BY ${orderBy}
      OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY
    `

    const result = await db.request().query(query)
    return NextResponse.json(result.recordset)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
}