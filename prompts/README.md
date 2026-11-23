# Prompt calendar source

WriteSpark uses file-based prompts that seed into Postgres.

## File
- `calendar-prompts.json`

Each item must include:
- `date` in `YYYY-MM-DD`
- `title` (3-160 characters)
- `body` (20-5000 characters)

## Coverage

The calendar currently covers **2026-03-18 through 2027-03-17** (365 consecutive days, one prompt per date).

Dates without a configured prompt fall back to a deterministic rotation over the existing prompts (implemented server-side), so gaps do not break the app. Even so, add new date ranges before the calendar runs out after **2027-03-17**, so that people see a prompt written for that day rather than a recycled one.

## Content guidelines

- Write each prompt by hand. No templated or programmatically combined text.
- Titles are short (about 2-7 words) and unique. Bodies are 1-3 sentences and end in a concrete question or instruction.
- Mix themes: memory, relationships, work and craft, values, body, places, objects, senses, fears, gratitude, imagination, future self, habits, money, learning, failure, nature, food, music, small daily observation. Avoid clustering similar themes on nearby dates.
- Mix introspective, playful and concrete sensory prompts.
- Keep prompts universal. Do not assume religion, gender, nationality, family structure, a job, a partner or children, or a hemisphere. Avoid holidays and season-specific references, since dates apply worldwide.
- No trauma-forcing prompts. Difficult topics are fine when framed gently and as optional.
- Use plain, warm, specific language. Avoid cliches such as "journey", "unlock", "embrace" or "dive into".

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
