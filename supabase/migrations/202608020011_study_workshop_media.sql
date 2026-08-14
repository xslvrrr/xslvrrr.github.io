-- Source-grounded drafting and private media. Model output is never committed directly: it becomes
-- a draft the user reviews, edits, and approves. Approval is the only path that writes notes.

create table if not exists public.study_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  source_kind text not null,
  title text not null default '',
  reference text not null default '',
  content_hash text not null,
  extracted_characters integer not null default 0,
  retention text not null default 'session',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_sources_kind_check check (
    source_kind in ('portal-item', 'note', 'pasted-text', 'file', 'deck')
  ),
  constraint study_sources_title_check check (char_length(title) <= 240),
  constraint study_sources_reference_check check (char_length(reference) <= 500),
  constraint study_sources_hash_check check (char_length(content_hash) between 16 and 128),
  constraint study_sources_retention_check check (retention in ('session', 'kept')),
  constraint study_sources_characters_check check (extracted_characters between 0 and 1000000)
);

create unique index if not exists study_sources_id_user_unique
  on public.study_sources (id, user_id);
create index if not exists study_sources_user_created_idx
  on public.study_sources (user_id, created_at desc, id);
create index if not exists study_sources_expiry_idx
  on public.study_sources (expires_at)
  where expires_at is not null;

create table if not exists public.study_note_sources (
  note_id uuid not null,
  source_id uuid not null,
  user_id uuid not null references public.users(id) on delete cascade,
  locator text not null default '',
  excerpt_hash text,
  created_at timestamptz not null default now(),
  primary key (note_id, source_id),
  constraint study_note_sources_locator_check check (char_length(locator) <= 500)
);

alter table public.study_note_sources
  drop constraint if exists study_note_sources_note_owner_fkey;
alter table public.study_note_sources
  add constraint study_note_sources_note_owner_fkey
  foreign key (note_id, user_id)
  references public.study_notes(id, user_id)
  on delete cascade;

alter table public.study_note_sources
  drop constraint if exists study_note_sources_source_owner_fkey;
alter table public.study_note_sources
  add constraint study_note_sources_source_owner_fkey
  foreign key (source_id, user_id)
  references public.study_sources(id, user_id)
  on delete cascade;

create table if not exists public.study_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  storage_path text not null,
  mime_type text not null,
  byte_size integer not null,
  checksum text not null,
  width integer,
  height integer,
  alt_text text not null,
  created_at timestamptz not null default now(),
  constraint study_media_path_check check (char_length(storage_path) between 1 and 400),
  constraint study_media_mime_check check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  constraint study_media_size_check check (byte_size between 1 and 5242880),
  constraint study_media_checksum_check check (char_length(checksum) between 16 and 128),
  -- Alt text is required, not optional: a card whose only content is an image is unusable without it.
  constraint study_media_alt_check check (char_length(btrim(alt_text)) between 1 and 1000),
  constraint study_media_dimensions_check check (
    (width is null or width between 1 and 20000) and (height is null or height between 1 and 20000)
  )
);

create unique index if not exists study_media_id_user_unique
  on public.study_media (id, user_id);
create unique index if not exists study_media_user_checksum_unique
  on public.study_media (user_id, checksum);

create table if not exists public.study_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  batch_id uuid not null,
  deck_id uuid,
  source_id uuid,
  origin text not null default 'assistant',
  note_type text not null default 'basic',
  fields jsonb not null,
  tags text[] not null default '{}'::text[],
  citation text not null default '',
  lint jsonb not null default '[]'::jsonb,
  status text not null default 'pending',
  provider text not null default '',
  model text not null default '',
  generated_at timestamptz not null default now(),
  approved_note_id uuid,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_drafts_origin_check check (origin in ('assistant', 'import', 'manual')),
  constraint study_drafts_status_check check (status in ('pending', 'approved', 'rejected', 'expired')),
  constraint study_drafts_note_type_check check (
    note_type in ('basic', 'basic-reversed', 'typed', 'cloze', 'sequence', 'compare-contrast', 'application')
  ),
  constraint study_drafts_fields_check check (jsonb_typeof(fields) = 'object'),
  constraint study_drafts_lint_check check (jsonb_typeof(lint) = 'array'),
  constraint study_drafts_citation_check check (char_length(citation) <= 2000),
  constraint study_drafts_provider_check check (char_length(provider) <= 80 and char_length(model) <= 160)
);

create unique index if not exists study_drafts_id_user_unique
  on public.study_drafts (id, user_id);
create index if not exists study_drafts_user_batch_idx
  on public.study_drafts (user_id, batch_id, created_at);
create index if not exists study_drafts_pending_idx
  on public.study_drafts (user_id, status, created_at desc)
  where status = 'pending';
create index if not exists study_drafts_expiry_idx
  on public.study_drafts (expires_at)
  where status = 'pending';

