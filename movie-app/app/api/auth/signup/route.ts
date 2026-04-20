import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { getDb } from '@/lib/db'

function encrypt(text: string): string {
  const key = crypto.scryptSync(process.env.NEXTAUTH_SECRET!, 'salt', 32)
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

export async function POST(req: NextRequest) {
  const { email, password, name, letterboxdUsername, authMethod } = await req.json()

  if (!password) {
    return NextResponse.json({ error: 'Password is required' }, { status: 400 })
  }

  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  }

  if (authMethod === 'email' && !email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  if (authMethod === 'letterboxd' && !letterboxdUsername) {
    return NextResponse.json({ error: 'Letterboxd username is required' }, { status: 400 })
  }

  try {
    const db = await getDb()

    if (email) {
      const existing = await db.request().query(
        `SELECT user_id, provider FROM lb_knn.app_users
         WHERE email = '${email.replace(/'/g, "''")}'`
      )
      if (existing.recordset.length > 0) {
        const provider = existing.recordset[0].provider
        if (provider === 'google') {
          return NextResponse.json(
            { error: 'An account with this email is already registered via Google. Use "Continue with Google" to sign in.' },
            { status: 409 }
          )
        }
        return NextResponse.json(
          { error: 'An account with this email already exists. Try signing in instead.' },
          { status: 409 }
        )
      }
    }

    if (letterboxdUsername) {
      const existing = await db.request().query(
        `SELECT user_id FROM lb_knn.app_users
         WHERE letterboxd_username = '${letterboxdUsername.replace(/'/g, "''")}'`
      )
      if (existing.recordset.length > 0) {
        return NextResponse.json(
          { error: 'This Letterboxd username is already registered. Try signing in instead.' },
          { status: 409 }
        )
      }
    }

    const hash = await bcrypt.hash(password, 12)

    const emailVal = email ? `'${email.replace(/'/g, "''")}'` : 'NULL'
    const nameVal  = name  ? `'${name.replace(/'/g, "''")}'`  : 'NULL'
    const lbUser   = letterboxdUsername ? `'${letterboxdUsername.replace(/'/g, "''")}'` : 'NULL'
    const lbPass   = letterboxdUsername ? `'${encrypt(password).replace(/'/g, "''")}'` : 'NULL'

    await db.request().query(
      `INSERT INTO lb_knn.app_users (email, name, password_hash, provider, letterboxd_username, letterboxd_password_enc)
       VALUES (
         ${emailVal},
         ${nameVal},
         '${hash}',
         '${authMethod === 'letterboxd' ? 'letterboxd' : 'credentials'}',
         ${lbUser},
         ${lbPass}
       )`
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}