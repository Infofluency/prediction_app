import sql from 'mssql'

const config: sql.config = {
  server: process.env.SQL_SERVER!,
  database: process.env.SQL_DATABASE!,
  user: process.env.SQL_USERNAME!,
  password: process.env.SQL_PASSWORD!,
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
}

let pool: sql.ConnectionPool | null = null

export async function getDb(): Promise<sql.ConnectionPool> {
  if (!pool) {
    pool = await sql.connect(config)
  }
  return pool
}
