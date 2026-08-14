-- Recreate user-owned Classroom snapshots and short-lived desktop upload sessions.

-- Older installations may still have the retired extension-era Classroom table.
-- Remove only that legacy shape; preserve the current snapshot table on reruns.
do $$
begin
  if to_regclass('public.classroom_data') is not null
    and not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'classroom_data'
        and column_name = 'snapshot'
    )
  then
    drop table public.classroom_data;
  end if;
end;
$$;

create table if not exists public.classroom_data (
  user_id uuid primary key references public.users(id) on delete cascade,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  schema_version integer not null check (schema_version = 1),
  integrity text not null check (integrity in ('complete', 'partial', 'verified-empty')),
  course_count integer not null check (course_count >= 0),
  item_count integer not null check (item_count >= 0),
  last_synced_at timestamptz not null,
  retention_expires_at timestamptz not null default (now() + interval '365 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (retention_expires_at > created_at)
);

create index if not exists classroom_data_retention_expires_at_idx
  on public.classroom_data (retention_expires_at);

alter table public.classroom_data enable row level security;
revoke all on table public.classroom_data from public, anon, authenticated;
grant all on table public.classroom_data to service_role;

create table if not exists public.classroom_sync_sessions (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text unique,
  status text not null default 'pending'
    check (status in ('pending', 'uploading', 'completed', 'failed', 'cancelled', 'expired')),
  error_code text check (error_code is null or char_length(error_code) <= 100),
  expires_at timestamptz not null,
  retention_expires_at timestamptz not null default (now() + interval '7 days'),
  consumed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (retention_expires_at > created_at),
  check (consumed_at is null or consumed_at >= created_at),
  check (completed_at is null or (consumed_at is not null and completed_at >= consumed_at)),
  check (
    (status = 'pending' and token_hash is not null and consumed_at is null and completed_at is null)
    or (status = 'uploading' and token_hash is null and consumed_at is not null and completed_at is null)
    or (status = 'completed' and token_hash is null and consumed_at is not null and completed_at is not null)
    or (status = 'failed' and token_hash is null and completed_at is null)
    or (status = 'cancelled' and token_hash is null and completed_at is null)
    or (status = 'expired' and token_hash is null and consumed_at is null and completed_at is null)
  )
);

create unique index if not exists classroom_sync_sessions_user_active_unique
  on public.classroom_sync_sessions (user_id)
  where status in ('pending', 'uploading');
create index if not exists classroom_sync_sessions_user_created_at_idx
  on public.classroom_sync_sessions (user_id, created_at desc);
create index if not exists classroom_sync_sessions_expires_at_idx
  on public.classroom_sync_sessions (expires_at);
create index if not exists classroom_sync_sessions_retention_expires_at_idx
  on public.classroom_sync_sessions (retention_expires_at);

alter table public.classroom_sync_sessions enable row level security;
revoke all on table public.classroom_sync_sessions from public, anon, authenticated;
grant all on table public.classroom_sync_sessions to service_role;

create or replace function public.create_classroom_sync_session(
  p_session_id uuid,
  p_user_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_retention_expires_at timestamptz
)
returns table(created boolean, conflict boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from public.users where id = p_user_id for update;
  if not found then
    raise exception 'Classroom sync user does not exist' using errcode = '23503';
  end if;

  update public.classroom_sync_sessions
  set status = 'expired', token_hash = null, updated_at = now()
  where user_id = p_user_id
    and status = 'pending'
    and expires_at <= now();

  if exists (
    select 1 from public.classroom_sync_sessions
    where user_id = p_user_id and status = 'uploading'
  ) then
    return query select false, true;
    return;
  end if;

  update public.classroom_sync_sessions
  set
    status = 'cancelled',
    token_hash = null,
    updated_at = now(),
    retention_expires_at = greatest(retention_expires_at, now() + interval '7 days')
  where user_id = p_user_id and status = 'pending';

  insert into public.classroom_sync_sessions (
    id,
    user_id,
    token_hash,
    status,
    expires_at,
    retention_expires_at,
    created_at,
    updated_at
  ) values (
    p_session_id,
    p_user_id,
    p_token_hash,
    'pending',
    p_expires_at,
    p_retention_expires_at,
    now(),
    now()
  );

  return query select true, false;
end;
$$;

revoke all on function public.create_classroom_sync_session(uuid, uuid, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.create_classroom_sync_session(uuid, uuid, text, timestamptz, timestamptz)
  to service_role;

create or replace function public.replace_classroom_snapshot(
  p_user_id uuid,
  p_snapshot jsonb,
  p_schema_version integer,
  p_integrity text,
  p_course_count integer,
  p_item_count integer,
  p_last_synced_at timestamptz,
  p_retention_expires_at timestamptz
)
returns table(replaced boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.classroom_data%rowtype;
begin
  perform 1 from public.users where id = p_user_id for update;
  if not found then
    raise exception 'Classroom snapshot user does not exist' using errcode = '23503';
  end if;

  select * into v_existing
  from public.classroom_data
  where user_id = p_user_id
  for update;

  if found and p_integrity = 'partial' then
    return query select false, 'partial';
    return;
  end if;
  if found and p_last_synced_at < v_existing.last_synced_at then
    return query select false, 'stale';
    return;
  end if;

  insert into public.classroom_data (
    user_id,
    snapshot,
    schema_version,
    integrity,
    course_count,
    item_count,
    last_synced_at,
    retention_expires_at,
    created_at,
    updated_at
  ) values (
    p_user_id,
    p_snapshot,
    p_schema_version,
    p_integrity,
    p_course_count,
    p_item_count,
    p_last_synced_at,
    p_retention_expires_at,
    now(),
    now()
  )
  on conflict (user_id) do update set
    snapshot = excluded.snapshot,
    schema_version = excluded.schema_version,
    integrity = excluded.integrity,
    course_count = excluded.course_count,
    item_count = excluded.item_count,
    last_synced_at = excluded.last_synced_at,
    retention_expires_at = excluded.retention_expires_at,
    updated_at = now();

  return query select true, 'replaced';
end;
$$;

revoke all on function public.replace_classroom_snapshot(uuid, jsonb, integer, text, integer, integer, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.replace_classroom_snapshot(uuid, jsonb, integer, text, integer, integer, timestamptz, timestamptz)
  to service_role;

create or replace function public.complete_classroom_sync_upload(
  p_session_id uuid,
  p_token_hash text,
  p_snapshot jsonb,
  p_schema_version integer,
  p_integrity text,
  p_course_count integer,
  p_item_count integer,
  p_last_synced_at timestamptz,
  p_retention_expires_at timestamptz
)
returns table(outcome text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_existing public.classroom_data%rowtype;
begin
  select user_id into v_user_id
  from public.classroom_sync_sessions
  where id = p_session_id
    and token_hash = p_token_hash
    and status = 'pending'
    and expires_at > now();

  if v_user_id is null then
    return query select 'invalid';
    return;
  end if;

  perform 1 from public.users where id = v_user_id for update;
  if not found then
    return query select 'invalid';
    return;
  end if;

  select user_id into v_user_id
  from public.classroom_sync_sessions
  where id = p_session_id
    and token_hash = p_token_hash
    and status = 'pending'
    and expires_at > now()
  for update;

  if v_user_id is null then
    return query select 'invalid';
    return;
  end if;

  select * into v_existing
  from public.classroom_data
  where user_id = v_user_id
  for update;

  if found and p_integrity = 'partial' then
    update public.classroom_sync_sessions
    set
      status = 'failed',
      token_hash = null,
      consumed_at = now(),
      error_code = 'PARTIAL_SNAPSHOT_REJECTED',
      updated_at = now(),
      retention_expires_at = greatest(retention_expires_at, now() + interval '7 days')
    where id = p_session_id;
    return query select 'partial';
    return;
  end if;

  if found and p_last_synced_at < v_existing.last_synced_at then
    update public.classroom_sync_sessions
    set
      status = 'failed',
      token_hash = null,
      consumed_at = now(),
      error_code = 'STALE_SNAPSHOT_REJECTED',
      updated_at = now(),
      retention_expires_at = greatest(retention_expires_at, now() + interval '7 days')
    where id = p_session_id;
    return query select 'stale';
    return;
  end if;

  update public.classroom_sync_sessions
  set
    status = 'uploading',
    token_hash = null,
    consumed_at = now(),
    error_code = null,
    updated_at = now(),
    retention_expires_at = greatest(retention_expires_at, now() + interval '7 days')
  where id = p_session_id;

  insert into public.classroom_data (
    user_id,
    snapshot,
    schema_version,
    integrity,
    course_count,
    item_count,
    last_synced_at,
    retention_expires_at,
    created_at,
    updated_at
  ) values (
    v_user_id,
    p_snapshot,
    p_schema_version,
    p_integrity,
    p_course_count,
    p_item_count,
    p_last_synced_at,
    p_retention_expires_at,
    now(),
    now()
  )
  on conflict (user_id) do update set
    snapshot = excluded.snapshot,
    schema_version = excluded.schema_version,
    integrity = excluded.integrity,
    course_count = excluded.course_count,
    item_count = excluded.item_count,
    last_synced_at = excluded.last_synced_at,
    retention_expires_at = excluded.retention_expires_at,
    updated_at = now();

  update public.classroom_sync_sessions
  set
    status = 'completed',
    completed_at = now(),
    updated_at = now()
  where id = p_session_id and status = 'uploading';

  return query select 'completed';
end;
$$;

revoke all on function public.complete_classroom_sync_upload(uuid, text, jsonb, integer, text, integer, integer, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.complete_classroom_sync_upload(uuid, text, jsonb, integer, text, integer, integer, timestamptz, timestamptz)
  to service_role;

create or replace function public.delete_classroom_snapshot(p_user_id uuid)
returns table(deleted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted bigint := 0;
begin
  perform 1 from public.users where id = p_user_id for update;
  if not found then
    return query select false;
    return;
  end if;

  update public.classroom_sync_sessions
  set
    status = 'cancelled',
    token_hash = null,
    error_code = 'CLASSROOM_DATA_DELETED',
    updated_at = now(),
    retention_expires_at = greatest(retention_expires_at, now() + interval '7 days')
  where user_id = p_user_id and status in ('pending', 'uploading');

  delete from public.classroom_data where user_id = p_user_id;
  get diagnostics v_deleted = row_count;
  return query select v_deleted > 0;
end;
$$;

revoke all on function public.delete_classroom_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.delete_classroom_snapshot(uuid) to service_role;

-- PostgreSQL cannot change a function's OUT row type with CREATE OR REPLACE.
drop function if exists public.prune_expired_operational_data();

create function public.prune_expired_operational_data()
returns table (
  api_rate_limits_deleted bigint,
  login_tokens_deleted bigint,
  assistant_action_approvals_deleted bigint,
  portal_sync_leases_deleted bigint,
  classroom_data_deleted bigint,
  classroom_sync_sessions_deleted bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_api_rate_limits_deleted bigint := 0;
  v_login_tokens_deleted bigint := 0;
  v_assistant_action_approvals_deleted bigint := 0;
  v_portal_sync_leases_deleted bigint := 0;
  v_classroom_data_deleted bigint := 0;
  v_classroom_sync_sessions_deleted bigint := 0;
begin
  delete from public.api_rate_limits
  where expires_at <= now();
  get diagnostics v_api_rate_limits_deleted = row_count;

  delete from public.login_tokens
  where expires_at <= now();
  get diagnostics v_login_tokens_deleted = row_count;

  delete from public.assistant_action_approvals
  where expires_at <= now();
  get diagnostics v_assistant_action_approvals_deleted = row_count;

  delete from public.portal_sync_leases
  where expires_at <= now();
  get diagnostics v_portal_sync_leases_deleted = row_count;

  delete from public.classroom_data
  where retention_expires_at <= now();
  get diagnostics v_classroom_data_deleted = row_count;

  delete from public.classroom_sync_sessions
  where retention_expires_at <= now();
  get diagnostics v_classroom_sync_sessions_deleted = row_count;

  return query select
    v_api_rate_limits_deleted,
    v_login_tokens_deleted,
    v_assistant_action_approvals_deleted,
    v_portal_sync_leases_deleted,
    v_classroom_data_deleted,
    v_classroom_sync_sessions_deleted;
end;
$$;

revoke all on function public.prune_expired_operational_data() from public, anon, authenticated;
grant execute on function public.prune_expired_operational_data() to service_role;
