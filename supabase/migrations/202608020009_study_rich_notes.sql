-- Rich Study note types. Replaces the basic-only note upsert with one that accepts every
-- authorable type, and adds the card browser's search and bulk operations.
-- Card identity stays keyed by template, so changing a note's type keeps matching cards scheduled.

create or replace function public.upsert_study_note_v1(
  p_user_id uuid,
  p_note_id uuid,
  p_deck_id uuid,
  p_note_type text,
  p_fields jsonb,
  p_tags text[],
  p_expected_revision bigint,
  p_templates jsonb,
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
  v_note public.study_notes%rowtype;
  v_timestamp timestamptz := now();
  v_cursor bigint;
  v_card_count integer;
  v_new_templates integer;
  v_ordinal integer := 1;
begin
  if p_user_id is null or p_note_id is null or p_deck_id is null then
    raise exception using errcode = '22023', message = 'Study note identity is required';
  end if;
  if p_note_type is null or p_note_type not in (
    'basic', 'basic-reversed', 'typed', 'cloze', 'sequence', 'compare-contrast', 'application'
  ) then
    raise exception using errcode = '22023', message = 'Unsupported Study note type';
  end if;
  if jsonb_typeof(p_fields) is distinct from 'object'
    or jsonb_typeof(p_templates) is distinct from 'array'
    or jsonb_typeof(p_initial_state) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Invalid Study note payload';
  end if;
  if jsonb_array_length(p_templates) < 1 or jsonb_array_length(p_templates) > 8 then
    raise exception using errcode = '22023', message = 'Invalid Study card template list';
  end if;
  if p_expected_revision is not null and p_expected_revision < 1 then
    raise exception using errcode = '22023', message = 'Invalid Study note revision';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 20260802));

  perform 1
  from public.study_decks
  where id = p_deck_id and user_id = p_user_id and deleted_at is null
  for update;

  if not found then
    return jsonb_build_object('status', 'deck-not-found');
  end if;

  select * into v_note
  from public.study_notes
  where id = p_note_id and user_id = p_user_id
  for update;

  if p_expected_revision is null then
    if found then
      if v_note.deleted_at is not null then
        return jsonb_build_object('status', 'conflict');
      end if;
      return jsonb_build_object('status', 'duplicate', 'noteId', p_note_id);
    end if;

    select count(*)::integer into v_card_count
    from public.study_cards
    where user_id = p_user_id and deck_id = p_deck_id and deleted_at is null;

    if v_card_count + jsonb_array_length(p_templates) > 500 then
      return jsonb_build_object('status', 'limit-reached');
    end if;

    v_cursor := public.study_next_cursor_v1(p_user_id);

    insert into public.study_notes (
      id, user_id, deck_id, note_type, schema_version, fields, tags, source_kind,
      revision, created_at, updated_at
    ) values (
      p_note_id, p_user_id, p_deck_id, p_note_type, 1, p_fields,
      coalesce(p_tags, '{}'::text[]), 'manual', 1, v_timestamp, v_timestamp
    );
  else
    if not found or v_note.deleted_at is not null then
      return jsonb_build_object('status', 'not-found');
    end if;
    if v_note.deck_id <> p_deck_id then
      return jsonb_build_object('status', 'conflict');
    end if;
    if v_note.revision <> p_expected_revision then
      return jsonb_build_object('status', 'conflict', 'revision', v_note.revision);
    end if;

    v_cursor := public.study_next_cursor_v1(p_user_id);

    update public.study_notes
    set note_type = p_note_type,
        fields = p_fields,
        tags = coalesce(p_tags, '{}'::text[]),
        revision = revision + 1,
        updated_at = v_timestamp
    where id = p_note_id and user_id = p_user_id and revision = p_expected_revision;

    if not found then
      return jsonb_build_object('status', 'conflict');
    end if;
  end if;

  -- Retire cards whose template no longer exists on this note.
  update public.study_cards
  set deleted_at = v_timestamp, updated_at = v_timestamp
  where user_id = p_user_id
    and note_id = p_note_id
    and deleted_at is null
    and template_key not in (
      select template ->> 'templateKey'
      from jsonb_array_elements(p_templates) as template
    );

  -- Create cards for templates that do not exist yet.
  insert into public.study_cards (
    id, user_id, deck_id, note_id, template_key, ordinal,
    card_state, due_at, stability, difficulty, elapsed_days, scheduled_days,
    learning_steps, repetitions, lapses, last_reviewed_at,
    scheduler_name, scheduler_version, parameters_version, schedule_revision,
    created_at, updated_at
  )
  select
    (template ->> 'cardId')::uuid,
    p_user_id,
    p_deck_id,
    p_note_id,
    template ->> 'templateKey',
    coalesce((template ->> 'ordinal')::integer, 0),
    p_initial_state ->> 'state',
    (p_initial_state ->> 'dueAt')::timestamptz,
    (p_initial_state ->> 'stability')::double precision,
    (p_initial_state ->> 'difficulty')::double precision,
    (p_initial_state ->> 'elapsedDays')::double precision,
    (p_initial_state ->> 'scheduledDays')::double precision,
    (p_initial_state ->> 'learningSteps')::integer,
    (p_initial_state ->> 'repetitions')::integer,
    (p_initial_state ->> 'lapses')::integer,
    (p_initial_state ->> 'lastReviewedAt')::timestamptz,
    p_scheduler_name,
    p_scheduler_version,
    p_parameters_version,
    0,
    v_timestamp,
    v_timestamp
  from jsonb_array_elements(p_templates) as template
  where not exists (
    select 1
    from public.study_cards existing
    where existing.user_id = p_user_id
      and existing.note_id = p_note_id
      and existing.template_key = template ->> 'templateKey'
      and existing.deleted_at is null
  );

  get diagnostics v_new_templates = row_count;

  update public.study_decks
  set updated_at = v_timestamp
  where id = p_deck_id and user_id = p_user_id;

  insert into public.study_sync_changes (
    user_id, cursor, ordinal, entity_kind, entity_id, operation, revision, changed_at
  )
  select p_user_id, v_cursor, 0, 'note', p_note_id, 'upsert', note.revision, v_timestamp
  from public.study_notes note
  where note.id = p_note_id and note.user_id = p_user_id;

  insert into public.study_sync_changes (
    user_id, cursor, ordinal, entity_kind, entity_id, operation, revision, changed_at
  )
  select
    p_user_id,
    v_cursor,
    v_ordinal + (row_number() over (order by card.id))::integer - 1,
    'card',
    card.id,
    case when card.deleted_at is null then 'upsert' else 'delete' end,
    card.schedule_revision,
    v_timestamp
  from public.study_cards card
  where card.user_id = p_user_id
    and card.note_id = p_note_id
    and card.updated_at = v_timestamp;

  return jsonb_build_object(
    'status', 'accepted',
    'syncCursor', v_cursor,
    'noteId', p_note_id,
    'createdCards', v_new_templates,
    'deck', public.study_deck_summary_v1(p_user_id, p_deck_id)
  );
