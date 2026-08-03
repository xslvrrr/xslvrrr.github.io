-- Public "bump" reactions on changelog sections.
--
-- Voters are keyed by an opaque HMAC computed in the application layer, so neither an account id
-- nor an anonymous visitor id is ever stored here. One row per (voter, section) makes the
-- per-section uniqueness a primary-key property rather than something application code enforces.

create table if not exists public.changelog_bumps (
  voter_key text not null,
  section_id text not null,
  created_at timestamptz not null default now(),
  primary key (voter_key, section_id),
  constraint changelog_bumps_voter_key_check check (char_length(voter_key) between 16 and 160),
  constraint changelog_bumps_section_id_check check (char_length(section_id) between 1 and 64)
);

create index if not exists changelog_bumps_section_idx
  on public.changelog_bumps (section_id);

alter table public.changelog_bumps enable row level security;
revoke all on table public.changelog_bumps from public, anon, authenticated;
grant select, insert on table public.changelog_bumps to service_role;

-- Aggregate totals plus this voter's own bumps in a single round trip.
create or replace function public.changelog_bump_state_v1(
  p_voter_key text,
  p_max_bumps integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max integer := greatest(1, least(coalesce(p_max_bumps, 3), 20));
  v_counts jsonb;
  v_mine jsonb;
  v_used integer;
begin
  select coalesce(jsonb_object_agg(section_id, bump_count), '{}'::jsonb)
    into v_counts
  from (
    select section_id, count(*)::bigint as bump_count
    from public.changelog_bumps
    group by section_id
  ) totals;

  select coalesce(jsonb_agg(section_id order by section_id), '[]'::jsonb), count(*)
    into v_mine, v_used
  from public.changelog_bumps
  where voter_key = p_voter_key;

  return jsonb_build_object(
    'counts', v_counts,
    'bumped', v_mine,
    'remaining', greatest(0, v_max - coalesce(v_used, 0)),
    'maxBumps', v_max
  );
end;
$$;

-- Records one bump, capped per voter. Returns the same shape as the state function so the caller
-- can render the result without a second query.
create or replace function public.bump_changelog_section_v1(
  p_voter_key text,
  p_section_id text,
  p_max_bumps integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max integer := greatest(1, least(coalesce(p_max_bumps, 3), 20));
  v_used integer;
  v_status text;
begin
  if p_voter_key is null or char_length(p_voter_key) not between 16 and 160 then
    raise exception 'Invalid voter key';
  end if;
  if p_section_id is null or char_length(p_section_id) not between 1 and 64 then
    raise exception 'Invalid changelog section id';
  end if;

  -- Serialises concurrent bumps from one voter so the allowance cannot be raced past its cap.
  perform pg_advisory_xact_lock(hashtextextended(p_voter_key, 0));

  if exists (
    select 1 from public.changelog_bumps
    where voter_key = p_voter_key and section_id = p_section_id
  ) then
    v_status := 'already_bumped';
  else
    select count(*) into v_used
    from public.changelog_bumps
    where voter_key = p_voter_key;

    if coalesce(v_used, 0) >= v_max then
      v_status := 'no_bumps_remaining';
    else
      insert into public.changelog_bumps (voter_key, section_id)
      values (p_voter_key, p_section_id)
      on conflict (voter_key, section_id) do nothing;
      v_status := 'bumped';
    end if;
  end if;

  return jsonb_build_object('status', v_status)
    || public.changelog_bump_state_v1(p_voter_key, v_max);
end;
$$;

revoke all on function public.changelog_bump_state_v1(text, integer) from public, anon, authenticated;
grant execute on function public.changelog_bump_state_v1(text, integer) to service_role;

revoke all on function public.bump_changelog_section_v1(text, text, integer) from public, anon, authenticated;
grant execute on function public.bump_changelog_section_v1(text, text, integer) to service_role;
