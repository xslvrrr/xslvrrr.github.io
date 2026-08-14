alter table public.users
  add column if not exists tour_preferences jsonb;

comment on column public.users.tour_preferences is
  'Versioned guided-tour progress, announcement state, and related optional UX preferences.';
