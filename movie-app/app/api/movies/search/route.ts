import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')?.trim()
  if (!query || query.length < 2) {
    return NextResponse.json([])
  }

  try {
    const db = await getDb()
    const escaped = query.replace(/'/g, "''")

    const result = await db.request().query(`
      SELECT TOP 10
        ml.movie_id,
        ml.title,
        YEAR(ml.release_date) AS year,
        ml.vote_count,
        p.file_path AS poster_path
      FROM lb_knn.raw_tmdb_movie_list ml
      OUTER APPLY (
        SELECT TOP 1 file_path
        FROM lb_knn.raw_tmdb_posters
        WHERE movie_id = ml.movie_id
        ORDER BY vote_count DESC
      ) p
      WHERE ml.title LIKE '%${escaped}%'
      ORDER BY ml.vote_count DESC
    `)

    return NextResponse.json(result.recordset)
  } catch (err) {
    console.error(err)
    return NextResponse.json([])
  }
}