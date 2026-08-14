-- Normalized Study storage. Additive only; public.users.flashcard_sets remains intact.
-- Custom signed sessions use server service-role access, so browser roles receive no policies.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
alter extension pgcrypto set schema extensions;

alter table public.users
  add column if not exists flashcard_sets_revision bigint not null default 0;

create table if not exists public.study_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  parent_deck_id uuid,
  legacy_key text,
  title text not null,
  description text not null default '',
  pinned boolean not null default false,
  sort_order integer not null default 0,
  revision bigint not null default 1,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_decks_title_check check (char_length(btrim(title)) between 1 and 120),
  constraint study_decks_description_check check (char_length(description) <= 500),
  constraint study_decks_sort_order_check check (sort_order >= 0),
  constraint study_decks_revision_check check (revision >= 1),
  constraint study_decks_legacy_key_check check (legacy_key is null or char_length(legacy_key) between 1 and 240)
);

create unique index if not exists study_decks_id_user_unique
  on public.study_decks (id, user_id);
create unique index if not exists study_decks_user_legacy_unique
  on public.study_decks (user_id, legacy_key)
  where legacy_key is not null;
create index if not exists study_decks_user_order_idx
  on public.study_decks (user_id, pinned desc, sort_order, id)
  where deleted_at is null;
create index if not exists study_decks_user_updated_idx
  on public.study_decks (user_id, updated_at desc, id);

alter table public.study_decks
  drop constraint if exists study_decks_parent_owner_fkey;
alter table public.study_decks
  add constraint study_decks_parent_owner_fkey
  foreign key (parent_deck_id, user_id)
  references public.study_decks(id, user_id)
  on delete set null (parent_deck_id);

create table if not exists public.study_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  deck_id uuid not null,
  legacy_key text,
  note_type text not null default 'basic',
  schema_version integer not null default 1,
  fields jsonb not null,
  tags text[] not null default '{}'::text[],
  search_document tsvector generated always as (
    to_tsvector('simple', coalesce(fields ->> 'prompt', '') || ' ' || coalesce(fields ->> 'answer', ''))
  ) stored,
  content_hash text,
  source_kind text,
  revision bigint not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_notes_note_type_check check (
    note_type in ('basic', 'basic-reversed', 'typed', 'cloze', 'sequence', 'compare-contrast', 'application', 'image-occlusion')
  ),
  constraint study_notes_schema_version_check check (schema_version >= 1),
  constraint study_notes_fields_check check (jsonb_typeof(fields) = 'object'),
  constraint study_notes_tags_check check (cardinality(tags) <= 100),
  constraint study_notes_revision_check check (revision >= 1),
  constraint study_notes_legacy_key_check check (legacy_key is null or char_length(legacy_key) between 1 and 320)
);

create unique index if not exists study_notes_id_user_unique
  on public.study_notes (id, user_id);
create unique index if not exists study_notes_id_deck_user_unique
  on public.study_notes (id, deck_id, user_id);
create unique index if not exists study_notes_user_legacy_unique
  on public.study_notes (user_id, legacy_key)
  where legacy_key is not null;
create index if not exists study_notes_deck_updated_idx
  on public.study_notes (deck_id, user_id, updated_at desc, id)
  where deleted_at is null;
create index if not exists study_notes_user_tags_idx
  on public.study_notes using gin (tags);
create index if not exists study_notes_search_idx
  on public.study_notes using gin (search_document);

alter table public.study_notes
  drop constraint if exists study_notes_deck_owner_fkey;
alter table public.study_notes
  add constraint study_notes_deck_owner_fkey
  foreign key (deck_id, user_id)
  references public.study_decks(id, user_id)
  on delete cascade;

create table if not exists public.study_scheduler_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  deck_id uuid,
  name text not null default 'Balanced',
  algorithm text not null default 'fsrs',
  algorithm_version text not null,
  parameters_version text not null,
  parameters jsonb not null,
  desired_retention numeric(5,4) not null default 0.9000,
  maximum_interval_days integer not null default 36500,
  optimizer_status text not null default 'default',
  trained_through_at timestamptz,
  active boolean not null default true,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_scheduler_profiles_name_check check (char_length(btrim(name)) between 1 and 120),
  constraint study_scheduler_profiles_algorithm_check check (algorithm in ('fsrs', 'legacy-sm2-v1')),
  constraint study_scheduler_profiles_parameters_check check (jsonb_typeof(parameters) = 'object'),
  constraint study_scheduler_profiles_retention_check check (desired_retention between 0.7000 and 0.9900),
  constraint study_scheduler_profiles_interval_check check (maximum_interval_days between 1 and 36500),
  constraint study_scheduler_profiles_optimizer_check check (optimizer_status in ('default', 'pending', 'trained', 'failed')),
  constraint study_scheduler_profiles_revision_check check (revision >= 1)
);

