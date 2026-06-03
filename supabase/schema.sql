create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz not null default now()
);

create table if not exists connected_accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  provider text not null check (provider in ('google', 'notion')),
  access_token text,
  refresh_token text,
  external_id text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile_id, provider)
);

create table if not exists command_tasks (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  external_id text,
  pillar text not null,
  source text not null,
  title text not null,
  priority text not null default 'medium',
  done boolean not null default false,
  minutes integer not null default 20,
  due_time time,
  action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists alert_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  alert_key text not null,
  title text not null,
  body text,
  sent_at timestamptz not null default now(),
  unique(profile_id, alert_key)
);

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);
