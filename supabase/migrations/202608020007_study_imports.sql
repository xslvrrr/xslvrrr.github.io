-- Study imports and history export. An import is previewed first, committed atomically from the
-- stored plan, and reversible. Additive only.

create table if not exists public.study_import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'preview',
  source_kind text not null default 'csv',
  file_name text not null default '',
  file_checksum text not null,
  delimiter text not null default ',',
  deck_id uuid,
  deck_title text not null default '',
  creates_deck boolean not null default false,
  duplicate_policy text not null default 'skip',
  plan jsonb not null,
  summary jsonb not null,
  created_note_ids uuid[] not null default '{}'::uuid[],
  expires_at timestamptz not null,
  committed_at timestamptz,
  rolled_back_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_import_jobs_status_check check (
    status in ('preview', 'committed', 'rolled-back', 'expired', 'failed')
  ),
  constraint study_import_jobs_source_check check (source_kind in ('csv', 'package')),
  constraint study_import_jobs_file_name_check check (char_length(file_name) <= 240),
  constraint study_import_jobs_checksum_check check (char_length(file_checksum) between 16 and 128),
  constraint study_import_jobs_delimiter_check check (char_length(delimiter) between 1 and 4),
  constraint study_import_jobs_deck_title_check check (char_length(deck_title) <= 120),
  constraint study_import_jobs_policy_check check (duplicate_policy in ('skip', 'import')),
  constraint study_import_jobs_plan_check check (jsonb_typeof(plan) = 'object'),
  constraint study_import_jobs_summary_check check (jsonb_typeof(summary) = 'object')
);

create unique index if not exists study_import_jobs_id_user_unique
  on public.study_import_jobs (id, user_id);
create index if not exists study_import_jobs_user_created_idx
  on public.study_import_jobs (user_id, created_at desc, id);
create index if not exists study_import_jobs_expiry_idx
  on public.study_import_jobs (expires_at)
  where status = 'preview';

alter table public.study_import_jobs
  drop constraint if exists study_import_jobs_deck_owner_fkey;
alter table public.study_import_jobs
  add constraint study_import_jobs_deck_owner_fkey
  foreign key (deck_id, user_id)
  references public.study_decks(id, user_id)
  on delete set null (deck_id);

alter table public.study_import_jobs enable row level security;
revoke all on table public.study_import_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.study_import_jobs to service_role;