create unique index if not exists study_scheduler_profiles_id_user_unique
  on public.study_scheduler_profiles (id, user_id);
create unique index if not exists study_scheduler_profiles_user_default_unique
  on public.study_scheduler_profiles (user_id)
  where deck_id is null and active;
create unique index if not exists study_scheduler_profiles_user_deck_unique
  on public.study_scheduler_profiles (user_id, deck_id)
  where deck_id is not null and active;

alter table public.study_scheduler_profiles
  drop constraint if exists study_scheduler_profiles_deck_owner_fkey;
alter table public.study_scheduler_profiles
  add constraint study_scheduler_profiles_deck_owner_fkey
  foreign key (deck_id, user_id)
  references public.study_decks(id, user_id)
  on delete cascade;

create table if not exists public.study_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  deck_id uuid not null,
  note_id uuid not null,
  scheduler_profile_id uuid,
  legacy_key text,
  template_key text not null,
  ordinal integer not null default 0,
  card_state text not null default 'new',
  is_suspended boolean not null default false,
  is_buried boolean not null default false,
  due_at timestamptz not null default now(),
  stability double precision not null default 0,
  difficulty double precision not null default 0,
  elapsed_days double precision not null default 0,
  scheduled_days double precision not null default 0,
  learning_steps integer not null default 0,
  repetitions integer not null default 0,
  lapses integer not null default 0,
  last_reviewed_at timestamptz,
  scheduler_name text not null default 'legacy-sm2-v1',
  scheduler_version text not null default '1',
  parameters_version text not null default 'legacy',
  scheduler_metadata jsonb not null default '{}'::jsonb,
  schedule_revision bigint not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_cards_template_key_check check (char_length(template_key) between 1 and 120),
  constraint study_cards_ordinal_check check (ordinal >= 0),
  constraint study_cards_state_check check (card_state in ('new', 'learning', 'review', 'relearning')),
  constraint study_cards_stability_check check (stability between 0 and 36500),
  constraint study_cards_difficulty_check check (difficulty between 0 and 10),
  constraint study_cards_elapsed_days_check check (elapsed_days between 0 and 36500),
  constraint study_cards_scheduled_days_check check (scheduled_days between 0 and 36500),
  constraint study_cards_learning_steps_check check (learning_steps between 0 and 100),
  constraint study_cards_repetitions_check check (repetitions between 0 and 1000000),
  constraint study_cards_lapses_check check (lapses between 0 and 1000000),
  constraint study_cards_scheduler_metadata_check check (jsonb_typeof(scheduler_metadata) = 'object'),
  constraint study_cards_schedule_revision_check check (schedule_revision >= 0),
  constraint study_cards_legacy_key_check check (legacy_key is null or char_length(legacy_key) between 1 and 400)
);

create unique index if not exists study_cards_id_user_unique
  on public.study_cards (id, user_id);
create unique index if not exists study_cards_note_template_unique
  on public.study_cards (note_id, template_key)
  where deleted_at is null;
create unique index if not exists study_cards_user_legacy_unique
  on public.study_cards (user_id, legacy_key)
  where legacy_key is not null;
create index if not exists study_cards_deck_order_idx
  on public.study_cards (deck_id, user_id, ordinal, id)
  where deleted_at is null;
create index if not exists study_cards_user_due_idx
  on public.study_cards (user_id, due_at, id)
  where deleted_at is null and not is_suspended and not is_buried;
create index if not exists study_cards_note_idx
  on public.study_cards (note_id, user_id);

alter table public.study_cards
  drop constraint if exists study_cards_deck_owner_fkey;
alter table public.study_cards
  add constraint study_cards_deck_owner_fkey
  foreign key (deck_id, user_id)
  references public.study_decks(id, user_id)
  on delete cascade;

alter table public.study_cards
  drop constraint if exists study_cards_note_owner_fkey;
alter table public.study_cards
  add constraint study_cards_note_owner_fkey
  foreign key (note_id, deck_id, user_id)
  references public.study_notes(id, deck_id, user_id)
  on delete cascade;

alter table public.study_cards
  drop constraint if exists study_cards_scheduler_profile_owner_fkey;
alter table public.study_cards
  add constraint study_cards_scheduler_profile_owner_fkey
  foreign key (scheduler_profile_id, user_id)
  references public.study_scheduler_profiles(id, user_id)
  on delete set null (scheduler_profile_id);

