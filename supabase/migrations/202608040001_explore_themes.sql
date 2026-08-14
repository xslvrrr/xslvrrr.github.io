-- Themes an administrator has published to the Explore section of the theme builder.
--
-- Rows are curated content rather than user data: they are readable by every signed-in account
-- through the API, and only ever written by an administrator-authorised server route. Access is
-- service-role only so the anon/authenticated keys can never reach the table directly.

create table if not exists public.explore_themes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_dark boolean not null,
  is_advanced boolean not null default false,
  colors jsonb not null,
  author_name text,
  published_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint explore_themes_name_unique unique (name),
  constraint explore_themes_name_check check (char_length(name) between 1 and 60),
  constraint explore_themes_author_name_check check (author_name is null or char_length(author_name) <= 60)
);

create index if not exists explore_themes_created_idx
  on public.explore_themes (created_at desc);

-- Keeps the `on delete set null` foreign key from sequentially scanning this table.
create index if not exists explore_themes_published_by_idx
  on public.explore_themes (published_by);

alter table public.explore_themes enable row level security;
revoke all on table public.explore_themes from public, anon, authenticated;
grant select, insert, update, delete on table public.explore_themes to service_role;
