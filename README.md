# WriteSpark

WriteSpark is an open-source daily writing web app that removes blank-page friction with a fixed prompt per calendar date.

## Core features (v1)
- Fixed prompt by calendar date
- Browser-local day boundary
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

```bash
cp .env.example .env
pnpm install
pnpm db:init
pnpm prompts:validate
pnpm db:seed:prompts
pnpm dev
```

## Validation

```bash
pnpm lint
pnpm typecheck
pnpm test
```

## Self-hosting
Any environment that can run Node + connect to Postgres works.

1. Provision Postgres.
2. Set `DATABASE_URL`.
3. Run DB init/seed scripts.
4. Build and run app:

```bash
pnpm build
pnpm start
```

> Note: Add your own process manager/reverse proxy (systemd, Docker, nginx, Caddy, etc.) depending on infra preference.

## Prompt configuration
Edit `prompts/calendar-prompts.json`, validate, then seed:

```bash
pnpm prompts:validate
pnpm db:seed:prompts
```

## License
MIT


## CI
GitHub Actions runs lint, typecheck, tests, and build on PRs and main.
