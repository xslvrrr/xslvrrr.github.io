-- Tie Classroom rows to users, remove unsafe legacy global rows, and record retention.
alter table public.classroom_data add column if not exists user_id uuid;
alter table public.classroom_data add column if not exists created_at timestamptz not null default now();
alter table public.classroom_data add column if not exists updated_at timestamptz not null default now();
alter table public.classroom_data add column if not exists retention_expires_at timestamptz
  not null default (now() + interval '365 days');

update public.classroom_data
set retention_expires_at = least(coalesce(last_updated, updated_at, created_at, now()), now()) + interval '365 days';

update public.classroom_data as classroom
set user_id = app_user.id
from public.users as app_user
where classroom.user_id is null
  and classroom.scope = app_user.id::text;

-- Old global or otherwise unowned rows cannot be safely attributed to a user.
delete from public.classroom_data where user_id is null;

alter table public.classroom_data alter column user_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'classroom_data_user_id_fkey'
      and conrelid = 'public.classroom_data'::regclass
  ) then
    alter table public.classroom_data
      add constraint classroom_data_user_id_fkey
      foreign key (user_id) references public.users(id) on delete cascade;
  end if;
end
$$;

create unique index if not exists classroom_data_user_id_unique
  on public.classroom_data (user_id);
create index if not exists classroom_data_retention_expires_at_idx
  on public.classroom_data (retention_expires_at);

create or replace function public.delete_expired_classroom_data()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count bigint;
begin
  delete from public.classroom_data
  where retention_expires_at <= now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.delete_expired_classroom_data() from public, anon, authenticated;
grant execute on function public.delete_expired_classroom_data() to service_role;

select public.delete_expired_classroom_data();
