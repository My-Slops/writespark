# Self-hosting WriteSpark

## Requirements
- Node.js 22.9+
- pnpm 10+
- PostgreSQL 14+

## Environment variables
- `DATABASE_URL` (required): PostgreSQL connection string
- `PORT` (optional, default `3000`) and `HOST` (optional, default `0.0.0.0`) for the production server
- `TRUST_PROXY` (default unset): **required** (`true`) when the app sits behind a reverse proxy that overwrites `X-Forwarded-For`. Without it, login/signup rate limits key on the proxy's IP, so all clients share one budget; the server logs a one-time warning when a request carries `X-Forwarded-For` while `TRUST_PROXY` is unset. Leave it unset when the app is reachable directly, otherwise clients can spoof the header.

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

Rate limits for login/signup are kept in process memory: they reset on restart and are not shared between multiple app instances. Per 15 minutes they allow 10 failed logins per email and client IP, 50 failed logins per email across all IPs, 30 failed logins per IP (successful logins are not counted), and 30 signups per IP. Values live in `src/lib/config.ts`.

## Upgrading
`init-db.mjs` runs on every start and migrates existing databases in place. It adds a unique index on `users(identity_id)`. If an older version already let two accounts share one identity, the index is skipped and a `WARNING` with the number of affected identities and a query to list them is printed; no rows are changed. Detach all but one account per identity (for example set their `identity_id` to NULL; they get a new, empty identity on their next sign-in), then restart or run `pnpm db:init` again.

## systemd notes
If running on a VM/bare metal, use a process manager (systemd/pm2) and restart policy.