-- Stores a validated plan. Nothing is written to Study content until the job is committed.
create or replace function public.create_study_import_job_v1(
  p_user_id uuid,
  p_job_id uuid,
  p_source_kind text,
  p_file_name text,
  p_file_checksum text,
  p_delimiter text,
  p_deck_id uuid,
  p_deck_title text,
  p_creates_deck boolean,
  p_duplicate_policy text,
  p_plan jsonb,
  p_summary jsonb,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_note_count integer;
  v_existing_cards integer := 0;
  v_deck_count integer;
begin
  if p_user_id is null or p_job_id is null or p_plan is null or p_summary is null then
    raise exception using errcode = '22023', message = 'Study import identity is required';
  end if;

  v_note_count := jsonb_array_length(coalesce(p_plan -> 'notes', '[]'::jsonb));
  if v_note_count > 500 then
    return jsonb_build_object('status', 'too-large');
  end if;

  if p_creates_deck then
    select count(*)::integer into v_deck_count
    from public.study_decks
    where user_id = p_user_id and deleted_at is null;
    if v_deck_count >= 60 then
      return jsonb_build_object('status', 'limit-reached');
    end if;
  else
    perform 1
    from public.study_decks
    where id = p_deck_id and user_id = p_user_id and deleted_at is null;
    if not found then
      return jsonb_build_object('status', 'deck-not-found');
    end if;

    select count(*)::integer into v_existing_cards
    from public.study_cards
    where user_id = p_user_id and deck_id = p_deck_id and deleted_at is null;
  end if;

  -- One card per imported basic note. The same ceiling the interactive editor enforces.
  if v_existing_cards + v_note_count > 500 then
    return jsonb_build_object('status', 'limit-reached');
  end if;

  insert into public.study_import_jobs (
    id, user_id, status, source_kind, file_name, file_checksum, delimiter,
    deck_id, deck_title, creates_deck, duplicate_policy, plan, summary, expires_at
  ) values (
    p_job_id, p_user_id, 'preview', coalesce(p_source_kind, 'csv'), coalesce(p_file_name, ''),
    p_file_checksum, coalesce(p_delimiter, ','), p_deck_id, coalesce(p_deck_title, ''),
    coalesce(p_creates_deck, false), coalesce(p_duplicate_policy, 'skip'), p_plan, p_summary,
    p_expires_at
  )
  on conflict (id) do nothing;

  if not found then
    return jsonb_build_object('status', 'duplicate', 'jobId', p_job_id);
  end if;

  return jsonb_build_object('status', 'accepted', 'jobId', p_job_id, 'summary', p_summary);
end;
$$;

revoke all on function public.create_study_import_job_v1(
  uuid, uuid, text, text, text, text, uuid, text, boolean, text, jsonb, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_study_import_job_v1(
  uuid, uuid, text, text, text, text, uuid, text, boolean, text, jsonb, jsonb, timestamptz
) to service_role;

-- Commits the stored plan in one transaction. Either every planned note lands or none does.
create or replace function public.commit_study_import_v1(
  p_user_id uuid,
  p_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.study_import_jobs%rowtype;
  v_plan jsonb;
  v_deck_id uuid;
  v_note_count integer;
  v_existing_cards integer := 0;
  v_deck_count integer;
  v_timestamp timestamptz := now();
  v_cursor bigint;
  v_sort_order integer;
  v_note_ids uuid[];
begin
  if p_user_id is null or p_job_id is null then
    raise exception using errcode = '22023', message = 'Study import identity is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 20260802));

  select * into v_job
  from public.study_import_jobs
  where id = p_job_id and user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;
  if v_job.status = 'committed' then
    -- Idempotent retry of the same commit.
    return jsonb_build_object(
      'status', 'duplicate',
      'deck', public.study_deck_summary_v1(p_user_id, v_job.deck_id),
      'importedNotes', cardinality(v_job.created_note_ids)
    );
  end if;
  if v_job.status <> 'preview' then
    return jsonb_build_object('status', 'expired');
  end if;
  if v_job.expires_at <= v_timestamp then
    update public.study_import_jobs
    set status = 'expired', updated_at = v_timestamp
    where id = p_job_id and user_id = p_user_id;
    return jsonb_build_object('status', 'expired');
  end if;

  v_plan := v_job.plan;
  v_note_count := jsonb_array_length(coalesce(v_plan -> 'notes', '[]'::jsonb));
  v_deck_id := v_job.deck_id;

  if v_job.creates_deck then
    select count(*)::integer into v_deck_count
    from public.study_decks
    where user_id = p_user_id and deleted_at is null;
    if v_deck_count >= 60 then
      return jsonb_build_object('status', 'limit-reached');
    end if;

    select coalesce(max(sort_order), -1) + 1 into v_sort_order
    from public.study_decks
    where user_id = p_user_id and deleted_at is null;

    v_deck_id := coalesce(v_deck_id, (v_plan -> 'deck' ->> 'id')::uuid);

    insert into public.study_decks (
      id, user_id, title, description, sort_order, created_at, updated_at
    ) values (
      v_deck_id,
      p_user_id,
      coalesce(nullif(btrim(v_job.deck_title), ''), 'Imported set'),
      coalesce(v_plan -> 'deck' ->> 'description', ''),
      v_sort_order,
      v_timestamp,
      v_timestamp
    )
    on conflict (id) do nothing;
  else
    perform 1
    from public.study_decks
    where id = v_deck_id and user_id = p_user_id and deleted_at is null
    for update;
    if not found then
      return jsonb_build_object('status', 'deck-not-found');
    end if;

    select count(*)::integer into v_existing_cards
    from public.study_cards
    where user_id = p_user_id and deck_id = v_deck_id and deleted_at is null;
  end if;

  if v_existing_cards + v_note_count > 500 then
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
    v_deck_id,
    'basic',
    1,
    note -> 'fields',
    coalesce(
      (select array_agg(value::text) from jsonb_array_elements_text(note -> 'tags') as tags(value)),
      '{}'::text[]
    ),
    'import',
    1,
    v_timestamp,
    v_timestamp
  from jsonb_array_elements(coalesce(v_plan -> 'notes', '[]'::jsonb)) as note
  on conflict (id) do nothing;

  insert into public.study_cards (
    id, user_id, deck_id, note_id, template_key, ordinal, card_state,
    due_at, stability, difficulty, elapsed_days, scheduled_days, learning_steps,
    repetitions, lapses, last_reviewed_at,
    scheduler_name, scheduler_version, parameters_version, schedule_revision,
    created_at, updated_at
  )
  select
    (card ->> 'id')::uuid,
    p_user_id,
    v_deck_id,
    (note ->> 'id')::uuid,
    card ->> 'templateKey',
    coalesce((card ->> 'ordinal')::integer, 0),
    coalesce(v_plan -> 'initialState' ->> 'state', 'new'),
    coalesce((v_plan -> 'initialState' ->> 'dueAt')::timestamptz, v_timestamp),
    coalesce((v_plan -> 'initialState' ->> 'stability')::double precision, 0),
    coalesce((v_plan -> 'initialState' ->> 'difficulty')::double precision, 0),
    coalesce((v_plan -> 'initialState' ->> 'elapsedDays')::double precision, 0),
    coalesce((v_plan -> 'initialState' ->> 'scheduledDays')::double precision, 0),
    coalesce((v_plan -> 'initialState' ->> 'learningSteps')::integer, 0),
    0,
    0,
    null,
    coalesce(v_plan ->> 'schedulerName', 'fsrs'),
    coalesce(v_plan ->> 'schedulerVersion', '1'),
    coalesce(v_plan ->> 'parametersVersion', 'default'),
    0,
    v_timestamp,
    v_timestamp
  from jsonb_array_elements(coalesce(v_plan -> 'notes', '[]'::jsonb)) as note,
       jsonb_array_elements(coalesce(note -> 'cards', '[]'::jsonb)) as card
  on conflict (id) do nothing;

  select coalesce(array_agg((note ->> 'id')::uuid), '{}'::uuid[])
  into v_note_ids
  from jsonb_array_elements(coalesce(v_plan -> 'notes', '[]'::jsonb)) as note;

  insert into public.study_sync_changes (
    user_id, cursor, ordinal, entity_kind, entity_id, operation, revision, changed_at
  )
  select p_user_id, v_cursor, 0, 'deck', deck.id, 'upsert', deck.revision, v_timestamp
  from public.study_decks deck
  where deck.id = v_deck_id and deck.user_id = p_user_id;

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

  update public.study_import_jobs
  set status = 'committed',
      deck_id = v_deck_id,
      created_note_ids = v_note_ids,
      committed_at = v_timestamp,
      updated_at = v_timestamp
  where id = p_job_id and user_id = p_user_id;

  return jsonb_build_object(
    'status', 'accepted',
    'syncCursor', v_cursor,
    'importedNotes', cardinality(v_note_ids),
    'deck', public.study_deck_summary_v1(p_user_id, v_deck_id)
  );
end;
$$;

revoke all on function public.commit_study_import_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.commit_study_import_v1(uuid, uuid)
  to service_role;

-- Reverses a committed import. Only content this job created is removed, and review history is
-- never deleted: a reviewed card's note is kept and reported instead.
create or replace function public.rollback_study_import_v1(
  p_user_id uuid,
  p_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.study_import_jobs%rowtype;
  v_timestamp timestamptz := now();
  v_cursor bigint;
  v_removable uuid[];
  v_kept integer := 0;
  v_removed integer := 0;
begin
  if p_user_id is null or p_job_id is null then
    raise exception using errcode = '22023', message = 'Study import identity is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 20260802));

  select * into v_job
  from public.study_import_jobs
  where id = p_job_id and user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;
  if v_job.status = 'rolled-back' then
    return jsonb_build_object('status', 'duplicate');
  end if;
  if v_job.status <> 'committed' then
    return jsonb_build_object('status', 'not-committed');
  end if;

  select coalesce(array_agg(note.id), '{}'::uuid[])
  into v_removable
  from public.study_notes note
  where note.user_id = p_user_id
    and note.id = any(v_job.created_note_ids)
    and note.deleted_at is null
    and not exists (
      select 1
      from public.study_cards card
      join public.study_review_events event
        on event.card_id = card.id and event.user_id = card.user_id
      where card.note_id = note.id
        and card.user_id = p_user_id
        and event.event_kind = 'review'
    );

  select cardinality(v_job.created_note_ids) - cardinality(v_removable) into v_kept;

  if cardinality(v_removable) > 0 then
    v_cursor := public.study_next_cursor_v1(p_user_id);

    update public.study_cards
    set deleted_at = v_timestamp, updated_at = v_timestamp
    where user_id = p_user_id and note_id = any(v_removable) and deleted_at is null;

    update public.study_notes
    set deleted_at = v_timestamp, revision = revision + 1, updated_at = v_timestamp
    where user_id = p_user_id and id = any(v_removable) and deleted_at is null;

    get diagnostics v_removed = row_count;

    insert into public.study_sync_changes (
      user_id, cursor, ordinal, entity_kind, entity_id, operation, revision, changed_at
    )
    select
      p_user_id,
      v_cursor,
      (row_number() over (order by entity_kind, entity_id))::integer - 1,
      entity_kind,
      entity_id,
      'delete',
      revision,
      v_timestamp
    from (
      select 'note'::text as entity_kind, note.id as entity_id, note.revision as revision
      from public.study_notes note
      where note.user_id = p_user_id and note.id = any(v_removable)
      union all
      select 'card'::text, card.id, card.schedule_revision
      from public.study_cards card
      where card.user_id = p_user_id and card.note_id = any(v_removable)
    ) changed;
  end if;

  update public.study_import_jobs
  set status = 'rolled-back', rolled_back_at = v_timestamp, updated_at = v_timestamp
  where id = p_job_id and user_id = p_user_id;

  return jsonb_build_object(
    'status', 'accepted',
    'removedNotes', v_removed,
    'keptReviewedNotes', v_kept,
    'deck', public.study_deck_summary_v1(p_user_id, v_job.deck_id)
  );
end;
$$;

revoke all on function public.rollback_study_import_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.rollback_study_import_v1(uuid, uuid)
  to service_role;

-- Paginated review history for account backups and history exports.
create or replace function public.export_study_review_events_v1(
  p_user_id uuid,
  p_after_id uuid,
  p_limit integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_events jsonb;
  v_next uuid;
begin
  if p_user_id is null or p_limit is null or p_limit < 1 or p_limit > 5000 then
    raise exception using errcode = '22023', message = 'Invalid Study history request';
  end if;

  with page as (
    select event.*
    from public.study_review_events event
    where event.user_id = p_user_id
      and (p_after_id is null or event.id > p_after_id)
    order by event.id
    limit p_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', page.id,
      'cardId', page.card_id,
      'cardReferenceId', page.card_reference_id,
      'sessionId', page.session_id,
      'clientOperationId', page.client_operation_id,
      'deviceId', page.device_id,
      'eventKind', page.event_kind,
      'rating', page.rating,
      'reviewedAt', page.reviewed_at,
      'receivedAt', page.received_at,
      'durationMs', page.duration_ms,
      'beforeState', page.before_state,
      'afterState', page.after_state,
      'schedulerName', page.scheduler_name,
      'schedulerVersion', page.scheduler_version,
      'parametersVersion', page.parameters_version,
      'targetEventId', page.target_event_id,
      'retrievabilityBefore', page.retrievability_before,
      'nextIntervalSeconds', page.next_interval_seconds
    ) order by page.id), '[]'::jsonb),
    max(page.id)
  into v_events, v_next
  from page;

  return jsonb_build_object(
    'events', v_events,
    'nextCursor', case when jsonb_array_length(v_events) < p_limit then null else v_next end
  );
end;
$$;

revoke all on function public.export_study_review_events_v1(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.export_study_review_events_v1(uuid, uuid, integer)
  to service_role;

-- Expired previews hold user content, so they are removed on a schedule rather than kept forever.
create or replace function public.prune_study_import_jobs_v1(
  p_retention_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_expired integer := 0;
  v_deleted integer := 0;
begin
  if p_retention_days is null or p_retention_days < 1 or p_retention_days > 3650 then
    raise exception using errcode = '22023', message = 'Invalid Study import retention request';
  end if;

  update public.study_import_jobs
  set status = 'expired', plan = '{}'::jsonb, updated_at = now()
  where status = 'preview' and expires_at <= now();
  get diagnostics v_expired = row_count;

  delete from public.study_import_jobs
  where created_at < now() - make_interval(days => p_retention_days);
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('expired', v_expired, 'deleted', v_deleted);
end;
$$;

revoke all on function public.prune_study_import_jobs_v1(integer)
  from public, anon, authenticated;
grant execute on function public.prune_study_import_jobs_v1(integer)
  to service_role;
