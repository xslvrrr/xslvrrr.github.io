-- User-owned AI provider credentials. Secrets remain encrypted by application code.
-- Server service-role access only.

create table if not exists public.assistant_provider_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null,
  auth_mode text not null default 'api-key',
  label text not null,
  model text not null,
  key_hint text not null,
  credential_envelope jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_provider_connections_provider_check
    check (provider in ('openai', 'anthropic', 'openrouter')),
  constraint assistant_provider_connections_auth_mode_check
    check (
      auth_mode = 'api-key'
      or (provider = 'anthropic' and auth_mode = 'oauth-token')
    ),
  constraint assistant_provider_connections_label_length_check
    check (char_length(label) between 1 and 60),
  constraint assistant_provider_connections_model_length_check
    check (char_length(model) between 1 and 160),
  unique (user_id, provider)
);

create index if not exists assistant_provider_connections_user_idx
  on public.assistant_provider_connections (user_id, created_at);

alter table public.assistant_provider_connections enable row level security;
revoke all on table public.assistant_provider_connections from public, anon, authenticated;

