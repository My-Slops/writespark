# Contributing to WriteSpark

## Setup
1. Copy `.env.example` to `.env` and set `DATABASE_URL`
2. `pnpm install`
3. `pnpm db:init`
4. `pnpm db:seed:prompts`
5. `pnpm dev`

## Development workflow
- Keep changes focused and small.
- Add or update tests when behavior changes.
- Run `pnpm lint && pnpm typecheck && pnpm test` before opening a PR.
