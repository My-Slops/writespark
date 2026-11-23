# WriteSpark

WriteSpark is an open-source daily writing web app that removes blank-page friction with a fixed prompt per calendar date.

## Core features (v1)
- Fixed prompt by calendar date
- Day boundary follows the browser's timezone
- Past days are view-only (locked)
- Guest mode by default (device-based identity)
- Optional account model scaffolded in DB
- Persistent Postgres storage
- 3000-word max per entry
- Dashboard (completion + daily words + total words)
- Badge milestones
- JSON export
- Markdown export
- Notebook-style UI + dark mode + mobile-first layout

## Stack
- TanStack Start (React + full-stack)
- TypeScript
- Postgres
- Drizzle ORM

## Local development
Requires Node 22.9+ (the scripts use `--env-file-if-exists`), pnpm 10, and Docker (or any Postgres 14+).

```bash
docker compose up -d db          # Postgres on localhost:5432
cp .env.example .env             # DATABASE_URL for the compose database
pnpm install
pnpm db:init                     # create tables (idempotent)
pnpm db:seed:prompts             # load prompts/calendar-prompts.json
pnpm dev                         # http://localhost:3000
```

The `db:*`, `startup:check` and `start` scripts load `.env` automatically. `vite dev` also loads `.env` into `process.env` for server code. Environment variables already set in your shell take effect for the `node` scripts; for `vite dev`, values in `.env` are applied on top of the shell environment.

## How days work
- The server decides "today" from its own clock, interpreted in the browser's timezone (sent with each request).
- Past days are read-only (locked); only today can be edited.
- If no prompt is configured for a date, one is picked deterministically from the existing prompts, so the same date always shows the same prompt.

## Accounts
- Signing up adopts this device's guest entries into the new account; the device then starts a fresh guest.
- Logging in moves the device's guest entries into the account. If the account already has an entry for the same date, the guest text is appended below it after a `---` line, never dropped (even past the word limit; the editor then asks you to trim before the next save).
- If a request carries a session that is unknown or expired, the server answers "Your session has expired. Please log in again." instead of quietly saving into the device's guest identity.
- Login and signup are rate limited in process memory: 10 failed logins per email and client IP, 50 per email across all IPs, 30 failed logins per IP (successful logins don't count) and 30 signups per IP, each per 15 minutes (`src/lib/config.ts`). While a limit is hit, logins are refused without checking the password.

## Validation and tests

```bash
pnpm lint
pnpm typecheck
pnpm test          # unit tests (vitest), no database needed
pnpm test:e2e      # Playwright end-to-end tests
```

`pnpm test:e2e` needs a running, initialized and seeded Postgres (see Local development), `DATABASE_URL` (defaults to `postgres://postgres:postgres@localhost:5432/writespark`), and a one-time `pnpm exec playwright install chromium`. It starts its own dev server on port 3100.

## Production

### Docker Compose
```bash
docker compose up --build
```
Starts Postgres (with a health check) and the app on http://localhost:3000. On every start the app container runs `node scripts/init-db.mjs && node scripts/seed-prompts.mjs` (both idempotent) before launching the server.

### Without Docker
```bash
export DATABASE_URL=postgres://user:pass@host:5432/writespark
pnpm install --frozen-lockfile
pnpm build
pnpm db:init && pnpm db:seed:prompts
pnpm start          # node server.mjs, listens on PORT (default 3000)
```
`pnpm build` writes `dist/client` and `dist/server/server.js`. `server.mjs` (using [srvx](https://srvx.h3.dev)) serves `dist/client` statics and forwards other requests to the TanStack Start fetch handler. Set `PORT` / `HOST` to change the listen address. Behind a reverse proxy you must set `TRUST_PROXY=true`, otherwise every client shares the proxy's IP for rate limiting; the server logs a one-time warning when it sees `X-Forwarded-For` without it (see [docs/self-hosting.md](docs/self-hosting.md)).

Add your own process manager or reverse proxy (systemd, Caddy, nginx, etc.) for TLS and restarts. See [docs/self-hosting.md](docs/self-hosting.md).

### Database schema
`scripts/init-db.mjs` is the source of truth for the schema and also applies small idempotent data migrations; `src/lib/schema.ts` mirrors it for Drizzle. Change both together.

`users.identity_id` is unique (one account per identity). Existing databases get the `users_identity_id_unique` index on the next `init-db` run. If an older bug already left several accounts sharing one identity, the script skips the index, prints a warning with the count and a query to find them, and changes nothing; detach the extra accounts by hand (for example `identity_id = NULL`) and run it again.

## Prompt configuration
Edit `prompts/calendar-prompts.json`, validate, then seed:

```bash
pnpm prompts:validate
pnpm db:seed:prompts
```

## License
MIT


## CI
GitHub Actions runs lint, typecheck, unit tests, build, and Playwright e2e (against a Postgres service) on PRs and main.
