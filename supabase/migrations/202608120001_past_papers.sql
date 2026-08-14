-- Past papers: a shared catalogue plus per-student saves, folders, ladders and attempts.
--
-- Two halves with different ownership, and the split is deliberate. `past_papers` is one global
-- index built by the server from public sources; every student reads the same rows and nobody
-- writes them from a request. Everything else is user-scoped and follows the same shape as study:
-- service-role access only, foreign keys carrying the owner so a row can never be re-parented onto
-- another account.
--
-- Nothing here stores a document. A paper is a pointer until a student saves it, at which point
-- `past_paper_saves.storage_path` records the copy we fetched on their behalf. That is a licensing
-- boundary as much as a bandwidth one - see docs/past-papers-sources.md.

create table if not exists public.past_paper_sources (
  slug text primary key,
  name text not null,
  homepage text not null default '',
  -- Free text rather than an enum: these are other people's terms and they change without notice.
  licence_summary text not null default '',
  -- Sources whose terms need an operator decision ship disabled and are turned on deliberately.
  enabled boolean not null default false,
  last_indexed_at timestamptz,
  last_index_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint past_paper_sources_slug_check check (char_length(btrim(slug)) between 2 and 40),
  constraint past_paper_sources_name_check check (char_length(btrim(name)) between 1 and 120)
);

create table if not exists public.past_papers (
  id uuid primary key default gen_random_uuid(),
  source_slug text not null references public.past_paper_sources(slug) on delete cascade,
  -- Stable within the source, so re-indexing updates a row rather than duplicating it.
  external_key text not null,
  year_level text not null,
  category text not null,
  subject text not null,
  subject_slug text not null,
  school text,
  year integer,
  title text not null,
  document_kind text not null default 'paper',
  bundled_solutions boolean not null default false,
  has_solutions boolean not null default false,
  -- PaperResource[]: where this document can be obtained, and whether we may fetch it ourselves.
  resources jsonb not null default '[]'::jsonb,
  source_url text not null default '',
  syllabus_era_id text,
  duration_minutes integer,
  reading_minutes integer,
  -- Which authority the timing came from, so the timer can say whether it read it or assumed it.
  duration_source text not null default 'unknown',
  total_marks integer,
  page_count integer,
  -- PaperDifficulty, including its rationale and citations. Null until there is evidence.
  difficulty jsonb,
  tags jsonb not null default '[]'::jsonb,
  -- Denormalised counters behind the "picked for you" row and the relevance sort.
  save_count integer not null default 0,
  attempt_count integer not null default 0,
  indexed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint past_papers_year_level_check check (year_level in ('yr9', 'yr10', 'yr11', 'yr12')),
  constraint past_papers_category_check check (category in ('hsc', 'trial', 'assessment', 'prelim', 'other')),
  constraint past_papers_document_kind_check check (document_kind in (
    'paper', 'solutions', 'marking_guidelines', 'sample_answers', 'marking_feedback', 'notes', 'unknown'
  )),
  constraint past_papers_duration_source_check check (duration_source in ('document', 'subject-default', 'unknown')),
  constraint past_papers_title_check check (char_length(btrim(title)) between 1 and 300),
  constraint past_papers_year_check check (year is null or year between 1950 and 2100),
  constraint past_papers_duration_check check (duration_minutes is null or duration_minutes between 1 and 600),
  constraint past_papers_reading_check check (reading_minutes is null or reading_minutes between 0 and 120),
  constraint past_papers_marks_check check (total_marks is null or total_marks between 1 and 500),
  constraint past_papers_counts_check check (save_count >= 0 and attempt_count >= 0)
);

create unique index if not exists past_papers_source_key_unique
  on public.past_papers (source_slug, external_key);
-- The browser's primary path: a year level and subject, then narrowed by category and year.
create index if not exists past_papers_browse_idx
  on public.past_papers (year_level, subject_slug, category, year desc nulls last);
create index if not exists past_papers_school_idx
  on public.past_papers (school, year desc nulls last)
  where school is not null;
