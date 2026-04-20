import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getDb } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.userId

  try {
    const db = await getDb()

    // Get 20 random movies from top 1000 most popular
    // Exclude movies the user has already rated
    const excludeClause = userId
      ? `AND ml.movie_id NOT IN (
          SELECT movie_id FROM lb_knn.app_user_ratings
          WHERE user_id = ${userId} AND movie_id IS NOT NULL
        )`
      : ''

    const result = await db.request().query(`
      SELECT TOP 20
        ml.movie_id,
        ml.title,
        YEAR(ml.release_date) AS year,
        ml.vote_count,
        p.file_path AS poster_path
      FROM (
        SELECT TOP 1000 *
        FROM lb_knn.raw_tmdb_movie_list
        WHERE vote_count IS NOT NULL AND title IS NOT NULL
        ORDER BY vote_count DESC
      ) ml
      OUTER APPLY (
        SELECT TOP 1 file_path
        FROM lb_knn.raw_tmdb_posters
        WHERE movie_id = ml.movie_id
        ORDER BY vote_count DESC
      ) p
      WHERE 1=1 ${excludeClause}
      ORDER BY NEWID()
    `)

    return NextResponse.json(result.recordset)
  } catch (err) {
    console.error(err)
    return NextResponse.json([])
  }
}