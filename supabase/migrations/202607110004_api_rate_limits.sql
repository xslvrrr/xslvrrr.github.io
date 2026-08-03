create table if not exists public.api_rate_limits (
  key text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  expires_at timestamptz not null
);

create index if not exists api_rate_limits_expires_at_idx
  on public.api_rate_limits (expires_at);

alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.api_rate_limits to service_role;

create or replace function public.consume_api_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  bounded_limit integer := greatest(1, least(coalesce(p_limit, 1), 10000));
  bounded_window integer := greatest(1, least(coalesce(p_window_seconds, 60), 86400));
  current_count integer;
  current_expiry timestamptz;
begin
  if p_key is null or length(p_key) < 16 or length(p_key) > 160 then
    raise exception 'Invalid rate-limit key';
  end if;

  -- Bound stale-key growth without requiring a separate scheduler. The indexed,
  -- capped cleanup is safe even when an attacker varies unauthenticated inputs.
  delete from public.api_rate_limits
  where ctid in (
    select ctid
    from public.api_rate_limits
    where expires_at < now() - interval '1 day'
    order by expires_at
    limit 100
  );

  insert into public.api_rate_limits as rate_limit (
    key,
    window_started_at,
    request_count,
    expires_at
  ) values (
    p_key,
    now(),
    1,
    now() + make_interval(secs => bounded_window)
  )
  on conflict (key) do update
  set request_count = case
        when rate_limit.expires_at <= now() then 1
        else rate_limit.request_count + 1
      end,
      window_started_at = case
        when rate_limit.expires_at <= now() then now()
        else rate_limit.window_started_at
      end,
      expires_at = case
        when rate_limit.expires_at <= now() then now() + make_interval(secs => bounded_window)
        else rate_limit.expires_at
      end
  returning request_count, expires_at into current_count, current_expiry;

  allowed := current_count <= bounded_limit;
  remaining := greatest(0, bounded_limit - current_count);
  retry_after_seconds := case
    when allowed then 0
    else greatest(1, ceil(extract(epoch from (current_expiry - now())))::integer)
  end;
  return next;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to service_role;