create table if not exists public.study_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  experience_mode text not null default 'beginner',
  desired_retention numeric(5,4) not null default 0.9000,
  daily_time_budget_minutes integer not null default 20,
  daily_new_limit integer not null default 20,
  daily_review_limit integer not null default 200,
  day_boundary_hour integer not null default 4,
  time_zone text not null default 'UTC',
  default_mixing_strategy text not null default 'adaptive',
  show_streaks boolean not null default true,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_preferences_mode_check check (experience_mode in ('beginner', 'intermediate', 'expert')),
  constraint study_preferences_retention_check check (desired_retention between 0.7000 and 0.9900),
  constraint study_preferences_time_budget_check check (daily_time_budget_minutes between 1 and 1440),
  constraint study_preferences_new_limit_check check (daily_new_limit between 0 and 1000),
  constraint study_preferences_review_limit_check check (daily_review_limit between 0 and 10000),
  constraint study_preferences_day_boundary_check check (day_boundary_hour between 0 and 23),
  constraint study_preferences_mixing_check check (default_mixing_strategy in ('adaptive', 'blocked', 'mixed')),
  constraint study_preferences_revision_check check (revision >= 1)
);

create table if not exists public.study_review_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  card_id uuid,
  card_reference_id uuid not null,
  session_id uuid,
  client_operation_id uuid,
  operation_fingerprint text,
  request jsonb,
  device_id uuid,
  event_kind text not null,
  rating text,
  reviewed_at timestamptz not null,
  received_at timestamptz not null default now(),
  duration_ms integer,
  response_mode text,
  before_state jsonb,
  after_state jsonb not null,
  scheduler_name text not null,
  scheduler_version text not null,
  parameters_version text not null,
  scheduler_profile_id uuid,
  target_event_id uuid,
  retrievability_before double precision,
  next_interval_seconds bigint,
  result jsonb not null,
  created_at timestamptz not null default now(),
  constraint study_review_events_kind_check check (event_kind in ('review', 'undo', 'migration', 'manual-reschedule')),
  constraint study_review_events_rating_check check (rating is null or rating in ('again', 'hard', 'good', 'easy')),
  constraint study_review_events_duration_check check (duration_ms is null or duration_ms between 0 and 3600000),
  constraint study_review_events_request_check check (request is null or jsonb_typeof(request) = 'object'),
  constraint study_review_events_before_state_check check (before_state is null or jsonb_typeof(before_state) = 'object'),
  constraint study_review_events_after_state_check check (jsonb_typeof(after_state) = 'object'),
  constraint study_review_events_result_check check (jsonb_typeof(result) = 'object'),
  constraint study_review_events_retrievability_check check (retrievability_before is null or retrievability_before between 0 and 1),
  constraint study_review_events_next_interval_check check (next_interval_seconds is null or next_interval_seconds >= 0),
  constraint study_review_events_semantics_check check (
    (event_kind = 'review' and rating is not null and before_state is not null and target_event_id is null)
    or (event_kind = 'undo' and rating is null and before_state is not null and target_event_id is not null)
    or (event_kind in ('migration', 'manual-reschedule') and rating is null)
  )
);

create unique index if not exists study_review_events_id_user_unique
  on public.study_review_events (id, user_id);
create unique index if not exists study_review_events_user_operation_unique
  on public.study_review_events (user_id, client_operation_id)
  where client_operation_id is not null;
create index if not exists study_review_events_user_reviewed_idx
  on public.study_review_events (user_id, reviewed_at desc, id);
create index if not exists study_review_events_card_reviewed_idx
  on public.study_review_events (card_id, reviewed_at desc, id)
  where card_id is not null;
create index if not exists study_review_events_target_idx
  on public.study_review_events (target_event_id, user_id)
  where target_event_id is not null;

alter table public.study_review_events
  drop constraint if exists study_review_events_card_owner_fkey;
alter table public.study_review_events
  add constraint study_review_events_card_owner_fkey
  foreign key (card_id, user_id)
  references public.study_cards(id, user_id)
  on delete set null (card_id);

alter table public.study_review_events
  drop constraint if exists study_review_events_target_owner_fkey;
alter table public.study_review_events
  add constraint study_review_events_target_owner_fkey
  foreign key (target_event_id, user_id)
  references public.study_review_events(id, user_id)
  on delete restrict;

create table if not exists public.study_sync_state (
  user_id uuid primary key references public.users(id) on delete cascade,
  current_cursor bigint not null default 0,
  minimum_cursor bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint study_sync_state_cursor_check check (current_cursor >= 0 and minimum_cursor >= 0 and minimum_cursor <= current_cursor)
);

