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

  const { username } = await req.json()
  if (!username?.trim()) {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 })
  }

  try {
    const db = await getDb()
    await db.request().query(
      `UPDATE lb_knn.app_users
       SET letterboxd_username = '${username.trim().replace(/'/g, "''")}'
       WHERE user_id = ${userId}`
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to save username' }, { status: 500 })
  }
}