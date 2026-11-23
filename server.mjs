// Production server for the TanStack Start build (`pnpm build` -> dist/).
// Serves dist/client statics and forwards everything else to the SSR fetch handler.
import { serve } from 'srvx'
import { serveStatic } from 'srvx/static'
import app from './dist/server/server.js'

const port = Number(process.env.PORT ?? 3000)
const hostname = process.env.HOST ?? '0.0.0.0'

const server = serve({
  port,
  hostname,
  middleware: [serveStatic({ dir: './dist/client' })],
  fetch: (request) => app.fetch(request),
})

await server.ready()

const shutdown = () => {
  server.close().finally(() => process.exit(0))
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