create index if not exists past_papers_popularity_idx
  on public.past_papers (save_count desc, attempt_count desc, year desc nulls last);

-- Free-text search across the fields a student would actually type: subject, school, year, title.
-- Weighted so a subject match outranks an incidental title match on the same word.
alter table public.past_papers
  drop column if exists search_vector;
alter table public.past_papers
  add column search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(subject, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(school, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(title, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(year::text, '')), 'C')
  ) stored;

create index if not exists past_papers_search_idx on public.past_papers using gin (search_vector);

-- --------------------------------------------------------------------------------------------
-- Per-student state
-- --------------------------------------------------------------------------------------------

create table if not exists public.past_paper_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  parent_id uuid,
  name text not null,
  color text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint past_paper_folders_name_check check (char_length(btrim(name)) between 1 and 80),
  constraint past_paper_folders_color_check check (char_length(color) <= 32),
  constraint past_paper_folders_position_check check (position between 0 and 10000),
  -- A folder cannot be its own parent. Deeper cycles are prevented in the service, which is the
  -- only writer and already walks the tree to compute depth.
  constraint past_paper_folders_parent_check check (parent_id is distinct from id)
);

create unique index if not exists past_paper_folders_id_user_unique
  on public.past_paper_folders (id, user_id);
create index if not exists past_paper_folders_user_idx
  on public.past_paper_folders (user_id, parent_id nulls first, position, id);

-- The parent must belong to the same student, enforced by the key rather than by the service.
alter table public.past_paper_folders
  drop constraint if exists past_paper_folders_parent_owner_fkey;
alter table public.past_paper_folders
  add constraint past_paper_folders_parent_owner_fkey
  foreign key (parent_id, user_id)
  references public.past_paper_folders(id, user_id)
  on delete set null (parent_id);

create table if not exists public.past_paper_saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  paper_id uuid not null references public.past_papers(id) on delete cascade,
  folder_id uuid,
  starred boolean not null default false,
  -- Set once the document has actually been fetched. Null means saved but not yet downloaded,
  -- which is the state every save starts in.
  storage_path text,
  cached_at timestamptz,
  cached_bytes integer,
  cache_error text,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint past_paper_saves_note_check check (char_length(note) <= 2000),
  constraint past_paper_saves_bytes_check check (cached_bytes is null or cached_bytes >= 0)
);

create unique index if not exists past_paper_saves_user_paper_unique
  on public.past_paper_saves (user_id, paper_id);
create unique index if not exists past_paper_saves_id_user_unique
  on public.past_paper_saves (id, user_id);
create index if not exists past_paper_saves_folder_idx
  on public.past_paper_saves (user_id, folder_id, updated_at desc);

alter table public.past_paper_saves
  drop constraint if exists past_paper_saves_folder_owner_fkey;
alter table public.past_paper_saves
  add constraint past_paper_saves_folder_owner_fkey
  foreign key (folder_id, user_id)
  references public.past_paper_folders(id, user_id)
  on delete set null (folder_id);

-- A difficulty ladder is an ordered run of papers: the point is the order, so position carries the
-- meaning and the steps are worthless detached from their ladder.
create table if not exists public.past_paper_ladders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  subject_slug text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint past_paper_ladders_title_check check (char_length(btrim(title)) between 1 and 120),
  constraint past_paper_ladders_description_check check (char_length(description) <= 1000)
);

create unique index if not exists past_paper_ladders_id_user_unique
  on public.past_paper_ladders (id, user_id);
create index if not exists past_paper_ladders_user_idx
  on public.past_paper_ladders (user_id, updated_at desc, id);

