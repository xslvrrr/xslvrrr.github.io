alter table public.users
  add column if not exists attendance_settings jsonb not null
  default '{"perfectEffectEnabled": true, "fillingEnabled": true}'::jsonb;

comment on column public.users.attendance_settings is
  'Synced attendance display preferences, including the perfect-attendance colour effect.';
