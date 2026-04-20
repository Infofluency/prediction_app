import NextAuth, { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { getDb } from '@/lib/db'

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email:    { label: 'Email',    type: 'email' },
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.password) return null

        const db = await getDb()
        let result

        if (credentials.username) {
          result = await db.request().query(
            `SELECT user_id, email, name, password_hash, letterboxd_username
             FROM lb_knn.app_users
             WHERE letterboxd_username = '${credentials.username.replace(/'/g, "''")}'`
          )
        } else if (credentials.email) {
          result = await db.request().query(
            `SELECT user_id, email, name, password_hash, letterboxd_username
             FROM lb_knn.app_users
             WHERE email = '${credentials.email.replace(/'/g, "''")}'
               AND provider = 'credentials'`
          )
        } else {
          return null
        }

        const user = result.recordset[0]
        if (!user || !user.password_hash) return null

        const valid = await bcrypt.compare(credentials.password, user.password_hash)
        if (!valid) return null

        return {
          id:    String(user.user_id),
          email: user.email || user.letterboxd_username,
          name:  user.name,
        }
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        const db = await getDb()
        const existing = await db.request().query(
          `SELECT user_id FROM lb_knn.app_users
           WHERE email = '${user.email!.replace(/'/g, "''")}'`
        )

        if (existing.recordset.length === 0) {
          // New Google user — create account and flag as new
          await db.request().query(
            `INSERT INTO lb_knn.app_users (email, name, provider, provider_id)
             VALUES (
               '${user.email!.replace(/'/g, "''")}',
               '${(user.name || '').replace(/'/g, "''")}',
               'google',
               '${(user.id || '').replace(/'/g, "''")}'
             )`
          )
          // Tag the user object so we can redirect to onboarding
          ;(user as any).isNewUser = true
        }
      }
      return true
    },

    async jwt({ token, user, trigger }) {
      // On initial sign-in, check if new user
      if (user) {
        ;(token as any).isNewUser = !!(user as any).isNewUser
      }

      if (!token.userId && token.email) {
        const db = await getDb()
        const result = await db.request().query(
          `SELECT user_id, name FROM lb_knn.app_users
           WHERE email = '${token.email.replace(/'/g, "''")}'
              OR letterboxd_username = '${token.email.replace(/'/g, "''")}'`
        )
        if (result.recordset[0]) {
          token.userId = result.recordset[0].user_id
          if (!token.name && result.recordset[0].name) {
            token.name = result.recordset[0].name
          }
        }
      }
      return token
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).userId = token.userId
        ;(session.user as any).isNewUser = !!(token as any).isNewUser
      }
      return session
    },

    async redirect({ url, baseUrl }) {
      // If the callback URL already has onboard param, keep it
      if (url.includes('onboard=true')) return url
      // Default behavior
      if (url.startsWith('/')) return `${baseUrl}${url}`
      if (url.startsWith(baseUrl)) return url
      return baseUrl
    },
  },

  pages: {
    signIn: '/login',
  },

  session: {
    strategy: 'jwt',
  },
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }