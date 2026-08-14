-- Study, flashcard, AI usage, and Stripe entitlement state.
-- Server service-role access only.

alter table public.users add column if not exists flashcard_sets jsonb not null default '[]'::jsonb;
alter table public.users add column if not exists stripe_customer_id text;
alter table public.users add column if not exists stripe_subscription_id text;
alter table public.users add column if not exists subscription_tier text not null default 'free';
alter table public.users add column if not exists subscription_status text not null default 'inactive';
alter table public.users add column if not exists subscription_current_period_end timestamptz;
alter table public.users add column if not exists subscription_cancel_at_period_end boolean not null default false;

create unique index if not exists users_stripe_customer_id_unique
  on public.users (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists users_stripe_subscription_id_unique
  on public.users (stripe_subscription_id)
  where stripe_subscription_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_subscription_tier_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_subscription_tier_check
      check (subscription_tier in ('free', 'study', 'frontier'));
  end if;
end
$$;

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  feature text not null,
  model_id text not null,
  provider_model text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  cost_usd numeric(12, 8) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_user_created_idx
  on public.ai_usage (user_id, created_at desc);

create table if not exists public.study_trial_uses (
  user_id uuid primary key references public.users(id) on delete cascade,
  reservation_id uuid not null default gen_random_uuid(),
  status text not null default 'pending',
  provider_model text,
  result jsonb,
  cost_usd numeric(12, 8),
  created_at timestamptz not null default now(),
  used_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint study_trial_status_check check (status in ('pending', 'completed', 'failed'))
);

create table if not exists public.stripe_events (
  event_id text primary key,
  event_type text not null,
  livemode boolean not null default false,
  processed_at timestamptz not null default now()
);

alter table public.ai_usage enable row level security;
alter table public.study_trial_uses enable row level security;
alter table public.stripe_events enable row level security;

revoke all on table public.ai_usage from anon, authenticated;
revoke all on table public.study_trial_uses from anon, authenticated;
revoke all on table public.stripe_events from anon, authenticated;

