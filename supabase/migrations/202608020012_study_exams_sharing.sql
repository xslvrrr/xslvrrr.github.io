-- Exam plans and versioned deck sharing. Shared content and personal scheduling stay separate:
-- a subscriber gets their own cards and their own schedule, and an update never rewrites it.

create table if not exists public.study_exam_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  exam_date date not null,
  deck_ids uuid[] not null default '{}'::uuid[],
  daily_minutes integer not null default 20,
  target_retention numeric(5,4) not null default 0.9000,
  status text not null default 'active',
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_exam_plans_title_check check (char_length(btrim(title)) between 1 and 120),
  constraint study_exam_plans_minutes_check check (daily_minutes between 1 and 1440),
  constraint study_exam_plans_retention_check check (target_retention between 0.7000 and 0.9900),
  constraint study_exam_plans_status_check check (status in ('active', 'completed', 'archived')),
  constraint study_exam_plans_decks_check check (cardinality(deck_ids) <= 60),
  constraint study_exam_plans_revision_check check (revision >= 1)
);

create unique index if not exists study_exam_plans_id_user_unique
  on public.study_exam_plans (id, user_id);
create index if not exists study_exam_plans_user_date_idx
  on public.study_exam_plans (user_id, exam_date)
  where status = 'active';

create table if not exists public.study_deck_publications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  deck_id uuid,
  title text not null,
  description text not null default '',
  share_code text not null,
  visibility text not null default 'link',
  current_version integer not null default 1,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_deck_publications_title_check check (char_length(btrim(title)) between 1 and 120),
  constraint study_deck_publications_description_check check (char_length(description) <= 500),
  constraint study_deck_publications_code_check check (char_length(share_code) between 8 and 64),
  constraint study_deck_publications_visibility_check check (visibility in ('link', 'private')),
  constraint study_deck_publications_version_check check (current_version >= 1)
);

create unique index if not exists study_deck_publications_code_unique
  on public.study_deck_publications (share_code);
create index if not exists study_deck_publications_owner_idx
  on public.study_deck_publications (owner_id, updated_at desc, id);

alter table public.study_deck_publications
  drop constraint if exists study_deck_publications_deck_owner_fkey;
alter table public.study_deck_publications
  add constraint study_deck_publications_deck_owner_fkey
  foreign key (deck_id, owner_id)
  references public.study_decks(id, user_id)
  on delete set null (deck_id);

-- Each version is an immutable content snapshot. Republishing adds a version; it never edits one.
create table if not exists public.study_publication_versions (
  publication_id uuid not null references public.study_deck_publications(id) on delete cascade,
  version integer not null,
  notes jsonb not null,
  note_count integer not null default 0,
  changelog text not null default '',
  created_at timestamptz not null default now(),
  primary key (publication_id, version),
  constraint study_publication_versions_notes_check check (jsonb_typeof(notes) = 'array'),
  constraint study_publication_versions_count_check check (note_count between 0 and 500),
  constraint study_publication_versions_changelog_check check (char_length(changelog) <= 2000)
);

create table if not exists public.study_deck_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  publication_id uuid not null references public.study_deck_publications(id) on delete cascade,
  deck_id uuid,
  subscribed_version integer not null default 1,
  -- Maps published note keys to this subscriber's own note IDs, so updates can tell new from known.
  note_map jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_deck_subscriptions_version_check check (subscribed_version >= 1),
  constraint study_deck_subscriptions_map_check check (jsonb_typeof(note_map) = 'object')
);

create unique index if not exists study_deck_subscriptions_user_publication_unique
  on public.study_deck_subscriptions (user_id, publication_id);

alter table public.study_deck_subscriptions
  drop constraint if exists study_deck_subscriptions_deck_owner_fkey;
alter table public.study_deck_subscriptions
  add constraint study_deck_subscriptions_deck_owner_fkey
  foreign key (deck_id, user_id)
  references public.study_decks(id, user_id)
  on delete set null (deck_id);

alter table public.study_exam_plans enable row level security;
alter table public.study_deck_publications enable row level security;
alter table public.study_publication_versions enable row level security;
alter table public.study_deck_subscriptions enable row level security;

revoke all on table public.study_exam_plans from public, anon, authenticated;
revoke all on table public.study_deck_publications from public, anon, authenticated;
revoke all on table public.study_publication_versions from public, anon, authenticated;
revoke all on table public.study_deck_subscriptions from public, anon, authenticated;

grant select, insert, update, delete on table public.study_exam_plans to service_role;
grant select, insert, update, delete on table public.study_deck_publications to service_role;
grant select, insert, update, delete on table public.study_publication_versions to service_role;
grant select, insert, update, delete on table public.study_deck_subscriptions to service_role;

