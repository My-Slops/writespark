import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.warn('DATABASE_URL is not set. Server functions requiring DB will fail until configured.')
}

const client = postgres(connectionString ?? 'postgres://localhost:5432/writespark', {
  prepare: false,
})

export const db = drizzle(client, { schema })
