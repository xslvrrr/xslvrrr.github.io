-- Teacher changes found during a portal sync, and whether each one is permanent.
--
-- The portal never says whether a new name against a class is a permanent handover or someone
-- covering a single lesson, so `lib/portal-teacher-changes.ts` works it out by reading the same
-- fortnightly grid again for a date two weeks later. The result is news the student should see once,
-- which is why it is a table rather than another field inside `portal_data`: a row can be
-- acknowledged, and the acknowledgement has to survive the next sync overwriting the timetable.
--
-- Writes go through `record_portal_teacher_changes`, which is `security definer` and reachable only
-- by `service_role`. Every route that touches this table already runs on the server behind a session
-- check; no browser role is granted anything here.

create table if not exists public.portal_teacher_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  -- Identity of one change, from `detectTeacherChanges`. Carries both teacher names, so a class that
  -- changes hands twice in a term is two rows and the second is not swallowed by the first.
  change_key text not null,
  week text not null check (week in ('weekA', 'weekB')),
  day text not null default '',
  period text not null default '',
  course text not null default '',
  class_code text not null default '',
  room text not null default '',
  previous_teacher text not null,
  current_teacher text not null,
  kind text not null check (kind in ('permanent', 'substitute', 'unconfirmed')),
  -- The day the lookahead grid was read for. Null when no lookahead was taken, which is also the
  -- only way `kind` can stay 'unconfirmed' indefinitely.
  lookahead_date date,
  detected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  constraint portal_teacher_changes_key_unique unique (user_id, change_key)
);

-- The dashboard asks one question on load: is there anything unacknowledged. A partial index keeps
-- that off the history of every change the account has ever seen.
create index if not exists portal_teacher_changes_pending_idx
  on public.portal_teacher_changes (user_id, detected_at desc)
  where acknowledged_at is null;

alter table public.portal_teacher_changes enable row level security;
revoke all on table public.portal_teacher_changes from public, anon, authenticated;
grant select, insert, update, delete on table public.portal_teacher_changes to service_role;

/**
 * Records a sync's teacher changes and returns everything still unacknowledged.
 *
 * Upserts rather than inserts, because the same change is re-detected on every sync until the
 * previous timetable catches up. Re-detecting it must not produce a second row, and must not undo
 * an acknowledgement the student has already made.
 *
 * The one case where acknowledgement is deliberately cleared is a change that was 'unconfirmed' and
 * has since been classified: "your teacher changed" and "your teacher changed permanently" are
 * different pieces of news, and the second is the one worth interrupting for.
 */
create or replace function public.record_portal_teacher_changes(
  p_user_id uuid,
  p_changes jsonb
)
returns table (
  change_key text,
  week text,
  day text,
  period text,
  course text,
  class_code text,
  room text,
  previous_teacher text,
  current_teacher text,
  kind text,
  lookahead_date date,
  detected_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'A user is required to record teacher changes' using errcode = '22004';
  end if;

  if jsonb_typeof(p_changes) = 'array' and jsonb_array_length(p_changes) > 0 then
    insert into public.portal_teacher_changes as existing (
      user_id,
      change_key,
      week,
      day,
      period,
      course,
      class_code,
      room,
      previous_teacher,
      current_teacher,
      kind,
      lookahead_date
    )
    select
      p_user_id,
      entry ->> 'key',
      entry ->> 'week',
      coalesce(entry ->> 'day', ''),
      coalesce(entry ->> 'period', ''),
      coalesce(entry ->> 'course', ''),
      coalesce(entry ->> 'classCode', ''),
      coalesce(entry ->> 'room', ''),
      entry ->> 'previousTeacher',
      entry ->> 'currentTeacher',
      entry ->> 'kind',
      nullif(entry ->> 'lookaheadDate', '')::date
    from jsonb_array_elements(p_changes) as entry
    where entry ->> 'key' is not null
      and entry ->> 'week' in ('weekA', 'weekB')
      and entry ->> 'kind' in ('permanent', 'substitute', 'unconfirmed')
      and entry ->> 'previousTeacher' is not null
      and entry ->> 'currentTeacher' is not null
    on conflict (user_id, change_key) do update set
      kind = excluded.kind,
      room = excluded.room,
      lookahead_date = coalesce(excluded.lookahead_date, existing.lookahead_date),
      updated_at = now(),
      acknowledged_at = case
        when existing.kind = 'unconfirmed' and excluded.kind <> 'unconfirmed' then null
        else existing.acknowledged_at
      end;
  end if;

  -- A change nobody looked at for a term is not news any more, and the timetable it describes has
  -- moved on. Trimming here keeps the table from growing without a scheduled job.
  delete from public.portal_teacher_changes as stale
  where stale.user_id = p_user_id
    and stale.detected_at < now() - interval '120 days';

  return query
    select
      pending.change_key,
      pending.week,
      pending.day,
      pending.period,
      pending.course,
      pending.class_code,
      pending.room,
      pending.previous_teacher,
      pending.current_teacher,
      pending.kind,
      pending.lookahead_date,
      pending.detected_at
    from public.portal_teacher_changes as pending
    where pending.user_id = p_user_id
      and pending.acknowledged_at is null
    order by pending.detected_at desc
    limit 50;
end;
$$;

revoke all on function public.record_portal_teacher_changes(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_portal_teacher_changes(uuid, jsonb) to service_role;

/**
 * Marks teacher changes as seen.
 *
 * A null or empty `p_change_keys` acknowledges everything outstanding, which is what dismissing the
 * modal does. Naming keys is for a future surface that dismisses them one at a time.
 */
create or replace function public.acknowledge_portal_teacher_changes(
  p_user_id uuid,
  p_change_keys text[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_user_id is null then
    raise exception 'A user is required to acknowledge teacher changes' using errcode = '22004';
  end if;

  update public.portal_teacher_changes as target
  set acknowledged_at = now()
  where target.user_id = p_user_id
    and target.acknowledged_at is null
    and (
      p_change_keys is null
      or cardinality(p_change_keys) = 0
      or target.change_key = any (p_change_keys)
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.acknowledge_portal_teacher_changes(uuid, text[]) from public, anon, authenticated;
grant execute on function public.acknowledge_portal_teacher_changes(uuid, text[]) to service_role;
