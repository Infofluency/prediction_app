import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getDb } from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.userId
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { movieId, rating } = await req.json()

  if (!movieId || !rating || rating < 0.5 || rating > 5) {
    return NextResponse.json({ error: 'Invalid movie or rating' }, { status: 400 })
  }

  try {
    const db = await getDb()

    // Get the movie title/year for the letterboxd columns
    const movieResult = await db.request().query(
      `SELECT title, YEAR(release_date) AS year
       FROM lb_knn.raw_tmdb_movie_list WHERE movie_id = ${movieId}`
    )
    const movie = movieResult.recordset[0]
    const name = movie?.title?.replace(/'/g, "''") || ''
    const year = movie?.year || ''

    await db.request().query(`
      MERGE lb_knn.app_user_ratings AS target
      USING (SELECT ${userId} AS user_id, '${movieId}' AS letterboxd_film_id) AS source
      ON target.user_id = source.user_id AND target.movie_id = ${movieId}
      WHEN MATCHED THEN
        UPDATE SET rating = ${rating}, source = 'manual', rated_at = GETDATE()
      WHEN NOT MATCHED THEN
        INSERT (user_id, letterboxd_film_id, letterboxd_name, letterboxd_year, rating, movie_id, source)
        VALUES (${userId}, 'manual_${movieId}', N'${name}', '${year}', ${rating}, ${movieId}, 'manual');
    `)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to save rating' }, { status: 500 })
  }
}