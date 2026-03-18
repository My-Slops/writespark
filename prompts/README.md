# Prompt calendar source

WriteSpark uses file-based prompts that seed into Postgres.

## File
- `calendar-prompts.json`

Each item must include:
- `date` in `YYYY-MM-DD`
- `title`
- `body`

## Commands

Validate prompt file and coverage:

```bash
pnpm prompts:validate
```

Seed/update DB:

```bash
pnpm db:seed:prompts
```

## Contributor workflow
1. Add new prompt rows in chronological order.
2. Run `pnpm prompts:validate`.
3. Run `pnpm db:seed:prompts`.
4. Include prompt changes in PR.
