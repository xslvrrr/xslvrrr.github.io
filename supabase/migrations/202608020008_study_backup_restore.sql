-- Account backup restore for Study. Same-account only, revision-guarded, and additive: a restore
-- never overwrites content that is newer than the backup and never deletes review history.

create or replace function public.restore_study_backup_v1(
  p_user_id uuid,
  p_decks jsonb,
  p_notes jsonb,
  p_cards jsonb,
  p_events jsonb,
  p_preferences jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_timestamp timestamptz := now();
  v_cursor bigint;
  v_deck_count integer := jsonb_array_length(coalesce(p_decks, '[]'::jsonb));
  v_note_count integer := jsonb_array_length(coalesce(p_notes, '[]'::jsonb));
  v_card_count integer := jsonb_array_length(coalesce(p_cards, '[]'::jsonb));
  v_event_count integer := jsonb_array_length(coalesce(p_events, '[]'::jsonb));
  v_decks_restored integer := 0;
  v_notes_restored integer := 0;
  v_cards_restored integer := 0;
  v_events_restored integer := 0;
  v_deck_ids uuid[] := '{}'::uuid[];
  v_note_ids uuid[] := '{}'::uuid[];
  v_card_ids uuid[] := '{}'::uuid[];
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'Study restore identity is required';
  end if;
  if v_deck_count > 200 or v_note_count > 20000 or v_card_count > 40000 or v_event_count > 100000 then
    return jsonb_build_object('status', 'too-large');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 20260802));

  v_cursor := public.study_next_cursor_v1(p_user_id);

  with restored_decks as (
  insert into public.study_decks (
    id, user_id, title, description, pinned, sort_order, revision, archived_at,
    created_at, updated_at
  )
  select
    (deck ->> 'id')::uuid,
    p_user_id,
    coalesce(nullif(btrim(deck ->> 'title'), ''), 'Restored set'),
    coalesce(deck ->> 'description', ''),
    coalesce((deck ->> 'pinned')::boolean, false),
    coalesce((deck ->> 'sortOrder')::integer, 0),
    greatest(coalesce((deck ->> 'revision')::bigint, 1), 1),
    (deck ->> 'archivedAt')::timestamptz,
    coalesce((deck ->> 'createdAt')::timestamptz, v_timestamp),
    coalesce((deck ->> 'updatedAt')::timestamptz, v_timestamp)
  from jsonb_array_elements(coalesce(p_decks, '[]'::jsonb)) as deck
  on conflict (id) do update set
    title = excluded.title,
    description = excluded.description,
    pinned = excluded.pinned,
    sort_order = excluded.sort_order,
    revision = excluded.revision,
    archived_at = excluded.archived_at,
    deleted_at = null,
    updated_at = excluded.updated_at
  -- Only restore over content the backup is newer than, and only into this account.
  where study_decks.user_id = p_user_id
    and study_decks.revision < excluded.revision
  returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[]), count(*)::integer
  into v_deck_ids, v_decks_restored
  from restored_decks;

  with restored_notes as (
  insert into public.study_notes (
    id, user_id, deck_id, note_type, schema_version, fields, tags, source_kind,
    revision, created_at, updated_at
  )
  select
    (note ->> 'id')::uuid,
    p_user_id,
    (note ->> 'deckId')::uuid,
    coalesce(note ->> 'noteType', 'basic'),
    coalesce((note ->> 'schemaVersion')::integer, 1),
    note -> 'fields',
    coalesce(
      (select array_agg(value::text) from jsonb_array_elements_text(note -> 'tags') as tags(value)),
      '{}'::text[]
    ),
    'restore',
    greatest(coalesce((note ->> 'revision')::bigint, 1), 1),
    coalesce((note ->> 'createdAt')::timestamptz, v_timestamp),
    coalesce((note ->> 'updatedAt')::timestamptz, v_timestamp)
  from jsonb_array_elements(coalesce(p_notes, '[]'::jsonb)) as note
  where exists (
    select 1 from public.study_decks deck
    where deck.id = (note ->> 'deckId')::uuid and deck.user_id = p_user_id
  )
  on conflict (id) do update set
    deck_id = excluded.deck_id,
    note_type = excluded.note_type,
    schema_version = excluded.schema_version,
    fields = excluded.fields,
    tags = excluded.tags,
    revision = excluded.revision,
    deleted_at = null,
    updated_at = excluded.updated_at
  where study_notes.user_id = p_user_id
    and study_notes.revision < excluded.revision
  returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[]), count(*)::integer
  into v_note_ids, v_notes_restored
  from restored_notes;

  with restored_cards as (
  insert into public.study_cards (
    id, user_id, deck_id, note_id, template_key, ordinal, card_state,
    is_suspended, is_buried, due_at, stability, difficulty, elapsed_days, scheduled_days,
    learning_steps, repetitions, lapses, last_reviewed_at,
    scheduler_name, scheduler_version, parameters_version, scheduler_metadata,
    schedule_revision, created_at, updated_at
  )
  select
    (card ->> 'id')::uuid,
    p_user_id,
    (card ->> 'deckId')::uuid,
    (card ->> 'noteId')::uuid,
    coalesce(card ->> 'templateKey', 'forward'),
    coalesce((card ->> 'ordinal')::integer, 0),
    coalesce(card ->> 'state', 'new'),
    coalesce((card ->> 'isSuspended')::boolean, false),
    coalesce((card ->> 'isBuried')::boolean, false),
    coalesce((card ->> 'dueAt')::timestamptz, v_timestamp),
    coalesce((card ->> 'stability')::double precision, 0),
    coalesce((card ->> 'difficulty')::double precision, 0),
    coalesce((card ->> 'elapsedDays')::double precision, 0),
    coalesce((card ->> 'scheduledDays')::double precision, 0),
    coalesce((card ->> 'learningSteps')::integer, 0),
    coalesce((card ->> 'repetitions')::integer, 0),
    coalesce((card ->> 'lapses')::integer, 0),
    (card ->> 'lastReviewedAt')::timestamptz,
    coalesce(card ->> 'schedulerName', 'fsrs'),
    coalesce(card ->> 'schedulerVersion', '1'),
    coalesce(card ->> 'parametersVersion', 'default'),
    coalesce(card -> 'schedulerMetadata', '{}'::jsonb),
    coalesce((card ->> 'scheduleRevision')::bigint, 0),
    coalesce((card ->> 'createdAt')::timestamptz, v_timestamp),
    coalesce((card ->> 'updatedAt')::timestamptz, v_timestamp)
  from jsonb_array_elements(coalesce(p_cards, '[]'::jsonb)) as card
  where exists (
    select 1 from public.study_notes note
    where note.id = (card ->> 'noteId')::uuid and note.user_id = p_user_id
  )
  on conflict (id) do update set
    template_key = excluded.template_key,
    ordinal = excluded.ordinal,
    card_state = excluded.card_state,
    is_suspended = excluded.is_suspended,
    is_buried = excluded.is_buried,
    due_at = excluded.due_at,
    stability = excluded.stability,
    difficulty = excluded.difficulty,
    elapsed_days = excluded.elapsed_days,
    scheduled_days = excluded.scheduled_days,
    learning_steps = excluded.learning_steps,
    repetitions = excluded.repetitions,
    lapses = excluded.lapses,
    last_reviewed_at = excluded.last_reviewed_at,
    scheduler_name = excluded.scheduler_name,
    scheduler_version = excluded.scheduler_version,
    parameters_version = excluded.parameters_version,
    scheduler_metadata = excluded.scheduler_metadata,
    schedule_revision = excluded.schedule_revision,
    deleted_at = null,
    updated_at = excluded.updated_at
  -- A card reviewed since the backup keeps its newer schedule.
  where study_cards.user_id = p_user_id
    and study_cards.schedule_revision < excluded.schedule_revision
  returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[]), count(*)::integer
  into v_card_ids, v_cards_restored
  from restored_cards;

  -- Review history is append-only. Restoring never rewrites an event that already exists.
  insert into public.study_review_events (
    id, user_id, card_id, card_reference_id, session_id, client_operation_id, device_id,
    event_kind, rating, reviewed_at, received_at, duration_ms,
    before_state, after_state, scheduler_name, scheduler_version, parameters_version,
    target_event_id, retrievability_before, next_interval_seconds, result
  )
  select
    (event ->> 'id')::uuid,
    p_user_id,
    (select card.id from public.study_cards card
      where card.id = (event ->> 'cardId')::uuid and card.user_id = p_user_id),
    coalesce((event ->> 'cardReferenceId')::uuid, (event ->> 'cardId')::uuid),
    null,
    (event ->> 'clientOperationId')::uuid,
    (event ->> 'deviceId')::uuid,
    coalesce(event ->> 'eventKind', 'review'),
    event ->> 'rating',
    coalesce((event ->> 'reviewedAt')::timestamptz, v_timestamp),
    coalesce((event ->> 'receivedAt')::timestamptz, v_timestamp),
    (event ->> 'durationMs')::integer,
    event -> 'beforeState',
    coalesce(event -> 'afterState', '{}'::jsonb),
    coalesce(event ->> 'schedulerName', 'fsrs'),
    coalesce(event ->> 'schedulerVersion', '1'),
    coalesce(event ->> 'parametersVersion', 'default'),
    null,
    (event ->> 'retrievabilityBefore')::double precision,
    (event ->> 'nextIntervalSeconds')::bigint,
    '{}'::jsonb
  from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) as event
  where coalesce(event ->> 'eventKind', 'review') in ('review', 'migration', 'manual-reschedule')
  on conflict (id) do nothing;
  get diagnostics v_events_restored = row_count;

  if p_preferences is not null and jsonb_typeof(p_preferences) = 'object' then
    insert into public.study_preferences (
      user_id, experience_mode, desired_retention, daily_time_budget_minutes,
      daily_new_limit, daily_review_limit, day_boundary_hour, time_zone,
      default_mixing_strategy, show_streaks, revision, updated_at
    ) values (
      p_user_id,
      coalesce(p_preferences ->> 'experienceMode', 'beginner'),
      coalesce((p_preferences ->> 'desiredRetention')::numeric, 0.9000),
      coalesce((p_preferences ->> 'dailyTimeBudgetMinutes')::integer, 20),
      coalesce((p_preferences ->> 'dailyNewLimit')::integer, 20),
      coalesce((p_preferences ->> 'dailyReviewLimit')::integer, 200),
      coalesce((p_preferences ->> 'dayBoundaryHour')::integer, 4),
      coalesce(p_preferences ->> 'timeZone', 'UTC'),
      coalesce(p_preferences ->> 'defaultMixingStrategy', 'adaptive'),
      coalesce((p_preferences ->> 'showStreaks')::boolean, true),
      greatest(coalesce((p_preferences ->> 'revision')::bigint, 1), 1),
      v_timestamp
    )
    on conflict (user_id) do update set
      experience_mode = excluded.experience_mode,
      desired_retention = excluded.desired_retention,
      daily_time_budget_minutes = excluded.daily_time_budget_minutes,
      daily_new_limit = excluded.daily_new_limit,
      daily_review_limit = excluded.daily_review_limit,
      day_boundary_hour = excluded.day_boundary_hour,
      time_zone = excluded.time_zone,
      default_mixing_strategy = excluded.default_mixing_strategy,
      show_streaks = excluded.show_streaks,
      revision = excluded.revision,
      updated_at = excluded.updated_at
    where study_preferences.revision < excluded.revision;
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
    'upsert',
    revision,
    v_timestamp
  from (
    select 'deck'::text as entity_kind, deck.id as entity_id, deck.revision as revision
    from public.study_decks deck
    where deck.user_id = p_user_id and deck.id = any(v_deck_ids)
    union all
    select 'note'::text, note.id, note.revision
    from public.study_notes note
    where note.user_id = p_user_id and note.id = any(v_note_ids)
    union all
    select 'card'::text, card.id, card.schedule_revision
    from public.study_cards card
    where card.user_id = p_user_id and card.id = any(v_card_ids)
  ) changed;

  return jsonb_build_object(
    'status', 'accepted',
    'syncCursor', v_cursor,
    'decksRestored', v_decks_restored,
    'notesRestored', v_notes_restored,
    'cardsRestored', v_cards_restored,
    'reviewEventsRestored', v_events_restored
  );
end;
$$;

revoke all on function public.restore_study_backup_v1(uuid, jsonb, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.restore_study_backup_v1(uuid, jsonb, jsonb, jsonb, jsonb, jsonb)
  to service_role;