alter table public.study_drafts
  drop constraint if exists study_drafts_deck_owner_fkey;
alter table public.study_drafts
  add constraint study_drafts_deck_owner_fkey
  foreign key (deck_id, user_id)
  references public.study_decks(id, user_id)
  on delete set null (deck_id);

alter table public.study_drafts
  drop constraint if exists study_drafts_source_owner_fkey;
alter table public.study_drafts
  add constraint study_drafts_source_owner_fkey
  foreign key (source_id, user_id)
  references public.study_sources(id, user_id)
  on delete set null (source_id);

alter table public.study_sources enable row level security;
alter table public.study_note_sources enable row level security;
alter table public.study_media enable row level security;
alter table public.study_drafts enable row level security;

revoke all on table public.study_sources from public, anon, authenticated;
revoke all on table public.study_note_sources from public, anon, authenticated;
revoke all on table public.study_media from public, anon, authenticated;
revoke all on table public.study_drafts from public, anon, authenticated;

grant select, insert, update, delete on table public.study_sources to service_role;
grant select, insert, update, delete on table public.study_note_sources to service_role;
grant select, insert, update, delete on table public.study_media to service_role;
grant select, insert, update, delete on table public.study_drafts to service_role;

-- Stores one batch of drafts. Writing a draft never touches Study content.
create or replace function public.create_study_drafts_v1(
  p_user_id uuid,
  p_batch_id uuid,
  p_deck_id uuid,
  p_source jsonb,
  p_drafts jsonb,
  p_provider text,
  p_model text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_source_id uuid;
  v_count integer;
  v_pending integer;
begin
  if p_user_id is null or p_batch_id is null or jsonb_typeof(p_drafts) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Study draft batch is required';
  end if;

  v_count := jsonb_array_length(p_drafts);
  if v_count < 1 or v_count > 25 then
    return jsonb_build_object('status', 'invalid-batch-size');
  end if;

  select count(*)::integer into v_pending
  from public.study_drafts
  where user_id = p_user_id and status = 'pending';
  if v_pending + v_count > 200 then
    return jsonb_build_object('status', 'limit-reached');
  end if;

  if p_deck_id is not null then
    perform 1 from public.study_decks
    where id = p_deck_id and user_id = p_user_id and deleted_at is null;
    if not found then
      return jsonb_build_object('status', 'deck-not-found');
    end if;
  end if;

  if p_source is not null and jsonb_typeof(p_source) = 'object' then
    insert into public.study_sources (
      user_id, source_kind, title, reference, content_hash, extracted_characters, retention, expires_at
    ) values (
      p_user_id,
      coalesce(p_source ->> 'sourceKind', 'pasted-text'),
      coalesce(p_source ->> 'title', ''),
      coalesce(p_source ->> 'reference', ''),
      p_source ->> 'contentHash',
      coalesce((p_source ->> 'extractedCharacters')::integer, 0),
      coalesce(p_source ->> 'retention', 'session'),
      p_expires_at
    )
    returning id into v_source_id;
  end if;

  insert into public.study_drafts (
    id, user_id, batch_id, deck_id, source_id, origin, note_type, fields, tags,
    citation, lint, provider, model, expires_at
  )
  select
    coalesce((draft ->> 'id')::uuid, gen_random_uuid()),
    p_user_id,
    p_batch_id,
    p_deck_id,
    v_source_id,
    coalesce(draft ->> 'origin', 'assistant'),
    coalesce(draft ->> 'noteType', 'basic'),
    draft -> 'fields',
    coalesce(
      (select array_agg(value::text) from jsonb_array_elements_text(draft -> 'tags') as tags(value)),
      '{}'::text[]
    ),
    coalesce(draft ->> 'citation', ''),
    coalesce(draft -> 'lint', '[]'::jsonb),
    coalesce(p_provider, ''),
    coalesce(p_model, ''),
    p_expires_at
  from jsonb_array_elements(p_drafts) as draft;

  return jsonb_build_object('status', 'accepted', 'batchId', p_batch_id, 'draftCount', v_count);
end;
$$;

revoke all on function public.create_study_drafts_v1(uuid, uuid, uuid, jsonb, jsonb, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.create_study_drafts_v1(uuid, uuid, uuid, jsonb, jsonb, text, text, timestamptz)
  to service_role;

-- Approves selected drafts into real notes and cards, atomically, with their source citations.
create or replace function public.approve_study_drafts_v1(
  p_user_id uuid,
  p_draft_ids uuid[],
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
  v_timestamp timestamptz := now();
  v_cursor bigint;
  v_card_count integer;
  v_note_count integer := jsonb_array_length(coalesce(p_notes, '[]'::jsonb));
  v_note_ids uuid[];
begin
  if p_user_id is null or p_deck_id is null or p_draft_ids is null or cardinality(p_draft_ids) = 0 then
    raise exception using errcode = '22023', message = 'Study draft approval is required';
  end if;
  if v_note_count = 0 or v_note_count > 25 then
    return jsonb_build_object('status', 'invalid-batch-size');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 20260802));

  perform 1 from public.study_decks
  where id = p_deck_id and user_id = p_user_id and deleted_at is null
  for update;
  if not found then
    return jsonb_build_object('status', 'deck-not-found');
  end if;

  -- Every named draft must still be pending; a re-approval must not create duplicate notes.
  perform 1
  from public.study_drafts
  where user_id = p_user_id and id = any(p_draft_ids) and status <> 'pending'
  limit 1;
  if found then
    return jsonb_build_object('status', 'already-resolved');
  end if;

  select count(*)::integer into v_card_count
  from public.study_cards
  where user_id = p_user_id and deck_id = p_deck_id and deleted_at is null;
  if v_card_count + v_note_count > 500 then
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
    'assistant',
    1,
    v_timestamp,
    v_timestamp
  from jsonb_array_elements(coalesce(p_notes, '[]'::jsonb)) as note
  on conflict (id) do nothing;

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

  select coalesce(array_agg((note ->> 'id')::uuid), '{}'::uuid[])
  into v_note_ids
  from jsonb_array_elements(coalesce(p_notes, '[]'::jsonb)) as note;

  update public.study_drafts draft
  set status = 'approved',
      approved_note_id = mapping.note_id,
      updated_at = v_timestamp
  from (
    select (note ->> 'draftId')::uuid as draft_id, (note ->> 'id')::uuid as note_id
    from jsonb_array_elements(coalesce(p_notes, '[]'::jsonb)) as note
  ) mapping
  where draft.user_id = p_user_id and draft.id = mapping.draft_id;

  -- Citations follow the note, so a committed card can always be traced back to its source.
  insert into public.study_note_sources (note_id, source_id, user_id, locator, excerpt_hash)
  select draft.approved_note_id, draft.source_id, p_user_id, left(draft.citation, 500), null
  from public.study_drafts draft
  where draft.user_id = p_user_id
    and draft.id = any(p_draft_ids)
    and draft.source_id is not null
    and draft.approved_note_id is not null
  on conflict do nothing;

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
    'approvedCount', cardinality(v_note_ids),
    'deck', public.study_deck_summary_v1(p_user_id, p_deck_id)
  );
