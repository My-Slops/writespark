import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NODE_ENV: z.enum(['development', 'production', 'test']).optional().default('development'),
})

function validateEnv() {
  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    console.error('❌ Environment variable validation failed:')
    console.error(result.error.format())
    throw new Error('Invalid environment variables. Check your .env file.')
  }

  return result.data
}

export const env = validateEnv()
