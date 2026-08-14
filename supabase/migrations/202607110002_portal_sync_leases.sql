create table if not exists public.portal_sync_leases (
  user_id uuid primary key references public.users(id) on delete cascade,
  owner_id uuid not null,
  signature text not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists portal_sync_leases_expires_at_idx
  on public.portal_sync_leases (expires_at);

alter table public.portal_sync_leases enable row level security;
revoke all on table public.portal_sync_leases from public, anon, authenticated;
grant select, insert, update, delete on table public.portal_sync_leases to service_role;

create or replace function public.acquire_portal_sync_lease(
  p_user_id uuid,
  p_owner_id uuid,
  p_signature text,
  p_ttl_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
  bounded_ttl integer := greatest(30, least(coalesce(p_ttl_seconds, 60), 300));
begin
  insert into public.portal_sync_leases (user_id, owner_id, signature, started_at, expires_at)
  values (p_user_id, p_owner_id, p_signature, now(), now() + make_interval(secs => bounded_ttl))
  on conflict (user_id) do update
    set owner_id = excluded.owner_id,
        signature = excluded.signature,
        started_at = excluded.started_at,
        expires_at = excluded.expires_at
    where public.portal_sync_leases.expires_at <= now();

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.release_portal_sync_lease(
  p_user_id uuid,
  p_owner_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.portal_sync_leases
  where user_id = p_user_id and owner_id = p_owner_id;
$$;

revoke all on function public.acquire_portal_sync_lease(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.release_portal_sync_lease(uuid, uuid) from public, anon, authenticated;
grant execute on function public.acquire_portal_sync_lease(uuid, uuid, text, integer) to service_role;
grant execute on function public.release_portal_sync_lease(uuid, uuid) to service_role;