end;
$$;

revoke all on function public.approve_study_drafts_v1(
  uuid, uuid[], uuid, jsonb, jsonb, text, text, text
) from public, anon, authenticated;
grant execute on function public.approve_study_drafts_v1(
  uuid, uuid[], uuid, jsonb, jsonb, text, text, text
) to service_role;

create or replace function public.reject_study_drafts_v1(p_user_id uuid, p_draft_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_rejected integer := 0;
begin
  if p_user_id is null or p_draft_ids is null or cardinality(p_draft_ids) = 0 then
    raise exception using errcode = '22023', message = 'Study draft selection is required';
  end if;

  update public.study_drafts
  set status = 'rejected', updated_at = now()
  where user_id = p_user_id and id = any(p_draft_ids) and status = 'pending';
  get diagnostics v_rejected = row_count;

  return jsonb_build_object('status', 'accepted', 'rejectedCount', v_rejected);
end;
$$;

revoke all on function public.reject_study_drafts_v1(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.reject_study_drafts_v1(uuid, uuid[])
  to service_role;

-- Drafts and extracted source text hold user content, so they expire rather than accumulating.
create or replace function public.prune_study_drafts_v1(p_retention_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_expired integer := 0;
  v_sources integer := 0;
begin
  if p_retention_days is null or p_retention_days < 1 or p_retention_days > 365 then
    raise exception using errcode = '22023', message = 'Invalid Study draft retention request';
  end if;

  update public.study_drafts
  set status = 'expired', fields = '{}'::jsonb, citation = '', updated_at = now()
  where status = 'pending' and expires_at <= now();
  get diagnostics v_expired = row_count;

  delete from public.study_sources
  where retention = 'session'
    and created_at < now() - make_interval(days => p_retention_days)
    and not exists (
      select 1 from public.study_note_sources link where link.source_id = study_sources.id
    );
  get diagnostics v_sources = row_count;

  return jsonb_build_object('expiredDrafts', v_expired, 'deletedSources', v_sources);
end;
$$;

revoke all on function public.prune_study_drafts_v1(integer)
  from public, anon, authenticated;
grant execute on function public.prune_study_drafts_v1(integer)
  to service_role;

-- Private media bucket. Access is always through the server; no public reads, and no client-side
-- policies, matching the service-role-only pattern used by the rest of Study.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'study-media',
  'study-media',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
