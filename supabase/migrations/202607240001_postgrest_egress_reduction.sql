-- Keep large portal snapshots inside Postgres during recurring sync.
-- Also remove inline image data that made individual notice rows several MB.

create table if not exists public.portal_sync_fingerprints (
  user_id uuid not null references public.users(id) on delete cascade,
  signature text not null check (char_length(signature) between 1 and 64),
  fingerprint jsonb not null check (jsonb_typeof(fingerprint) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (user_id, signature)
);

create index if not exists portal_sync_fingerprints_updated_at_idx
  on public.portal_sync_fingerprints (updated_at);

alter table public.portal_sync_fingerprints enable row level security;
revoke all on table public.portal_sync_fingerprints from public, anon, authenticated;
grant all on table public.portal_sync_fingerprints to service_role;

create or replace function public._millennium_jsonb_array(p_value jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case when jsonb_typeof(p_value) = 'array' then p_value else '[]'::jsonb end;
$$;

create or replace function public._millennium_merge_array_by_fields(
  p_existing jsonb,
  p_incoming jsonb,
  p_fields text[]
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_item jsonb;
  v_field text;
  v_raw_key text;
  v_key text;
  v_items jsonb := '{}'::jsonb;
  v_order text[] := array[]::text[];
  v_result jsonb;
begin
  for v_item in
    select value
    from jsonb_array_elements(
      public._millennium_jsonb_array(p_existing)
      || public._millennium_jsonb_array(p_incoming)
    )
  loop
    if jsonb_typeof(v_item) <> 'object' then
      continue;
    end if;

    v_raw_key := '';
    foreach v_field in array p_fields loop
      v_raw_key := v_raw_key || chr(31) || lower(btrim(coalesce(v_item ->> v_field, '')));
    end loop;
    if replace(v_raw_key, chr(31), '') = '' then
      continue;
    end if;

    v_key := md5(v_raw_key);
    if not (v_items ? v_key) then
      v_order := array_append(v_order, v_key);
    end if;
    v_items := jsonb_set(
      v_items,
      array[v_key],
      coalesce(v_items -> v_key, '{}'::jsonb) || v_item,
      true
    );
  end loop;

  select coalesce(jsonb_agg(v_items -> entry.key order by entry.ordinality), '[]'::jsonb)
  into v_result
  from unnest(v_order) with ordinality as entry(key, ordinality);
  return v_result;
end;
$$;

create or replace function public._millennium_compact_notice_html(
  p_html text,
  p_plain_text text
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_html text;
begin
  if p_html is null or btrim(p_html) = '' then
    return null;
  end if;

  v_html := regexp_replace(
    p_html,
    '<img[^>]*src[[:space:]]*=[[:space:]]*["'']?data:[^>]*>',
    '',
    'gi'
  );
  v_html := regexp_replace(v_html, 'data:[^"''[:space:]>]+', '', 'gi');
  v_html := btrim(v_html);
  if v_html = '' or v_html = coalesce(p_plain_text, '') then
    return null;
  end if;
  return left(v_html, 65536);
end;
$$;

create or replace function public._millennium_merge_notices(
  p_existing jsonb,
  p_incoming jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_item jsonb;
  v_previous jsonb;
  v_content text;
  v_html text;
  v_raw_key text;
  v_key text;
  v_dates jsonb;
  v_items jsonb := '{}'::jsonb;
  v_order text[] := array[]::text[];
  v_result jsonb;
begin
  for v_item in
    select value
    from jsonb_array_elements(
      public._millennium_jsonb_array(p_existing)
      || public._millennium_jsonb_array(p_incoming)
    )
  loop
    if jsonb_typeof(v_item) <> 'object' then
      continue;
    end if;

    v_content := coalesce(v_item ->> 'content', '');
    v_html := public._millennium_compact_notice_html(v_item ->> 'contentHtml', v_content);
    if v_html is null then
      v_item := v_item - 'contentHtml';
    else
      v_item := jsonb_set(v_item, '{contentHtml}', to_jsonb(v_html), true);
    end if;

    v_raw_key := lower(btrim(coalesce(v_item ->> 'title', '')))
      || chr(31)
      || lower(btrim(coalesce(nullif(v_content, ''), v_item ->> 'preview', '')));
    if replace(v_raw_key, chr(31), '') = '' then
      continue;
    end if;

    v_key := md5(v_raw_key);
    v_previous := coalesce(v_items -> v_key, '{}'::jsonb);
    select coalesce(jsonb_agg(date_value order by date_value), '[]'::jsonb)
    into v_dates
    from (
      select distinct date_value
      from jsonb_array_elements_text(
        public._millennium_jsonb_array(v_previous -> 'dates')
        || public._millennium_jsonb_array(v_item -> 'dates')
        || case
          when nullif(v_previous ->> 'date', '') is null then '[]'::jsonb
          else jsonb_build_array(v_previous ->> 'date')
        end
        || case
          when nullif(v_item ->> 'date', '') is null then '[]'::jsonb
          else jsonb_build_array(v_item ->> 'date')
        end
      ) as dates(date_value)
      where date_value <> ''
    ) as unique_dates;

    v_item := v_previous || v_item;
    if jsonb_array_length(v_dates) > 0 then
      v_item := jsonb_set(v_item, '{dates}', v_dates, true);
      v_item := jsonb_set(
        v_item,
        '{date}',
        to_jsonb(v_dates ->> (jsonb_array_length(v_dates) - 1)),
        true
      );
    end if;

    if not (v_items ? v_key) then
      v_order := array_append(v_order, v_key);
    end if;
    v_items := jsonb_set(v_items, array[v_key], v_item, true);
  end loop;

  select coalesce(jsonb_agg(v_items -> entry.key order by entry.ordinality), '[]'::jsonb)
  into v_result
  from unnest(v_order) with ordinality as entry(key, ordinality);
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
      array['day', 'period', 'classCode', 'course', 'subject']
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
        array['day', 'period', 'classCode', 'course', 'subject']
      ),
      true
    );
    v_timetable := jsonb_set(
      v_timetable,
      '{weekB}',
      public._millennium_merge_array_by_fields(
        v_existing #> '{timetable,weekB}',
        v_incoming #> '{timetable,weekB}',
        array['day', 'period', 'classCode', 'course', 'subject']
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
  if jsonb_array_length(public._millennium_jsonb_array(v_incoming #> '{attendance,recentPeriods}')) = 0 then
    v_attendance := jsonb_set(
      v_attendance,
      '{recentPeriods}',
      public._millennium_jsonb_array(v_existing #> '{attendance,recentPeriods}'),
      true
    );
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
      p_last_sync,
      public._millennium_merge_portal_data('{}'::jsonb, p_snapshot),
      case when p_update_credentials then p_portal_credentials else null end,
      case when p_update_credentials then now() else null end
    )
    returning * into v_user;
    select coalesce(array_agg(section_name order by section_name), array[]::text[])
    into v_changed_sections
    from unnest(array[
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
      last_sync = p_last_sync,
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

create or replace function public.get_assistant_portal_snapshot(p_user_id uuid)
returns table (
  name text,
  school text,
  portal_data jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    users.name,
    users.school,
    case
      when jsonb_typeof(users.portal_data -> 'notices') = 'array' then
        jsonb_set(
          users.portal_data,
          '{notices}',
          coalesce((
            select jsonb_agg(
              (notice - 'contentHtml')
              || jsonb_build_object(
                'content', left(coalesce(notice ->> 'content', ''), 4000),
                'preview', left(coalesce(notice ->> 'preview', ''), 1000)
              )
            )
            from jsonb_array_elements(users.portal_data -> 'notices') as notices(notice)
          ), '[]'::jsonb),
          true
        )
      else users.portal_data
    end
  from public.users
  where users.id = p_user_id;
$$;

-- Compact existing rows once. Future writes stay compact through merge RPC.
update public.users
set portal_data = jsonb_set(
  portal_data,
  '{notices}',
  public._millennium_merge_notices('[]'::jsonb, portal_data -> 'notices'),
  true
)
where jsonb_typeof(portal_data -> 'notices') = 'array';

revoke all on function public._millennium_jsonb_array(jsonb) from public, anon, authenticated;
revoke all on function public._millennium_merge_array_by_fields(jsonb, jsonb, text[]) from public, anon, authenticated;
revoke all on function public._millennium_compact_notice_html(text, text) from public, anon, authenticated;
revoke all on function public._millennium_merge_notices(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public._millennium_merge_portal_data(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.merge_portal_snapshot(uuid, text, text, text, jsonb, jsonb, timestamptz, boolean, jsonb, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.get_assistant_portal_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.merge_portal_snapshot(uuid, text, text, text, jsonb, jsonb, timestamptz, boolean, jsonb, text, jsonb)
  to service_role;
grant execute on function public.get_assistant_portal_snapshot(uuid) to service_role;
