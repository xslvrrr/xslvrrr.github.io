-- This application does not create Supabase Realtime subscriptions. Keeping
-- these write-heavy tables in the publication adds WAL/Realtime work with no
-- client consumer.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'users',
    'login_tokens',
    'extension_installations',
    'classroom_data',
    'portal_sync_leases',
    'api_rate_limits'
  ]
  loop
    if exists (
      select 1
      from pg_publication_tables as published
      where published.pubname = 'supabase_realtime'
        and published.schemaname = 'public'
        and published.tablename = table_name
    ) then
      execute format(
        'alter publication supabase_realtime drop table %I.%I',
        'public',
        table_name
      );
    end if;
  end loop;
end
$$;
