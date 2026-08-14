alter table public.users
  add column if not exists animation_settings jsonb;

comment on column public.users.animation_settings is
  'Synced dashboard animation settings and user-authored animation curves.';
