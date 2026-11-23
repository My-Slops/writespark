# Self-hosting WriteSpark

## Requirements
- Node.js 22.9+
- pnpm 10+
- PostgreSQL 14+

## Environment variables
- `DATABASE_URL` (required): PostgreSQL connection string
- `PORT` (optional, default `3000`) and `HOST` (optional, default `0.0.0.0`) for the production server
- `TRUST_PROXY` (optional, default unset): set to `true` only when the app sits behind a reverse proxy that overwrites `X-Forwarded-For`. Login/signup rate limiting then keys on the real client IP. Leave it unset when the app is reachable directly, otherwise clients can spoof the header.

## Docker Compose (recommended)
```bash
docker compose up --build
```

The `db` service has a `pg_isready` health check; the `app` service waits for it, then runs `node scripts/init-db.mjs && node scripts/seed-prompts.mjs` and starts the server on port 3000. Both scripts are idempotent, so they are safe on every restart. Nothing needs to be run manually.

To use the image against an external Postgres, build it and pass `DATABASE_URL`:

```bash
docker build -t writespark .
docker run -p 3000:3000 -e DATABASE_URL=postgres://user:pass@host:5432/writespark \
  writespark sh -c "node scripts/init-db.mjs && node scripts/seed-prompts.mjs && node server.mjs"
```

## Without Docker
```bash
export DATABASE_URL=postgres://user:pass@host:5432/writespark   # or put it in .env
pnpm install --frozen-lockfile
pnpm startup:check          # validates env and prompt config
pnpm build
pnpm db:init
pnpm db:seed:prompts
pnpm start                  # node server.mjs
```

`pnpm db:*`, `pnpm startup:check` and `pnpm start` read `.env` if present. `pnpm build` produces `dist/client` and `dist/server/server.js`; `server.mjs` serves them using srvx.

## Local development
```bash
docker compose up -d db
cp .env.example .env
pnpm install
pnpm db:init
pnpm db:seed:prompts
pnpm dev
```

## Reverse proxy notes
Use Caddy, Nginx, or Traefik for TLS termination and domain routing. Make the proxy set (not append to) `X-Forwarded-For`, then set `TRUST_PROXY=true`.

Rate limits for login/signup are kept in process memory: they reset on restart and are not shared between multiple app instances.

## systemd notes
If running on a VM/bare metal, use a process manager (systemd/pm2) and restart policy.
