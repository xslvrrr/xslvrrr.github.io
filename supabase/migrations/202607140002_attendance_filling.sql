update public.users
set attendance_settings = coalesce(attendance_settings, '{}'::jsonb)
  || '{"fillingEnabled": true}'::jsonb
where not (coalesce(attendance_settings, '{}'::jsonb) ? 'fillingEnabled');

alter table public.users
  alter column attendance_settings
  set default '{"perfectEffectEnabled": true, "fillingEnabled": true}'::jsonb;
