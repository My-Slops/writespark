# Contributing to WriteSpark

## Setup
1. `docker compose up -d db` (or point `DATABASE_URL` at any Postgres 14+)
2. Copy `.env.example` to `.env` and set `DATABASE_URL`
3. `pnpm install`
4. `pnpm db:init`
5. `pnpm db:seed:prompts`
6. `pnpm dev`

The schema lives in `scripts/init-db.mjs` (source of truth) and is mirrored in `src/lib/schema.ts`; change both together.

## Development workflow
- Keep changes focused and small.
- Add or update tests when behavior changes.
- Run `pnpm lint && pnpm typecheck && pnpm test` before opening a PR. For UI or save-flow changes also run `pnpm test:e2e` (needs the database above and `pnpm exec playwright install chromium`).

## GitHub issue formatting helper
Use markdown files + helper script to avoid escaped newline formatting mistakes:

```bash
scripts/gh-format-issue-body.sh --repo My-Slops/writespark --issue <n> --body-file .github/issue-bodies/issue-<n>.md
```

For PR notes/reviews, prefer `gh pr comment --body-file <file.md>` over inline quoted strings.
