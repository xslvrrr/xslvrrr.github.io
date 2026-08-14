-- Shared cache of AI-assigned notification categories.
--
-- Students at the same school receive the same notices, and the notice identity the client computes
-- is derived purely from the notice's own title, body, and dates — it carries no account, no name,
-- and no portal identifier. That makes a categorisation safe to share: the first account to open a
-- notice pays for the model call, and every other account reads the stored answer.
--
-- Nothing here is user data. Rows hold a content hash and one of four fixed category ids, never the
-- notice text itself, so the cache cannot be read back to reconstruct what a notice said.
--
-- Access is service-role only. The anon and authenticated keys must not reach this table, because a
-- client that could write it could poison every other account's filing.

create table if not exists public.notification_category_cache (
  notice_id text primary key,
  category text not null,
  provider_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_category_cache_category_check
    check (category in ('inbox', 'alerts', 'events', 'assignments')),
  constraint notification_category_cache_notice_id_check
    check (char_length(notice_id) between 1 and 200)
);

-- Retention sweeps delete by age, so the age column needs its own index.
create index if not exists notification_category_cache_updated_idx
  on public.notification_category_cache (updated_at desc);

alter table public.notification_category_cache enable row level security;
revoke all on table public.notification_category_cache from public, anon, authenticated;
grant select, insert, update, delete on table public.notification_category_cache to service_role;