create table if not exists public.study_sync_changes (
  user_id uuid not null references public.users(id) on delete cascade,
  cursor bigint not null,
  ordinal integer not null default 0,
  entity_kind text not null,
  entity_id uuid not null,
  operation text not null,
  revision bigint not null,
  changed_at timestamptz not null default now(),
  primary key (user_id, cursor, ordinal),
  constraint study_sync_changes_cursor_check check (cursor >= 1),
  constraint study_sync_changes_ordinal_check check (ordinal >= 0),
  constraint study_sync_changes_entity_check check (entity_kind in ('deck', 'note', 'card', 'preference', 'session', 'smart-session')),
  constraint study_sync_changes_operation_check check (operation in ('upsert', 'delete')),
  constraint study_sync_changes_revision_check check (revision >= 0)
);

create index if not exists study_sync_changes_user_entity_idx
  on public.study_sync_changes (user_id, entity_kind, entity_id, cursor desc);

create table if not exists public.study_migration_state (
  user_id uuid primary key references public.users(id) on delete cascade,
  schema_version integer not null default 1,
  status text not null default 'pending',
  source_checksum text,
  normalized_checksum text,
  expected_deck_count integer,
  expected_note_count integer,
  expected_card_count integer,
  expected_event_count integer,
  actual_deck_count integer,
  actual_note_count integer,
  actual_card_count integer,
  actual_event_count integer,
  attempt_count integer not null default 0,
  last_error_code text,
  lease_owner uuid,
  lease_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint study_migration_state_schema_check check (schema_version >= 1),
  constraint study_migration_state_status_check check (status in ('pending', 'backfilling', 'verified', 'cutover', 'failed')),
  constraint study_migration_state_counts_check check (
    coalesce(expected_deck_count, 0) >= 0
    and coalesce(expected_note_count, 0) >= 0
    and coalesce(expected_card_count, 0) >= 0
    and coalesce(expected_event_count, 0) >= 0
    and coalesce(actual_deck_count, 0) >= 0
    and coalesce(actual_note_count, 0) >= 0
    and coalesce(actual_card_count, 0) >= 0
    and coalesce(actual_event_count, 0) >= 0
    and attempt_count >= 0
  )
);

create table if not exists public.study_smart_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  query_text text not null,
  query_ast jsonb not null,
  ordering_strategy text not null default 'adaptive',
  configuration jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_smart_sessions_name_check check (char_length(btrim(name)) between 1 and 120),
  constraint study_smart_sessions_description_check check (char_length(description) <= 500),
  constraint study_smart_sessions_query_check check (char_length(query_text) between 1 and 4000 and jsonb_typeof(query_ast) = 'object'),
  constraint study_smart_sessions_order_check check (ordering_strategy in ('adaptive', 'blocked', 'mixed')),
  constraint study_smart_sessions_configuration_check check (jsonb_typeof(configuration) = 'object'),
  constraint study_smart_sessions_revision_check check (revision >= 1)
);

create unique index if not exists study_smart_sessions_id_user_unique
  on public.study_smart_sessions (id, user_id);
create index if not exists study_smart_sessions_user_updated_idx
  on public.study_smart_sessions (user_id, updated_at desc, id)
  where deleted_at is null;

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  smart_session_id uuid,
  status text not null default 'active',
  configuration_snapshot jsonb not null,
  scheduler_snapshot jsonb not null,
  queue_seed text not null,
  current_index integer not null default 0,
  revision bigint not null default 1,
  started_at timestamptz not null default now(),
  paused_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint study_sessions_status_check check (status in ('active', 'paused', 'completed', 'abandoned')),
  constraint study_sessions_configuration_check check (jsonb_typeof(configuration_snapshot) = 'object'),
  constraint study_sessions_scheduler_check check (jsonb_typeof(scheduler_snapshot) = 'object'),
  constraint study_sessions_seed_check check (char_length(queue_seed) between 1 and 200),
  constraint study_sessions_index_check check (current_index >= 0),
  constraint study_sessions_revision_check check (revision >= 1)
);

create unique index if not exists study_sessions_id_user_unique
  on public.study_sessions (id, user_id);
create index if not exists study_sessions_user_active_idx
  on public.study_sessions (user_id, updated_at desc, id)
  where status in ('active', 'paused');

alter table public.study_sessions
  drop constraint if exists study_sessions_smart_session_owner_fkey;
alter table public.study_sessions
  add constraint study_sessions_smart_session_owner_fkey
  foreign key (smart_session_id, user_id)
  references public.study_smart_sessions(id, user_id)
  on delete set null (smart_session_id);