create table if not exists public.past_paper_ladder_steps (
  id uuid primary key default gen_random_uuid(),
  ladder_id uuid not null,
  user_id uuid not null references public.users(id) on delete cascade,
  paper_id uuid not null references public.past_papers(id) on delete cascade,
  position integer not null default 0,
  target_minutes integer,
  note text not null default '',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint past_paper_ladder_steps_position_check check (position between 0 and 500),
  constraint past_paper_ladder_steps_note_check check (char_length(note) <= 500),
  constraint past_paper_ladder_steps_minutes_check check (target_minutes is null or target_minutes between 1 and 600)
);

alter table public.past_paper_ladder_steps
  drop constraint if exists past_paper_ladder_steps_ladder_owner_fkey;
alter table public.past_paper_ladder_steps
  add constraint past_paper_ladder_steps_ladder_owner_fkey
  foreign key (ladder_id, user_id)
  references public.past_paper_ladders(id, user_id)
  on delete cascade;

create index if not exists past_paper_ladder_steps_order_idx
  on public.past_paper_ladder_steps (ladder_id, position, id);

-- Timed attempts. These are the cohort evidence behind difficulty and behind "picked for you",
-- so they record what actually happened rather than only that something happened.
create table if not exists public.past_paper_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  paper_id uuid not null references public.past_papers(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  -- The allowance the student ran against, which may differ from the paper's stated time.
  duration_seconds integer not null,
  elapsed_seconds integer not null default 0,
  completed boolean not null default false,
  self_rating integer,
  score_awarded integer,
  score_total integer,
  note text not null default '',
  created_at timestamptz not null default now(),
  constraint past_paper_attempts_duration_check check (duration_seconds between 60 and 36000),
  constraint past_paper_attempts_elapsed_check check (elapsed_seconds between 0 and 86400),
  constraint past_paper_attempts_rating_check check (self_rating is null or self_rating between 1 and 5),
  constraint past_paper_attempts_score_check check (
    (score_awarded is null and score_total is null)
    or (score_awarded >= 0 and score_total > 0 and score_awarded <= score_total)
  ),
  constraint past_paper_attempts_note_check check (char_length(note) <= 2000)
);

create index if not exists past_paper_attempts_user_idx
  on public.past_paper_attempts (user_id, started_at desc, id);
create index if not exists past_paper_attempts_paper_idx
  on public.past_paper_attempts (paper_id, completed, started_at desc);

create table if not exists public.past_paper_annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  paper_id uuid not null references public.past_papers(id) on delete cascade,
  -- The whole annotation set for one paper, stored as one row. Marks are read and written as a
  -- unit by the viewer and never queried individually, so a row per stroke would buy nothing and
  -- cost a round trip per pen stroke.
  annotations jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint past_paper_annotations_size_check check (pg_column_size(annotations) <= 4 * 1024 * 1024)
);

create unique index if not exists past_paper_annotations_user_paper_unique
  on public.past_paper_annotations (user_id, paper_id);

-- Share codes, matching the study deck sharing model so a student learns one mechanism.
create table if not exists public.past_paper_publications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  kind text not null,
  folder_id uuid,
  ladder_id uuid,
  title text not null,
  description text not null default '',
  share_code text not null,
  -- A snapshot of the shared papers taken at publish time. A subscriber gets what was shared, not
  -- whatever the owner's folder happens to contain later.
  payload jsonb not null default '{}'::jsonb,
  current_version integer not null default 1,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint past_paper_publications_kind_check check (kind in ('folder', 'ladder')),
  constraint past_paper_publications_title_check check (char_length(btrim(title)) between 1 and 120),
  constraint past_paper_publications_description_check check (char_length(description) <= 500),
  constraint past_paper_publications_code_check check (char_length(share_code) between 8 and 64),
  constraint past_paper_publications_version_check check (current_version >= 1),
  constraint past_paper_publications_target_check check (
    (kind = 'folder' and folder_id is not null and ladder_id is null)
    or (kind = 'ladder' and ladder_id is not null and folder_id is null)
  )
);

create unique index if not exists past_paper_publications_code_unique
  on public.past_paper_publications (share_code);
create index if not exists past_paper_publications_owner_idx
  on public.past_paper_publications (owner_id, updated_at desc, id);

