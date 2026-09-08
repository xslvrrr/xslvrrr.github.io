-- Live home snapshots retain full-sync freshness and official attendance history.
-- Supersedes the merge functions from 202607240001; the later account RPC remains available.

create or replace function public._millennium_merge_attendance_periods(p_existing jsonb, p_incoming jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_item jsonb;
  v_previous jsonb;
  v_key text;
  v_items jsonb := '{}'::jsonb;
  v_order text[] := array[]::text[];
  v_result jsonb;
begin
  for v_item in select value from jsonb_array_elements(
    public._millennium_jsonb_array(p_existing) || public._millennium_jsonb_array(p_incoming)
  ) loop
    if jsonb_typeof(v_item) <> 'object' then continue; end if;
    v_key := lower(btrim(coalesce(v_item ->> 'label', '')));
    if v_key = '' then continue; end if;
    v_previous := coalesce(v_items -> v_key, '{}'::jsonb);
    if not (v_items ? v_key) then v_order := array_append(v_order, v_key); end if;
    -- An explicit incoming mark (including corrections) wins. An unmarked
    -- refresh cannot erase any of the previous official mark's details.
    if lower(btrim(coalesce(v_item ->> 'status', ''))) in ('', 'unmarked', 'unknown', 'not marked', 'not_marked', 'pending')
      and lower(btrim(coalesce(v_previous ->> 'status', ''))) not in ('', 'unmarked', 'unknown', 'not marked', 'not_marked', 'pending')
    then
      v_item := v_item || v_previous;
    else
      v_item := v_previous || v_item;
    end if;
    v_items := jsonb_set(v_items, array[v_key], v_item, true);
  end loop;
  select coalesce(jsonb_agg(v_items -> entry.key order by entry.ordinality), '[]'::jsonb)
  into v_result from unnest(v_order) with ordinality as entry(key, ordinality);
  return v_result;
end;
$$;

create or replace function public._millennium_merge_recent_periods(p_existing jsonb, p_incoming jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_item jsonb;
  v_previous jsonb;
  v_key text;
  v_parts text[];
  v_items jsonb := '{}'::jsonb;
  v_order text[] := array[]::text[];
  v_result jsonb;
begin
  for v_item in select value from jsonb_array_elements(
    public._millennium_jsonb_array(p_existing) || public._millennium_jsonb_array(p_incoming)
  ) loop
    if jsonb_typeof(v_item) <> 'object' then continue; end if;
    v_key := lower(btrim(coalesce(v_item ->> 'date', '')));
    if v_key = '' then continue; end if;
    -- Home snapshots use ISO dates; attendance pages can use Australian dates.
    v_parts := regexp_match(v_key, '^([0-9]{1,2})/([0-9]{1,2})/([0-9]{4})$');
    if v_parts is not null then
      v_key := v_parts[3] || '-' || lpad(v_parts[2], 2, '0') || '-' || lpad(v_parts[1], 2, '0');
    end if;
    v_previous := coalesce(v_items -> v_key, '{}'::jsonb);
    if not (v_items ? v_key) then v_order := array_append(v_order, v_key); end if;
    v_item := jsonb_set(v_previous || v_item, '{periods}',
      public._millennium_merge_attendance_periods(v_previous -> 'periods', v_item -> 'periods'), true);
    v_items := jsonb_set(v_items, array[v_key], v_item, true);
  end loop;
  select coalesce(jsonb_agg(v_items -> entry.key order by entry.ordinality), '[]'::jsonb)
  into v_result from unnest(v_order) with ordinality as entry(key, ordinality);
  return v_result;
end;
$$;

create or replace function public._millennium_merge_portal_data(
  p_existing jsonb,
  p_incoming jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_existing jsonb := coalesce(p_existing, '{}'::jsonb);
  v_incoming jsonb := coalesce(p_incoming, '{}'::jsonb);
  v_result jsonb := coalesce(p_existing, '{}'::jsonb) || coalesce(p_incoming, '{}'::jsonb);
  v_timetable jsonb;
  v_attendance jsonb;
begin
  if v_incoming -> 'liveAttendanceOnly' = 'true'::jsonb
    or v_incoming -> 'liveAttendance' = 'true'::jsonb
  then
    v_result := v_existing;
    if jsonb_typeof(v_incoming -> 'todayTimetable') = 'object' then
      v_result := jsonb_set(v_result, '{todayTimetable}', v_incoming -> 'todayTimetable', true);
    end if;
    if jsonb_typeof(v_incoming #> '{attendance,recentPeriods}') = 'array' then
      v_attendance := coalesce(v_existing -> 'attendance', '{}'::jsonb);
      v_attendance := jsonb_set(v_attendance, '{recentPeriods}',
        public._millennium_merge_recent_periods(
          v_existing #> '{attendance,recentPeriods}', v_incoming #> '{attendance,recentPeriods}'
        ), true);
      v_result := jsonb_set(v_result, '{attendance}', v_attendance, true);
    end if;
    return v_result - 'liveAttendanceOnly' - 'liveAttendance';
  end if;
  v_result := v_result - 'liveAttendanceOnly' - 'liveAttendance';
  v_result := jsonb_set(
    v_result,
    '{notices}',
    public._millennium_merge_notices(v_existing -> 'notices', v_incoming -> 'notices'),
    true
  );
  v_result := jsonb_set(
    v_result,
    '{grades}',
    public._millennium_merge_array_by_fields(
      v_existing -> 'grades',
      v_incoming -> 'grades',
      array['subject', 'task', 'date']
    ),
    true
  );
  v_result := jsonb_set(
    v_result,
    '{calendar}',
    public._millennium_merge_array_by_fields(
      v_existing -> 'calendar',
      v_incoming -> 'calendar',
      array['date', 'title', 'type']
    ),
    true
  );
  v_result := jsonb_set(
    v_result,
    '{reports}',
    public._millennium_merge_array_by_fields(
      v_existing -> 'reports',
      v_incoming -> 'reports',
      array['url', 'title', 'calendarYear', 'semester']
    ),
    true
  );
  v_result := jsonb_set(
    v_result,
    '{classes}',
    public._millennium_merge_array_by_fields(
      v_existing -> 'classes',
      v_incoming -> 'classes',
      array['classCode', 'course']
    ),
    true
  );

  if jsonb_typeof(v_existing -> 'timetable') = 'array'
    or jsonb_typeof(v_incoming -> 'timetable') = 'array'
  then
    v_timetable := public._millennium_merge_array_by_fields(
      v_existing -> 'timetable',
      v_incoming -> 'timetable',
      array['day', 'period']
    );
  else
    v_timetable := coalesce(v_existing -> 'timetable', '{}'::jsonb)
      || coalesce(v_incoming -> 'timetable', '{}'::jsonb);
    v_timetable := jsonb_set(
      v_timetable,
      '{weekA}',
      public._millennium_merge_array_by_fields(
        v_existing #> '{timetable,weekA}',
        v_incoming #> '{timetable,weekA}',
        array['day', 'period']
      ),
      true
    );
    v_timetable := jsonb_set(
      v_timetable,
      '{weekB}',
      public._millennium_merge_array_by_fields(
        v_existing #> '{timetable,weekB}',
        v_incoming #> '{timetable,weekB}',
        array['day', 'period']
      ),
      true
    );
  end if;
  v_result := jsonb_set(v_result, '{timetable}', v_timetable, true);

  v_attendance := coalesce(v_existing -> 'attendance', '{}'::jsonb)
    || coalesce(v_incoming -> 'attendance', '{}'::jsonb);
  v_attendance := jsonb_set(
    v_attendance,
    '{yearly}',
    public._millennium_merge_array_by_fields(
      v_existing #> '{attendance,yearly}',
      v_incoming #> '{attendance,yearly}',
      array['year']
    ),
    true
  );
  v_attendance := jsonb_set(
    v_attendance,
    '{subjects}',
    public._millennium_merge_array_by_fields(
      v_existing #> '{attendance,subjects}',
      v_incoming #> '{attendance,subjects}',
      array['classCode', 'course']
    ),
    true
  );
  if jsonb_array_length(public._millennium_jsonb_array(v_incoming #> '{attendance,absences}')) = 0 then
    v_attendance := jsonb_set(
      v_attendance,
      '{absences}',
      public._millennium_jsonb_array(v_existing #> '{attendance,absences}'),
      true
    );
  end if;
  v_attendance := jsonb_set(
    v_attendance,
    '{recentPeriods}',
    public._millennium_merge_recent_periods(
      v_existing #> '{attendance,recentPeriods}',
      v_incoming #> '{attendance,recentPeriods}'
    ),
    true
  );
  if v_existing ? 'timetableReferences' or v_incoming ? 'timetableReferences' then
    v_result := jsonb_set(v_result, '{timetableReferences}',
      public._millennium_merge_array_by_fields(
        v_existing -> 'timetableReferences', v_incoming -> 'timetableReferences', array['date']
      ), true);
  end if;
  v_result := jsonb_set(v_result, '{attendance}', v_attendance, true);
  return v_result;
end;
$$;

create or replace function public.merge_portal_snapshot(
  p_user_id uuid,
  p_millennium_uid text,
  p_name text,
  p_school text,
  p_settings jsonb,
  p_snapshot jsonb,
  p_last_sync timestamptz,
  p_update_credentials boolean,
  p_portal_credentials jsonb,
  p_sync_signature text,
  p_sync_fingerprint jsonb
)
returns table (
  id uuid,
  millennium_uid text,
  name text,
  school text,
  settings jsonb,
  created_at timestamptz,
  last_sync timestamptz,
  changed boolean,
  changed_sections text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_portal_data jsonb;
  v_changed boolean := true;
  v_changed_sections text[] := array[]::text[];
  v_live boolean := coalesce(p_snapshot -> 'liveAttendanceOnly' = 'true'::jsonb, false)
    or coalesce(p_snapshot -> 'liveAttendance' = 'true'::jsonb, false);
begin
  if p_user_id is not null then
    select * into v_user from public.users where users.id = p_user_id for update;
    if v_user.id is null then
      raise exception 'Portal account disappeared during sync' using errcode = '23503';
    end if;
  elsif nullif(p_millennium_uid, '') is not null then
    select * into v_user
    from public.users
    where users.millennium_uid = p_millennium_uid
    for update;
  end if;

  if v_user.id is null then
    insert into public.users (
      millennium_uid,
      name,
      school,
      settings,
      last_sync,
      portal_data,
      portal_credentials,
      portal_credentials_updated_at
    ) values (
      nullif(p_millennium_uid, ''),
      coalesce(p_name, ''),
      coalesce(nullif(p_school, ''), 'rhhs'),
      coalesce(p_settings, '{}'::jsonb),
      case when v_live then null else p_last_sync end,
      public._millennium_merge_portal_data('{}'::jsonb, p_snapshot),
      case when p_update_credentials then p_portal_credentials else null end,
      case when p_update_credentials then now() else null end
    )
    returning * into v_user;
    select coalesce(array_agg(section_name order by section_name), array[]::text[])
    into v_changed_sections
    from unnest(array[
      'account',
      'todayTimetable',
      'timetableReferences',
      'attendance',
      'calendar',
      'classes',
      'grades',
      'notices',
      'reports',
      'timetable'
    ]) as sections(section_name)
    where p_snapshot ? section_name;
  else
    if nullif(v_user.millennium_uid, '') is not null
      and nullif(p_millennium_uid, '') is not null
      and v_user.millennium_uid <> p_millennium_uid
    then
      raise exception 'Portal account identity changed during sync' using errcode = '23514';
    end if;

    v_portal_data := public._millennium_merge_portal_data(v_user.portal_data, p_snapshot);
    select coalesce(array_agg(section_name order by section_name), array[]::text[])
    into v_changed_sections
    from unnest(array[
      'account',
      'todayTimetable',
      'timetableReferences',
      'attendance',
      'calendar',
      'classes',
      'grades',
      'notices',
      'reports',
      'timetable'
    ]) as sections(section_name)
    where (v_portal_data -> section_name)
      is distinct from (v_user.portal_data -> section_name);
    v_changed := cardinality(v_changed_sections) > 0;

    update public.users
    set
      millennium_uid = coalesce(nullif(p_millennium_uid, ''), users.millennium_uid),
      name = coalesce(nullif(p_name, ''), users.name),
      school = coalesce(nullif(p_school, ''), users.school),
      last_sync = case when v_live then users.last_sync else p_last_sync end,
      portal_data = case when v_changed then v_portal_data else users.portal_data end,
      portal_credentials = case
        when p_update_credentials then p_portal_credentials
        else users.portal_credentials
      end,
      portal_credentials_updated_at = case
        when p_update_credentials then now()
        else users.portal_credentials_updated_at
      end
    where users.id = v_user.id
    returning * into v_user;
  end if;

  if nullif(p_sync_signature, '') is not null and p_sync_fingerprint is not null then
    insert into public.portal_sync_fingerprints (
      user_id,
      signature,
      fingerprint,
      updated_at
    ) values (
      v_user.id,
      p_sync_signature,
      p_sync_fingerprint,
      now()
    )
    on conflict (user_id, signature) do update set
      fingerprint = excluded.fingerprint,
      updated_at = excluded.updated_at;

    delete from public.portal_sync_fingerprints as stale
    where stale.user_id = v_user.id
      and stale.signature not in (
        select recent.signature
        from public.portal_sync_fingerprints as recent
        where recent.user_id = v_user.id
        order by recent.updated_at desc
        limit 16
      );
  end if;

  return query select
    v_user.id,
    v_user.millennium_uid,
    v_user.name,
    v_user.school,
    v_user.settings,
    v_user.created_at,
    v_user.last_sync,
    v_changed,
    v_changed_sections;
end;
$$;

revoke all on function public._millennium_merge_attendance_periods(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public._millennium_merge_recent_periods(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public._millennium_merge_portal_data(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.merge_portal_snapshot(uuid, text, text, text, jsonb, jsonb, timestamptz, boolean, jsonb, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.merge_portal_snapshot(uuid, text, text, text, jsonb, jsonb, timestamptz, boolean, jsonb, text, jsonb)
  to service_role;
