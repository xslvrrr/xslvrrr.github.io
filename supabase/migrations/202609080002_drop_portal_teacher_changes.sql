-- Drops the teacher-change table and RPCs added by 202608210004.
--
-- Detection moved to `lib/portal-class-changes.ts`, which reads the portal homepage card and the
-- dated timetable references now held in `portal_data`. A change is therefore derivable from the
-- snapshot whenever it is asked for, so these rows were a cache of a pure function; the
-- acknowledgement stored beside them is the dashboard's own review queue instead.
--
-- Nothing references these rows, and the RPC being dropped already discarded them after 120 days,
-- so this loses nothing that could still be shown to a student.

drop function if exists public.acknowledge_portal_teacher_changes(uuid, text[]);
drop function if exists public.record_portal_teacher_changes(uuid, jsonb);
drop table if exists public.portal_teacher_changes;