end;
$$;

revoke all on function public.upsert_study_note_v1(
  uuid, uuid, uuid, text, jsonb, text[], bigint, jsonb, jsonb, text, text, text
) from public, anon, authenticated;
grant execute on function public.upsert_study_note_v1(
  uuid, uuid, uuid, text, jsonb, text[], bigint, jsonb, jsonb, text, text, text
) to service_role;

-- Card browser search. Filters are structured values, never SQL fragments from the client.
create or replace function public.search_study_cards_v1(
  p_user_id uuid,
  p_text text,
  p_deck_ids uuid[],
  p_tags text[],
  p_note_types text[],
  p_states text[],
  p_due_before timestamptz,
  p_due_after timestamptz,
  p_minimum_lapses integer,
  p_sort text,
  p_limit integer,
  p_offset integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_items jsonb;
  v_total integer;
  v_query tsquery;
begin
  if p_user_id is null or p_limit is null or p_limit < 1 or p_limit > 200
    or p_offset is null or p_offset < 0 or p_offset > 10000 then
    raise exception using errcode = '22023', message = 'Invalid Study browser request';
  end if;
  if p_sort is not null and p_sort not in ('due', 'created', 'lapses', 'difficulty', 'stability') then
    raise exception using errcode = '22023', message = 'Invalid Study browser sort';
  end if;

  if p_text is not null and btrim(p_text) <> '' then
    v_query := plainto_tsquery('simple', p_text);
  end if;

  with matched as (
    select
      card.id as card_id,
      card.deck_id,
      card.note_id,
      card.template_key,
      card.ordinal,
      card.card_state,
      card.is_suspended,
      card.is_buried,
      card.due_at,
      card.stability,
      card.difficulty,
      card.repetitions,
      card.lapses,
      card.last_reviewed_at,
      card.schedule_revision,
      card.created_at,
      note.note_type,
      note.fields,
      note.tags,
      note.revision as note_revision,
      deck.title as deck_title
    from public.study_cards card
    join public.study_notes note
      on note.id = card.note_id and note.user_id = card.user_id
    join public.study_decks deck
      on deck.id = card.deck_id and deck.user_id = card.user_id
    where card.user_id = p_user_id
      and card.deleted_at is null
      and note.deleted_at is null
      and deck.deleted_at is null
      and (p_deck_ids is null or cardinality(p_deck_ids) = 0 or card.deck_id = any(p_deck_ids))
      and (p_tags is null or cardinality(p_tags) = 0 or note.tags && p_tags)
      and (p_note_types is null or cardinality(p_note_types) = 0 or note.note_type = any(p_note_types))
      and (
        p_states is null or cardinality(p_states) = 0
        or (card.is_suspended and 'suspended' = any(p_states))
        or (card.is_buried and 'buried' = any(p_states))
        or (not card.is_suspended and not card.is_buried and card.card_state = any(p_states))
      )
      and (p_due_before is null or card.due_at <= p_due_before)
      and (p_due_after is null or card.due_at >= p_due_after)
      and (p_minimum_lapses is null or card.lapses >= p_minimum_lapses)
      and (v_query is null or note.search_document @@ v_query)
  ), counted as (
    select count(*)::integer as total from matched
  ), page as (
    select *
    from matched
    order by
      case when coalesce(p_sort, 'due') = 'due' then due_at end asc,
      case when p_sort = 'created' then created_at end desc,
      case when p_sort = 'lapses' then lapses end desc,
      case when p_sort = 'difficulty' then difficulty end desc,
      case when p_sort = 'stability' then stability end desc,
      card_id
    limit p_limit
    offset p_offset
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'cardId', page.card_id,
      'noteId', page.note_id,
      'deckId', page.deck_id,
      'deckTitle', page.deck_title,
      'templateKey', page.template_key,
      'noteType', page.note_type,
      'fields', page.fields,
      'tags', to_jsonb(page.tags),
      'noteRevision', page.note_revision,
      'state', case
        when page.is_suspended then 'suspended'
        when page.is_buried then 'buried'
        else page.card_state
      end,
      'dueAt', page.due_at,
      'stability', page.stability,
      'difficulty', page.difficulty,
      'repetitions', page.repetitions,
      'lapses', page.lapses,
      'lastReviewedAt', page.last_reviewed_at,
      'scheduleRevision', page.schedule_revision,
      'createdAt', page.created_at
    )), '[]'::jsonb),
    (select total from counted)
  into v_items, v_total
  from page;

  return jsonb_build_object('status', 'ok', 'items', v_items, 'total', coalesce(v_total, 0));
