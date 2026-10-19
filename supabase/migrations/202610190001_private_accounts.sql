-- One encrypted Vault document per authenticated user. No caller-supplied owner IDs.
create table public.playnext_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  vault_secret_id uuid not null unique references vault.secrets(id),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.playnext_accounts enable row level security;
create policy own_account on public.playnext_accounts for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.playnext_accounts from anon, authenticated;
grant select(user_id, revision, created_at, updated_at) on public.playnext_accounts to authenticated;
revoke all on schema vault from anon, authenticated;
revoke all on all tables in schema vault from anon, authenticated;
-- Vault internal crypto functions retain provider privileges. The schema is not exposed
-- by PostgREST and application roles have no USAGE on it.

create function public.playnext_load() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); result jsonb;
begin
  if owner_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select jsonb_build_object('revision', a.revision, 'data', s.decrypted_secret::jsonb)
    into result from public.playnext_accounts a
    join vault.decrypted_secrets s on s.id = a.vault_secret_id
    where a.user_id = owner_id;
  return coalesce(result, jsonb_build_object('revision', 0, 'data', null));
end;
$$;

create function public.playnext_save(p_state jsonb, p_revision bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); account public.playnext_accounts; secret_id uuid;
begin
  if owner_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_state is null or jsonb_typeof(p_state) is distinct from 'object'
    or octet_length(p_state::text) > 4194304
    or not (p_state ?& array['v','rawg_key','history','filters'])
    or (p_state - array['v','rawg_key','history','filters']) <> '{}'::jsonb
    or p_state->>'v' is distinct from '1'
    or jsonb_typeof(p_state->'history') is distinct from 'array'
    or jsonb_typeof(p_state->'filters') is distinct from 'object'
    or jsonb_typeof(p_state->'filters'->'platforms') is distinct from 'array'
    or jsonb_typeof(p_state->'filters'->'genre') is distinct from 'string'
    or jsonb_typeof(p_state->'rawg_key') not in ('string','null')
    or length(coalesce(p_state->>'rawg_key','')) > 256
  then raise exception 'INVALID_STATE' using errcode = '22023'; end if;
  if jsonb_array_length(p_state->'history') > 5000
    or jsonb_array_length(p_state->'filters'->'platforms') > 10
    or exists (select 1 from jsonb_array_elements(p_state->'history') e
      where jsonb_typeof(e) <> 'object' or coalesce(e->>'status','') not in ('yes','no','played')
        or jsonb_typeof(e->'game') is distinct from 'object'
        or jsonb_typeof(e->'game'->'id') is distinct from 'number'
        or jsonb_typeof(e->'game'->'name') is distinct from 'string'
        or jsonb_typeof(e->'game'->'slug') is distinct from 'string'
        or jsonb_typeof(e->'game'->'genres') is distinct from 'array'
        or jsonb_typeof(e->'game'->'platforms') is distinct from 'array')
  then raise exception 'INVALID_STATE' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  select * into account from public.playnext_accounts where user_id = owner_id for update;
  if coalesce(account.revision, 0) <> p_revision or p_revision is null then
    raise exception 'REVISION_CONFLICT' using errcode = '40001';
  end if;
  if account.user_id is null then
    secret_id := vault.create_secret(p_state::text, 'playnext:' || owner_id::text, 'PlayNext encrypted private state');
    insert into public.playnext_accounts(user_id, vault_secret_id) values (owner_id, secret_id);
    return 1;
  end if;
  perform vault.update_secret(account.vault_secret_id, p_state::text);
  update public.playnext_accounts set revision = revision + 1, updated_at = now() where user_id = owner_id
    returning revision into account.revision;
  return account.revision;
end;
$$;

-- Cascades also run when an administrator removes a user through Supabase Auth.
create function public.playnext_cleanup_secret() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from vault.secrets where id = old.vault_secret_id;
  return old;
end;
$$;
create trigger playnext_cleanup after delete on public.playnext_accounts
  for each row execute function public.playnext_cleanup_secret();

create function public.playnext_delete_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.playnext_load() from public, anon;
revoke all on function public.playnext_save(jsonb,bigint) from public, anon;
revoke all on function public.playnext_delete_account() from public, anon;
revoke all on function public.playnext_cleanup_secret() from public, anon, authenticated;
grant execute on function public.playnext_load(), public.playnext_save(jsonb,bigint),
  public.playnext_delete_account() to authenticated;
