# Self-hosting WriteSpark

## Requirements
- Node.js 22+
- pnpm 10+
- PostgreSQL 14+

## Environment variables
- `DATABASE_URL` (required): PostgreSQL connection string

## Startup checks
Run before first launch:

```bash
pnpm startup:check
```

This validates required environment variables and prompt config integrity.

## Local run
```bash
cp .env.example .env
pnpm install
pnpm startup:check
pnpm db:init
pnpm prompts:validate
pnpm db:seed:prompts
pnpm dev
```

## Docker Compose
```bash
docker compose up --build
```

Then initialize DB in app container:

```bash
docker compose exec app node scripts/init-db.mjs
docker compose exec app node scripts/seed-prompts.mjs
```

## Reverse proxy notes
Use Caddy, Nginx, or Traefik for TLS termination and domain routing.

## systemd notes
If running on a VM/bare metal, use a process manager (systemd/pm2) and restart policy.
