import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getDb } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.userId
  if (!userId) {
    return NextResponse.json({ watchlist: [], ratings: {} })
  }

  try {
    const db = await getDb()

    const [watchlistResult, ratingsResult] = await Promise.all([
      db.request().query(
        `SELECT movie_id FROM lb_knn.app_user_watchlist
         WHERE user_id = ${userId} AND movie_id IS NOT NULL`
      ),
      db.request().query(
        `SELECT movie_id, rating FROM lb_knn.app_user_ratings
         WHERE user_id = ${userId} AND movie_id IS NOT NULL`
      ),
    ])

    const watchlist = watchlistResult.recordset.map((r: any) => r.movie_id)

    const ratings: Record<number, number> = {}
    for (const r of ratingsResult.recordset) {
      ratings[r.movie_id] = parseFloat(r.rating)
    }

    return NextResponse.json({ watchlist, ratings })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ watchlist: [], ratings: {} })
  }
}