alter table public.past_paper_publications
  drop constraint if exists past_paper_publications_folder_owner_fkey;
alter table public.past_paper_publications
  add constraint past_paper_publications_folder_owner_fkey
  foreign key (folder_id, owner_id)
  references public.past_paper_folders(id, user_id)
  on delete cascade;

alter table public.past_paper_publications
  drop constraint if exists past_paper_publications_ladder_owner_fkey;
alter table public.past_paper_publications
  add constraint past_paper_publications_ladder_owner_fkey
  foreign key (ladder_id, owner_id)
  references public.past_paper_ladders(id, user_id)
  on delete cascade;

create table if not exists public.past_paper_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint past_paper_preferences_size_check check (pg_column_size(settings) <= 64 * 1024)
);

-- --------------------------------------------------------------------------------------------
-- Access
--
-- Every table is reached through the service-role client behind an authenticated route, matching
-- the rest of the schema. RLS is enabled with no policy so a leaked anon or authenticated key
-- reaches nothing, rather than relying on the grants alone.
-- --------------------------------------------------------------------------------------------

alter table public.past_paper_sources enable row level security;
alter table public.past_papers enable row level security;
alter table public.past_paper_folders enable row level security;
alter table public.past_paper_saves enable row level security;
alter table public.past_paper_ladders enable row level security;
alter table public.past_paper_ladder_steps enable row level security;
alter table public.past_paper_attempts enable row level security;
alter table public.past_paper_annotations enable row level security;
alter table public.past_paper_publications enable row level security;
alter table public.past_paper_preferences enable row level security;

revoke all on table public.past_paper_sources from public, anon, authenticated;
revoke all on table public.past_papers from public, anon, authenticated;
revoke all on table public.past_paper_folders from public, anon, authenticated;
revoke all on table public.past_paper_saves from public, anon, authenticated;
revoke all on table public.past_paper_ladders from public, anon, authenticated;
revoke all on table public.past_paper_ladder_steps from public, anon, authenticated;
revoke all on table public.past_paper_attempts from public, anon, authenticated;
revoke all on table public.past_paper_annotations from public, anon, authenticated;
revoke all on table public.past_paper_publications from public, anon, authenticated;
revoke all on table public.past_paper_preferences from public, anon, authenticated;

grant select, insert, update, delete on table public.past_paper_sources to service_role;
grant select, insert, update, delete on table public.past_papers to service_role;
grant select, insert, update, delete on table public.past_paper_folders to service_role;
grant select, insert, update, delete on table public.past_paper_saves to service_role;
grant select, insert, update, delete on table public.past_paper_ladders to service_role;
grant select, insert, update, delete on table public.past_paper_ladder_steps to service_role;
grant select, insert, update, delete on table public.past_paper_attempts to service_role;
grant select, insert, update, delete on table public.past_paper_annotations to service_role;
grant select, insert, update, delete on table public.past_paper_publications to service_role;
grant select, insert, update, delete on table public.past_paper_preferences to service_role;

-- Seed the source registry. THSC starts disabled: its terms treat a substantial reproduction as
-- needing informal permission and restrict use to non-commercial education, so enabling it is an
-- operator decision recorded here rather than a default.
insert into public.past_paper_sources (slug, name, homepage, licence_summary, enabled)
values
  (
    'nesa',
    'NESA / Board of Studies',
    'https://educationstandards.nsw.edu.au/',
    'Official NSW exam papers published for public use by the curriculum authority.',
    true
  ),
  (
    'thsc',
    'THSC Online',
    'https://thsconline.github.io/s/',
    'Catalogue read from the public thsconline/s repository. Documents are never mirrored: '
      || 'official papers resolve to NESA URLs and school trials link back to THSC. '
      || 'Non-commercial educational use; substantial reproduction needs permission.',
    false
  )
on conflict (slug) do update
  set name = excluded.name,
      homepage = excluded.homepage,
      licence_summary = excluded.licence_summary,
      updated_at = now();
