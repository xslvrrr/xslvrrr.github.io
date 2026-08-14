# Administrator tools

Administrator access is stored in `public.users.role`. Browser session data only controls visibility; every administrator API request checks current database state, and mutation RPCs check it again.

## First administrator

Apply `supabase/migrations/202607240003_administrator_status.sql`, then promote one trusted user by UUID in the Supabase SQL editor:

```sql
update public.users
set role = 'admin'
where id = '<trusted-user-uuid>';
```

Do not automatically promote the oldest account or accept administrator status from cookies, request bodies, or user-editable metadata.

## Included controls

- Search and paginate user accounts.
- Grant or remove administrator access.
- Inspect plan, trial, sync, and current-month AI usage state.
- Reset current-month AI usage limits and assistant rate limits.
- Reset frontier trial eligibility without deleting recorded AI usage cost.
- Clear pending assistant action approvals with an AI-limit reset.
- Record privileged mutations in `public.admin_audit_log`.

Self-demotion is blocked. Removing the final administrator is blocked.
