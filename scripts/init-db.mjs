import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL ?? 'postgres://localhost:5432/writespark')

await sql.begin(async (tx) => {
  await tx`
    create extension if not exists "pgcrypto";

    create table if not exists identities (
      id uuid primary key default gen_random_uuid(),
      device_id text not null unique,
      created_at timestamptz not null default now()
    );

    create table if not exists users (
      id uuid primary key default gen_random_uuid(),
      email text not null unique,
      password_hash text not null,
      identity_id uuid references identities(id),
      created_at timestamptz not null default now()
    );



    create table if not exists sessions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id),
      token text not null unique,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null
    );

    create table if not exists prompts (
      id uuid primary key default gen_random_uuid(),
      prompt_date date not null unique,
      title text not null,
      body text not null,
      created_at timestamptz not null default now()
    );

    create table if not exists entries (
      id uuid primary key default gen_random_uuid(),
      identity_id uuid not null references identities(id),
      prompt_date date not null,
      content text not null,
      word_count integer not null,
      locked boolean not null default false,
      timezone text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (identity_id, prompt_date)
    );

    create table if not exists badges (
      id uuid primary key default gen_random_uuid(),
      key text not null unique,
      name text not null,
      description text not null
    );

    create table if not exists identity_badges (
      id uuid primary key default gen_random_uuid(),
      identity_id uuid not null references identities(id),
      badge_id uuid not null references badges(id),
      awarded_at timestamptz not null default now(),
      unique (identity_id, badge_id)
    );
  `

  await tx`
    insert into badges (key, name, description)
    values
      ('first_entry', 'First Entry', 'Completed your first day of writing.'),
      ('streak_7', '1 Week Streak', 'Wrote for 7 consecutive days.'),
      ('streak_10', '10 Day Streak', 'Wrote for 10 consecutive days.'),
      ('single_1000', '1000 Words', 'Wrote at least 1000 words in one entry.'),
      ('single_2000', '2000 Words', 'Wrote at least 2000 words in one entry.'),
      ('total_5000', '5000 Total Words', 'Reached 5000 total words.'),
      ('total_10000', '10000 Total Words', 'Reached 10000 total words.'),
      ('entries_30', '30 Writing Days', 'Completed writing on 30 days.')
    on conflict (key) do nothing;
  `
})

console.log('Database initialized.')
await sql.end({ timeout: 5 })
