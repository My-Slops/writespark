import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import { env } from './env'
import { CONFIG } from './config'

const client = postgres(env.DATABASE_URL, {
  prepare: false,
  max: CONFIG.DB_CONNECTION_POOL.MAX_CONNECTIONS,
  idle_timeout: CONFIG.DB_CONNECTION_POOL.IDLE_TIMEOUT_SECONDS,
  max_lifetime: CONFIG.DB_CONNECTION_POOL.MAX_LIFETIME_SECONDS,
  connect_timeout: CONFIG.DB_CONNECTION_POOL.CONNECT_TIMEOUT_SECONDS,
})

export const db = drizzle(client, { schema })