create table if not exists public.study_session_cards (
  session_id uuid not null,
  user_id uuid not null,
  card_id uuid,
  card_reference_id uuid not null,
  position integer not null,
  status text not null default 'pending',
  review_event_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, position),
  constraint study_session_cards_position_check check (position >= 0),
  constraint study_session_cards_status_check check (status in ('pending', 'reviewed', 'skipped', 'removed'))
);

create unique index if not exists study_session_cards_session_card_unique
  on public.study_session_cards (session_id, card_reference_id);

alter table public.study_session_cards
  drop constraint if exists study_session_cards_session_owner_fkey;
alter table public.study_session_cards
  add constraint study_session_cards_session_owner_fkey
  foreign key (session_id, user_id)
  references public.study_sessions(id, user_id)
  on delete cascade;

alter table public.study_session_cards
  drop constraint if exists study_session_cards_card_owner_fkey;
alter table public.study_session_cards
  add constraint study_session_cards_card_owner_fkey
  foreign key (card_id, user_id)
  references public.study_cards(id, user_id)
  on delete set null (card_id);

alter table public.study_session_cards
  drop constraint if exists study_session_cards_review_owner_fkey;
alter table public.study_session_cards
  add constraint study_session_cards_review_owner_fkey
  foreign key (review_event_id, user_id)
  references public.study_review_events(id, user_id)
  on delete set null (review_event_id);

alter table public.study_review_events
  drop constraint if exists study_review_events_session_owner_fkey;
alter table public.study_review_events
  add constraint study_review_events_session_owner_fkey
  foreign key (session_id, user_id)
  references public.study_sessions(id, user_id)
  on delete set null (session_id);

create index if not exists study_decks_parent_idx
  on public.study_decks (parent_deck_id, user_id)
  where parent_deck_id is not null;
create index if not exists study_scheduler_profiles_deck_idx
  on public.study_scheduler_profiles (deck_id, user_id)
  where deck_id is not null;
create index if not exists study_cards_scheduler_profile_idx
  on public.study_cards (scheduler_profile_id, user_id)
  where scheduler_profile_id is not null;
create index if not exists study_sessions_smart_session_idx
  on public.study_sessions (smart_session_id, user_id)
  where smart_session_id is not null;
create index if not exists study_session_cards_card_idx
  on public.study_session_cards (card_id, user_id)
  where card_id is not null;
create index if not exists study_session_cards_review_idx
  on public.study_session_cards (review_event_id, user_id)
  where review_event_id is not null;

alter table public.study_decks enable row level security;
alter table public.study_notes enable row level security;
alter table public.study_cards enable row level security;
alter table public.study_review_events enable row level security;
alter table public.study_preferences enable row level security;
alter table public.study_scheduler_profiles enable row level security;
alter table public.study_sync_state enable row level security;
alter table public.study_sync_changes enable row level security;
alter table public.study_migration_state enable row level security;
alter table public.study_smart_sessions enable row level security;
alter table public.study_sessions enable row level security;
alter table public.study_session_cards enable row level security;

revoke all on table public.study_decks from public, anon, authenticated;
revoke all on table public.study_notes from public, anon, authenticated;
revoke all on table public.study_cards from public, anon, authenticated;
revoke all on table public.study_review_events from public, anon, authenticated;
revoke all on table public.study_preferences from public, anon, authenticated;
revoke all on table public.study_scheduler_profiles from public, anon, authenticated;
revoke all on table public.study_sync_state from public, anon, authenticated;
revoke all on table public.study_sync_changes from public, anon, authenticated;
revoke all on table public.study_migration_state from public, anon, authenticated;
revoke all on table public.study_smart_sessions from public, anon, authenticated;
revoke all on table public.study_sessions from public, anon, authenticated;
revoke all on table public.study_session_cards from public, anon, authenticated;

grant select, insert, update, delete on table public.study_decks to service_role;
grant select, insert, update, delete on table public.study_notes to service_role;
grant select, insert, update, delete on table public.study_cards to service_role;
grant select, insert on table public.study_review_events to service_role;
grant select, insert, update, delete on table public.study_preferences to service_role;
grant select, insert, update, delete on table public.study_scheduler_profiles to service_role;
grant select, insert, update, delete on table public.study_sync_state to service_role;
grant select, insert, update, delete on table public.study_sync_changes to service_role;
grant select, insert, update, delete on table public.study_migration_state to service_role;
grant select, insert, update, delete on table public.study_smart_sessions to service_role;
grant select, insert, update, delete on table public.study_sessions to service_role;
grant select, insert, update, delete on table public.study_session_cards to service_role;
