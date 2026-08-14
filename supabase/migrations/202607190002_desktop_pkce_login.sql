alter table public.login_tokens
  add column if not exists code_challenge text;

alter table public.login_tokens
  drop constraint if exists login_tokens_code_challenge_format;

alter table public.login_tokens
  add constraint login_tokens_code_challenge_format
  check (code_challenge is null or code_challenge ~ '^[A-Za-z0-9_-]{43}$');

create or replace function public.consume_login_token(p_token uuid)
returns table (user_id uuid)
language sql
security definer
set search_path = public
as $$
  delete from public.login_tokens
  where token = p_token
    and code_challenge is null
    and expires_at > now()
  returning login_tokens.user_id;
$$;

create or replace function public.consume_desktop_login_token(
  p_token uuid,
  p_code_verifier text
)
returns table (user_id uuid)
language sql
security definer
set search_path = public, extensions
as $$
  delete from public.login_tokens
  where token = p_token
    and code_challenge is not null
    and expires_at > now()
    and code_challenge = translate(
      rtrim(encode(digest(convert_to(p_code_verifier, 'UTF8'), 'sha256'), 'base64'), '='),
      '+/',
      '-_'
    )
  returning login_tokens.user_id;
$$;

revoke all on function public.consume_desktop_login_token(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_desktop_login_token(uuid, text) to service_role;
