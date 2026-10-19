-- Run with a database administrator through the Supabase MCP. All fixtures roll back.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); secret_id uuid; n bigint;
  state jsonb := '{"v":1,"rawg_key":"synthetic-rawg-secret-never-real","history":[],"filters":{"platforms":[],"genre":""}}';
begin
  insert into auth.users(id, aud, role) values (a,'authenticated','authenticated'), (b,'authenticated','authenticated');
  perform set_config('request.jwt.claim.sub', a::text, true);
  n := public.playnext_save(state, 0);
  assert n = 1, 'initial revision';
  assert public.playnext_load()->'data' = state, 'encrypted round trip';
  select vault_secret_id into secret_id from public.playnext_accounts where user_id = a;
  assert exists(select 1 from vault.secrets where id=secret_id and secret not like '%synthetic-rawg-secret-never-real%'), 'ciphertext at rest';
  assert not has_schema_privilege('authenticated','vault','usage'), 'no authenticated vault access';
  assert not has_table_privilege('anon','public.playnext_accounts','select'), 'no anonymous metadata access';
  assert not has_function_privilege('anon','public.playnext_load()','execute'), 'no anonymous RPC';
  begin
    perform public.playnext_save(state, 0);
    raise exception 'stale revision accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.playnext_save(state || '{"filters":{}}', 1);
    raise exception 'invalid shape accepted';
  exception when invalid_parameter_value then null; end;
  perform set_config('request.jwt.claim.sub', b::text, true);
  assert public.playnext_load()->'data' = 'null'::jsonb, 'second user cannot load first user';
  perform public.playnext_save(state || '{"rawg_key":"other-synthetic-key"}', 0);
  assert public.playnext_load()->'data'->>'rawg_key' = 'other-synthetic-key', 'second owner isolation';
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform public.playnext_delete_account();
  assert not exists(select 1 from auth.users where id=a), 'auth account deleted';
  assert not exists(select 1 from vault.secrets where id=secret_id), 'vault cleanup on deletion';
  assert exists(select 1 from auth.users where id=b), 'other account preserved';
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.playnext_load(); raise exception 'unauthenticated load accepted';
  exception when insufficient_privilege then null; end;
end;
$$;
-- RLS is checked as the actual API role, including denial of direct mutations.
set local role authenticated;
do $$ begin
  assert (select count(*) from public.playnext_accounts) = 0, 'RLS denied foreign rows';
  begin
    delete from public.playnext_accounts; raise exception 'direct mutation accepted';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
rollback;
select 'PASS: encrypted round trip, revision conflict, shape validation, owner isolation, RLS, grants, account and Vault deletion; fixtures rolled back' as result;
