-- Millennium web/desktop sync schema.
-- Safe to rerun: existing rows and columns are preserved.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  millennium_uid text,
  email text,
  name text not null default '',
  school text not null default 'rhhs',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_sync timestamptz,
  portal_data jsonb,
  profile_image text
);

alter table public.users add column if not exists millennium_uid text;
alter table public.users add column if not exists email text;
alter table public.users add column if not exists name text not null default '';
alter table public.users add column if not exists school text not null default 'rhhs';
alter table public.users add column if not exists settings jsonb not null default '{}'::jsonb;
alter table public.users add column if not exists created_at timestamptz not null default now();
alter table public.users add column if not exists last_sync timestamptz;
alter table public.users add column if not exists portal_data jsonb;
alter table public.users add column if not exists profile_image text;
alter table public.users add column if not exists notification_states jsonb not null default '{}'::jsonb;
alter table public.users add column if not exists local_events jsonb not null default '[]'::jsonb;
alter table public.users add column if not exists local_calendars jsonb not null default '[]'::jsonb;
alter table public.users add column if not exists notification_folders jsonb not null default '[]'::jsonb;
alter table public.users add column if not exists home_settings jsonb;
alter table public.users add column if not exists home_layout jsonb;
alter table public.users add column if not exists google_events jsonb not null default '[]'::jsonb;
alter table public.users add column if not exists google_calendars jsonb not null default '[]'::jsonb;
alter table public.users add column if not exists theme_builder_state jsonb;
alter table public.users add column if not exists theme_builder_custom jsonb not null default '[]'::jsonb;
alter table public.users add column if not exists assistant_chats jsonb not null default '[]'::jsonb;
alter table public.users add column if not exists assistant_skills jsonb not null default '[]'::jsonb;
alter table public.users add column if not exists annotations jsonb not null default '[]'::jsonb;
alter table public.users add column if not exists portal_credentials jsonb;
alter table public.users add column if not exists portal_credentials_updated_at timestamptz;

create unique index if not exists users_millennium_uid_unique
  on public.users (millennium_uid)
  where millennium_uid is not null and millennium_uid <> '';

create table if not exists public.login_tokens (
  token uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.login_tokens add column if not exists user_id uuid;
alter table public.login_tokens add column if not exists expires_at timestamptz;
alter table public.login_tokens add column if not exists created_at timestamptz not null default now();
alter table public.login_tokens add column if not exists token uuid default gen_random_uuid();

delete from public.login_tokens
where token is null or user_id is null or expires_at is null;

alter table public.login_tokens alter column token set not null;
alter table public.login_tokens alter column user_id set not null;
alter table public.login_tokens alter column expires_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'login_tokens_user_id_fkey'
      and conrelid = 'public.login_tokens'::regclass
  ) then
    alter table public.login_tokens
      add constraint login_tokens_user_id_fkey
      foreign key (user_id) references public.users(id) on delete cascade not valid;
  end if;
end
$$;

create unique index if not exists login_tokens_token_unique on public.login_tokens (token);
create index if not exists login_tokens_user_id_idx on public.login_tokens (user_id);
create index if not exists login_tokens_expires_at_idx on public.login_tokens (expires_at);

create table if not exists public.extension_installations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz not null default (now() + interval '90 days'),
  revoked_at timestamptz
);

alter table public.extension_installations add column if not exists expires_at timestamptz
  not null default (now() + interval '90 days');

create index if not exists extension_installations_user_id_idx
  on public.extension_installations (user_id);

create table if not exists public.classroom_data (
  scope text primary key default 'global',
  courses jsonb not null default '[]'::jsonb,
  items jsonb not null default '[]'::jsonb,
  last_updated timestamptz,
  last_full_sync timestamptz,
  sync_stats jsonb
);

alter table public.classroom_data add column if not exists courses jsonb not null default '[]'::jsonb;
alter table public.classroom_data add column if not exists scope text not null default 'global';
alter table public.classroom_data add column if not exists items jsonb not null default '[]'::jsonb;
alter table public.classroom_data add column if not exists last_updated timestamptz;
alter table public.classroom_data add column if not exists last_full_sync timestamptz;
alter table public.classroom_data add column if not exists sync_stats jsonb;

create unique index if not exists classroom_data_scope_unique on public.classroom_data (scope);

create or replace function public.consume_login_token(p_token uuid)
returns table (user_id uuid)
language sql
security definer
set search_path = public
as $$
  delete from public.login_tokens
  where token::text = p_token::text
    and expires_at > now()
  returning user_id;
$$;

revoke all on function public.consume_login_token(uuid) from public, anon, authenticated;
grant execute on function public.consume_login_token(uuid) to service_role;

-- These tables are accessed only by the server-side service-role client.
alter table public.users enable row level security;
alter table public.login_tokens enable row level security;
alter table public.extension_installations enable row level security;
alter table public.classroom_data enable row level security;

revoke all on table public.users from anon, authenticated;
revoke all on table public.login_tokens from anon, authenticated;
revoke all on table public.extension_installations from anon, authenticated;
revoke all on table public.classroom_data from anon, authenticated;