create or replace function public.save_study_exam_plan_v1(
  p_user_id uuid,
  p_plan_id uuid,
  p_title text,
  p_exam_date date,
  p_deck_ids uuid[],
  p_daily_minutes integer,
  p_target_retention numeric,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing public.study_exam_plans%rowtype;
  v_count integer;
begin
  if p_user_id is null or p_plan_id is null or p_exam_date is null then
    raise exception using errcode = '22023', message = 'Study exam plan identity is required';
  end if;

  -- Every named set must belong to this account.
  if p_deck_ids is not null and cardinality(p_deck_ids) > 0 then
    select count(*)::integer into v_count
    from public.study_decks
    where user_id = p_user_id and id = any(p_deck_ids) and deleted_at is null;
    if v_count <> cardinality(p_deck_ids) then
      return jsonb_build_object('status', 'deck-not-found');
    end if;
  end if;

  select * into v_existing
  from public.study_exam_plans
  where id = p_plan_id and user_id = p_user_id
  for update;

  if p_expected_revision is null then
    if found then
      return jsonb_build_object('status', 'duplicate', 'planId', p_plan_id);
    end if;

    select count(*)::integer into v_count
    from public.study_exam_plans
    where user_id = p_user_id and status = 'active';
    if v_count >= 20 then
      return jsonb_build_object('status', 'limit-reached');
    end if;

    insert into public.study_exam_plans (
      id, user_id, title, exam_date, deck_ids, daily_minutes, target_retention
    ) values (
      p_plan_id, p_user_id, p_title, p_exam_date, coalesce(p_deck_ids, '{}'::uuid[]),
      coalesce(p_daily_minutes, 20), coalesce(p_target_retention, 0.9000)
    );
  else
    if not found then
      return jsonb_build_object('status', 'not-found');
    end if;
    if v_existing.revision <> p_expected_revision then
      return jsonb_build_object('status', 'conflict');
    end if;

    update public.study_exam_plans
    set title = p_title,
        exam_date = p_exam_date,
        deck_ids = coalesce(p_deck_ids, '{}'::uuid[]),
        daily_minutes = coalesce(p_daily_minutes, daily_minutes),
        target_retention = coalesce(p_target_retention, target_retention),
        revision = revision + 1,
        updated_at = now()
    where id = p_plan_id and user_id = p_user_id and revision = p_expected_revision;
  end if;

  return (
    select jsonb_build_object(
      'status', 'accepted',
      'plan', jsonb_build_object(
        'id', plan.id,
        'title', plan.title,
        'examDate', plan.exam_date,
        'deckIds', to_jsonb(plan.deck_ids),
        'dailyMinutes', plan.daily_minutes,
        'targetRetention', plan.target_retention,
        'status', plan.status,
        'revision', plan.revision,
        'updatedAt', plan.updated_at
      )
    )
    from public.study_exam_plans plan
    where plan.id = p_plan_id and plan.user_id = p_user_id
  );
end;
$$;

revoke all on function public.save_study_exam_plan_v1(uuid, uuid, text, date, uuid[], integer, numeric, bigint)
  from public, anon, authenticated;
grant execute on function public.save_study_exam_plan_v1(uuid, uuid, text, date, uuid[], integer, numeric, bigint)
  to service_role;

-- Coverage for an exam plan: how many cards it covers, how many are unseen, and how many are due.
create or replace function public.get_study_exam_coverage_v1(p_user_id uuid, p_deck_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := now();
  v_result jsonb;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'Study user ID is required';
  end if;

  select jsonb_build_object(
    'cardCount', count(*)::integer,
    'newCount', count(*) filter (where card.card_state = 'new')::integer,
    'dueCount', count(*) filter (
      where card.due_at <= v_now and not card.is_suspended and not card.is_buried
    )::integer,
    'weakCount', count(*) filter (where card.lapses >= 3)::integer,
    'averageStability', round(coalesce(avg(card.stability), 0)::numeric, 2)
  )
  into v_result
  from public.study_cards card
  where card.user_id = p_user_id
    and card.deleted_at is null
    and not card.is_suspended
    and (p_deck_ids is null or cardinality(p_deck_ids) = 0 or card.deck_id = any(p_deck_ids));

  return coalesce(v_result, jsonb_build_object(
    'cardCount', 0, 'newCount', 0, 'dueCount', 0, 'weakCount', 0, 'averageStability', 0
  ));
end;
$$;

revoke all on function public.get_study_exam_coverage_v1(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.get_study_exam_coverage_v1(uuid, uuid[])
  to service_role;

-- Publishes an immutable content snapshot of a deck. Personal scheduling is never included.
create or replace function public.publish_study_deck_v1(
  p_owner_id uuid,
  p_publication_id uuid,
  p_deck_id uuid,
  p_share_code text,
  p_changelog text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_publication public.study_deck_publications%rowtype;
  v_deck public.study_decks%rowtype;
  v_notes jsonb;
  v_count integer;
  v_version integer;
begin
  if p_owner_id is null or p_publication_id is null or p_deck_id is null then
    raise exception using errcode = '22023', message = 'Study publication identity is required';
  end if;

  select * into v_deck
  from public.study_decks
  where id = p_deck_id and user_id = p_owner_id and deleted_at is null;
  if not found then
    return jsonb_build_object('status', 'deck-not-found');
  end if;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'key', note.id,
      'noteType', note.note_type,
      'fields', note.fields,
      'tags', to_jsonb(note.tags)
    ) order by note.created_at, note.id), '[]'::jsonb),
    count(*)::integer
  into v_notes, v_count
  from public.study_notes note
  where note.user_id = p_owner_id
    and note.deck_id = p_deck_id
    and note.deleted_at is null
    -- Image cards depend on private media, which sharing does not copy.
    and note.note_type <> 'image-occlusion';

  if v_count = 0 then
    return jsonb_build_object('status', 'empty');
  end if;
  if v_count > 500 then
    return jsonb_build_object('status', 'too-large');
  end if;

  select * into v_publication
  from public.study_deck_publications
  where id = p_publication_id and owner_id = p_owner_id
  for update;

  if not found then
    insert into public.study_deck_publications (
      id, owner_id, deck_id, title, description, share_code, current_version
    ) values (
      p_publication_id, p_owner_id, p_deck_id, v_deck.title, v_deck.description, p_share_code, 1
    );
    v_version := 1;
  else
    if v_publication.revoked_at is not null then
      return jsonb_build_object('status', 'revoked');
    end if;
    v_version := v_publication.current_version + 1;
    update public.study_deck_publications
    set title = v_deck.title,
        description = v_deck.description,
        current_version = v_version,
        updated_at = now()
    where id = p_publication_id and owner_id = p_owner_id;
  end if;

  insert into public.study_publication_versions (publication_id, version, notes, note_count, changelog)
  values (p_publication_id, v_version, v_notes, v_count, coalesce(p_changelog, ''))
  on conflict (publication_id, version) do nothing;

  return jsonb_build_object(
    'status', 'accepted',
    'publicationId', p_publication_id,
    'version', v_version,
    'noteCount', v_count,
    'shareCode', coalesce(v_publication.share_code, p_share_code)
  );
end;
$$;

revoke all on function public.publish_study_deck_v1(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.publish_study_deck_v1(uuid, uuid, uuid, text, text)
  to service_role;

create or replace function public.revoke_study_publication_v1(p_owner_id uuid, p_publication_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.study_deck_publications
  set revoked_at = now(), updated_at = now()
  where id = p_publication_id and owner_id = p_owner_id and revoked_at is null;

  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;
  -- Revoking stops new subscribers. Copies subscribers already hold remain theirs.
  return jsonb_build_object('status', 'accepted');
end;
$$;

revoke all on function public.revoke_study_publication_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.revoke_study_publication_v1(uuid, uuid)
  to service_role;

/*
 * Copies a published version into the subscriber's own deck. Notes the subscriber already has from
 * this publication are left alone, so an update adds new material without touching any schedule.
 */
create or replace function public.apply_study_subscription_v1(
  p_user_id uuid,
  p_share_code text,
  p_deck_id uuid,
  p_notes jsonb,
  p_initial_state jsonb,
  p_scheduler_name text,
  p_scheduler_version text,
  p_parameters_version text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_publication public.study_deck_publications%rowtype;
  v_subscription public.study_deck_subscriptions%rowtype;
  v_timestamp timestamptz := now();
  v_cursor bigint;
  v_card_count integer;
  v_added integer := 0;
  v_note_ids uuid[];
  v_map jsonb;
begin
  if p_user_id is null or p_deck_id is null or p_share_code is null then
    raise exception using errcode = '22023', message = 'Study subscription identity is required';
  end if;

  select * into v_publication
  from public.study_deck_publications
  where share_code = p_share_code and revoked_at is null;
  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 20260802));

  perform 1 from public.study_decks
  where id = p_deck_id and user_id = p_user_id and deleted_at is null
  for update;
  if not found then
    return jsonb_build_object('status', 'deck-not-found');
  end if;

  select count(*)::integer into v_card_count
  from public.study_cards
  where user_id = p_user_id and deck_id = p_deck_id and deleted_at is null;
  if v_card_count + jsonb_array_length(coalesce(p_notes, '[]'::jsonb)) > 500 then
    return jsonb_build_object('status', 'limit-reached');
  end if;

  v_cursor := public.study_next_cursor_v1(p_user_id);

  insert into public.study_notes (
    id, user_id, deck_id, note_type, schema_version, fields, tags, source_kind,
    revision, created_at, updated_at
  )
  select
    (note ->> 'id')::uuid,
    p_user_id,
    p_deck_id,
    coalesce(note ->> 'noteType', 'basic'),
    1,
    note -> 'fields',
    coalesce(
      (select array_agg(value::text) from jsonb_array_elements_text(note -> 'tags') as tags(value)),
      '{}'::text[]
    ),
    'subscription',
    1,
    v_timestamp,
    v_timestamp
  from jsonb_array_elements(coalesce(p_notes, '[]'::jsonb)) as note
  on conflict (id) do nothing;
  get diagnostics v_added = row_count;

  insert into public.study_cards (
    id, user_id, deck_id, note_id, template_key, ordinal, card_state,
    due_at, stability, difficulty, elapsed_days, scheduled_days, learning_steps,
    repetitions, lapses, scheduler_name, scheduler_version, parameters_version,
    schedule_revision, created_at, updated_at
  )
  select
    (card ->> 'id')::uuid,
    p_user_id,
    p_deck_id,
    (note ->> 'id')::uuid,
    card ->> 'templateKey',
    coalesce((card ->> 'ordinal')::integer, 0),
    coalesce(p_initial_state ->> 'state', 'new'),
    coalesce((p_initial_state ->> 'dueAt')::timestamptz, v_timestamp),
    coalesce((p_initial_state ->> 'stability')::double precision, 0),
    coalesce((p_initial_state ->> 'difficulty')::double precision, 0),
    coalesce((p_initial_state ->> 'elapsedDays')::double precision, 0),
    coalesce((p_initial_state ->> 'scheduledDays')::double precision, 0),
    coalesce((p_initial_state ->> 'learningSteps')::integer, 0),
    0,
    0,
    coalesce(p_scheduler_name, 'fsrs'),
    coalesce(p_scheduler_version, '1'),
    coalesce(p_parameters_version, 'default'),
    0,
    v_timestamp,
    v_timestamp
  from jsonb_array_elements(coalesce(p_notes, '[]'::jsonb)) as note,
       jsonb_array_elements(coalesce(note -> 'cards', '[]'::jsonb)) as card
  on conflict (id) do nothing;

  select
    coalesce(array_agg((note ->> 'id')::uuid), '{}'::uuid[]),
    coalesce(jsonb_object_agg(note ->> 'key', note ->> 'id'), '{}'::jsonb)
  into v_note_ids, v_map
  from jsonb_array_elements(coalesce(p_notes, '[]'::jsonb)) as note;

  select * into v_subscription
  from public.study_deck_subscriptions
  where user_id = p_user_id and publication_id = v_publication.id
  for update;

  if found then
    update public.study_deck_subscriptions
    set deck_id = p_deck_id,
        subscribed_version = v_publication.current_version,
        note_map = v_subscription.note_map || v_map,
        updated_at = v_timestamp
    where id = v_subscription.id;
  else
    insert into public.study_deck_subscriptions (
      user_id, publication_id, deck_id, subscribed_version, note_map
    ) values (
      p_user_id, v_publication.id, p_deck_id, v_publication.current_version, v_map
    );
  end if;

  insert into public.study_sync_changes (
    user_id, cursor, ordinal, entity_kind, entity_id, operation, revision, changed_at
  )
  select p_user_id, v_cursor, 0, 'deck', deck.id, 'upsert', deck.revision, v_timestamp
  from public.study_decks deck
  where deck.id = p_deck_id and deck.user_id = p_user_id;

  insert into public.study_sync_changes (
    user_id, cursor, ordinal, entity_kind, entity_id, operation, revision, changed_at
  )
  select
    p_user_id,
    v_cursor,
    (row_number() over (order by entity_kind, entity_id))::integer,
    entity_kind,
    entity_id,
    'upsert',
    revision,
    v_timestamp
  from (
    select 'note'::text as entity_kind, note.id as entity_id, note.revision as revision
    from public.study_notes note
    where note.user_id = p_user_id and note.id = any(v_note_ids)
    union all
    select 'card'::text, card.id, card.schedule_revision
    from public.study_cards card
    where card.user_id = p_user_id and card.note_id = any(v_note_ids)
  ) changed;

  return jsonb_build_object(
    'status', 'accepted',
    'syncCursor', v_cursor,
    'addedNotes', v_added,
    'version', v_publication.current_version,
    'deck', public.study_deck_summary_v1(p_user_id, p_deck_id)
  );
end;
$$;

revoke all on function public.apply_study_subscription_v1(
  uuid, text, uuid, jsonb, jsonb, text, text, text
) from public, anon, authenticated;
grant execute on function public.apply_study_subscription_v1(
  uuid, text, uuid, jsonb, jsonb, text, text, text
) to service_role;