end;
$$;

revoke all on function public.search_study_cards_v1(
  uuid, text, uuid[], text[], text[], text[], timestamptz, timestamptz, integer, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.search_study_cards_v1(
  uuid, text, uuid[], text[], text[], text[], timestamptz, timestamptz, integer, text, integer, integer
) to service_role;

-- Bulk operations from the browser. Manual rescheduling writes a compensating-capable event so the
-- change is part of review history rather than a silent overwrite.
create or replace function public.bulk_update_study_cards_v1(
  p_user_id uuid,
  p_card_ids uuid[],
  p_action text,
  p_value jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_timestamp timestamptz := now();
  v_cursor bigint;
  v_affected integer := 0;
  v_note_ids uuid[];
  v_due_at timestamptz;
  v_deck_id uuid;
  v_tag text;
begin
  if p_user_id is null or p_card_ids is null or cardinality(p_card_ids) = 0 then
    raise exception using errcode = '22023', message = 'Study bulk selection is required';
  end if;
  if cardinality(p_card_ids) > 500 then
    return jsonb_build_object('status', 'too-large');
  end if;
  if p_action not in (
    'suspend', 'unsuspend', 'bury', 'unbury', 'reschedule', 'move', 'add-tag', 'remove-tag', 'delete'
  ) then
    raise exception using errcode = '22023', message = 'Unsupported Study bulk action';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 20260802));

  select coalesce(array_agg(distinct note_id), '{}'::uuid[])
  into v_note_ids
  from public.study_cards
  where user_id = p_user_id and id = any(p_card_ids) and deleted_at is null;

  if cardinality(v_note_ids) = 0 then
    return jsonb_build_object('status', 'not-found');
  end if;

  v_cursor := public.study_next_cursor_v1(p_user_id);

  if p_action in ('suspend', 'unsuspend') then
    update public.study_cards
    set is_suspended = (p_action = 'suspend'), updated_at = v_timestamp
    where user_id = p_user_id and id = any(p_card_ids) and deleted_at is null
      and is_suspended <> (p_action = 'suspend');
    get diagnostics v_affected = row_count;

  elsif p_action in ('bury', 'unbury') then
    update public.study_cards
    set is_buried = (p_action = 'bury'), updated_at = v_timestamp
    where user_id = p_user_id and id = any(p_card_ids) and deleted_at is null
      and is_buried <> (p_action = 'bury');
    get diagnostics v_affected = row_count;

  elsif p_action = 'reschedule' then
    v_due_at := (p_value ->> 'dueAt')::timestamptz;
    if v_due_at is null then
      raise exception using errcode = '22023', message = 'A new due date is required';
    end if;

    insert into public.study_review_events (
      user_id, card_id, card_reference_id, event_kind, reviewed_at, received_at,
      before_state, after_state, scheduler_name, scheduler_version, parameters_version, result
    )
    select
      p_user_id,
      card.id,
      card.id,
      'manual-reschedule',
      v_timestamp,
      v_timestamp,
      jsonb_build_object('dueAt', card.due_at, 'state', card.card_state,
        'scheduleRevision', card.schedule_revision),
      jsonb_build_object('dueAt', v_due_at, 'state', card.card_state,
        'scheduleRevision', card.schedule_revision + 1),
      card.scheduler_name,
      card.scheduler_version,
      card.parameters_version,
      '{}'::jsonb
    from public.study_cards card
    where card.user_id = p_user_id and card.id = any(p_card_ids) and card.deleted_at is null;

    update public.study_cards
    set due_at = v_due_at,
        schedule_revision = schedule_revision + 1,
        updated_at = v_timestamp
    where user_id = p_user_id and id = any(p_card_ids) and deleted_at is null;
    get diagnostics v_affected = row_count;

  elsif p_action = 'move' then
    v_deck_id := (p_value ->> 'deckId')::uuid;
    perform 1 from public.study_decks
    where id = v_deck_id and user_id = p_user_id and deleted_at is null;
    if not found then
      return jsonb_build_object('status', 'deck-not-found');
    end if;

    update public.study_notes
    set deck_id = v_deck_id, revision = revision + 1, updated_at = v_timestamp
    where user_id = p_user_id and id = any(v_note_ids) and deleted_at is null;

    update public.study_cards
    set deck_id = v_deck_id, updated_at = v_timestamp
    where user_id = p_user_id and note_id = any(v_note_ids) and deleted_at is null;
    get diagnostics v_affected = row_count;

  elsif p_action in ('add-tag', 'remove-tag') then
    v_tag := btrim(coalesce(p_value ->> 'tag', ''));
    if v_tag = '' or char_length(v_tag) > 80 then
      raise exception using errcode = '22023', message = 'A tag is required';
    end if;

    update public.study_notes
    set tags = case
          when p_action = 'add-tag' then
            (select array_agg(distinct value) from unnest(tags || array[v_tag]) as value)
          else array_remove(tags, v_tag)
        end,
        revision = revision + 1,
        updated_at = v_timestamp
    where user_id = p_user_id and id = any(v_note_ids) and deleted_at is null
      and (p_action = 'add-tag') <> (v_tag = any(tags));
    get diagnostics v_affected = row_count;

  elsif p_action = 'delete' then
    update public.study_cards
    set deleted_at = v_timestamp, updated_at = v_timestamp
    where user_id = p_user_id and note_id = any(v_note_ids) and deleted_at is null;

    update public.study_notes
    set deleted_at = v_timestamp, revision = revision + 1, updated_at = v_timestamp
    where user_id = p_user_id and id = any(v_note_ids) and deleted_at is null;
    get diagnostics v_affected = row_count;
  end if;

  insert into public.study_sync_changes (
    user_id, cursor, ordinal, entity_kind, entity_id, operation, revision, changed_at
  )
  select
    p_user_id,
    v_cursor,
    (row_number() over (order by entity_kind, entity_id))::integer - 1,
    entity_kind,
    entity_id,
    operation,
    revision,
    v_timestamp
  from (
    select
      'note'::text as entity_kind,
      note.id as entity_id,
      note.revision as revision,
      case when note.deleted_at is null then 'upsert' else 'delete' end as operation
    from public.study_notes note
    where note.user_id = p_user_id and note.id = any(v_note_ids) and note.updated_at = v_timestamp
    union all
    select
      'card'::text,
      card.id,
      card.schedule_revision,
      case when card.deleted_at is null then 'upsert' else 'delete' end
    from public.study_cards card
    where card.user_id = p_user_id and card.note_id = any(v_note_ids)
      and card.updated_at = v_timestamp
  ) changed;

  return jsonb_build_object(
    'status', 'accepted',
    'syncCursor', v_cursor,
    'affected', v_affected
  );
end;
$$;

revoke all on function public.bulk_update_study_cards_v1(uuid, uuid[], text, jsonb)
  from public, anon, authenticated;
grant execute on function public.bulk_update_study_cards_v1(uuid, uuid[], text, jsonb)
  to service_role;

-- Saved browser views. The stored filter is structured, so it can be replayed safely.
create table if not exists public.study_saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  filter jsonb not null,
  revision bigint not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_saved_views_name_check check (char_length(btrim(name)) between 1 and 120),
  constraint study_saved_views_filter_check check (jsonb_typeof(filter) = 'object'),
  constraint study_saved_views_revision_check check (revision >= 1)
);

create unique index if not exists study_saved_views_id_user_unique
  on public.study_saved_views (id, user_id);
create index if not exists study_saved_views_user_updated_idx
  on public.study_saved_views (user_id, updated_at desc, id)
  where deleted_at is null;

alter table public.study_saved_views enable row level security;
revoke all on table public.study_saved_views from public, anon, authenticated;
grant select, insert, update, delete on table public.study_saved_views to service_role;
