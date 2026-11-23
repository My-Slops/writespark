import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL ?? 'postgres://localhost:5432/writespark', {
  onnotice: () => {},
  prepare: false,
})

const ddlStatements = [
  `create table if not exists identities (
    id uuid primary key default gen_random_uuid(),
    device_id text not null unique,
    created_at timestamptz not null default now()
  );`,
  `create table if not exists users (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    password_hash text not null,
    identity_id uuid references identities(id) constraint users_identity_id_unique unique,
    created_at timestamptz not null default now()
  );`,
  `create table if not exists sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id),
    token text not null unique,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null
  );`,
  `create table if not exists prompts (
    id uuid primary key default gen_random_uuid(),
    prompt_date date not null unique,
    title text not null,
    body text not null,
    created_at timestamptz not null default now()
  );`,
  `create table if not exists entries (
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
  );`,
  `create table if not exists badges (
    id uuid primary key default gen_random_uuid(),
    key text not null unique,
    name text not null,
    description text not null
  );`,
  `create table if not exists identity_badges (
    id uuid primary key default gen_random_uuid(),
    identity_id uuid not null references identities(id),
    badge_id uuid not null references badges(id),
    awarded_at timestamptz not null default now(),
    unique (identity_id, badge_id)
  );`,
  `create index if not exists idx_sessions_expires_at on sessions(expires_at);`,
  `create index if not exists idx_identity_badges_identity_id on identity_badges(identity_id);`,
]

/** Set when the users(identity_id) unique index had to be skipped because of duplicates. */
let uniqueIndexSkipped = null

await sql.begin(async (tx) => {
  for (const statement of ddlStatements) {
    await tx.unsafe(statement)
  }

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

  // Idempotent data migrations (safe to run on every start).
  // Account identities no longer share a device_id with a guest device.
  await tx`
    update identities i
    set device_id = 'account_' || u.id::text
    from users u
    where u.identity_id = i.id and left(i.device_id, 6) = 'guest_';
  `
  // A past bug created empty (0-word) entries on page load.
  await tx`delete from entries where word_count = 0;`

  // One account per identity. Fresh installs get this from CREATE TABLE; older databases get a
  // unique index here, unless a past bug already made accounts share an identity. Those rows
  // are left untouched (they need a human decision) and the index is retried on the next run.
  const [{ shared_identities: sharedIdentities, accounts }] = await tx`
    select count(*)::int as shared_identities, coalesce(sum(n), 0)::int as accounts
    from (
      select count(*) as n from users
      where identity_id is not null
      group by identity_id
      having count(*) > 1
    ) dup;
  `
  if (sharedIdentities === 0) {
    await tx`create unique index if not exists users_identity_id_unique on users(identity_id);`
  } else {
    uniqueIndexSkipped = { sharedIdentities, accounts }
  }
})

if (uniqueIndexSkipped) {
  const { sharedIdentities, accounts } = uniqueIndexSkipped
  console.warn(
    `WARNING: ${sharedIdentities} identit${sharedIdentities === 1 ? 'y is' : 'ies are'} shared by more than one account ` +
      `(${accounts} accounts in total), so the unique index users_identity_id_unique on users(identity_id) was NOT created. ` +
      'Those accounts were left as they are. Find them with:\n' +
      '  select identity_id, array_agg(email) from users where identity_id is not null group by 1 having count(*) > 1;\n' +
      'Detach all but one account per identity (e.g. set their identity_id to null; they get a new, empty identity on their ' +
        'next sign-in), then re-run this script.',
  )
}

console.log('Database initialized.')
await sql.end({ timeout: 5 })
