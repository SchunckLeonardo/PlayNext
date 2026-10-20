-- Server-only shared state: no visitor receives the service credential or direct access.
create schema if not exists private;
create table private.playnext_price_cache (
  key text primary key check (length(key) <= 512),
  value jsonb not null,
  expires_at timestamptz not null
);
create table private.playnext_price_quota (
  bucket text primary key check (length(bucket) <= 256),
  calls timestamptz[] not null default '{}',
  expires_at timestamptz not null
);
alter table private.playnext_price_cache enable row level security;
alter table private.playnext_price_quota enable row level security;
revoke all on private.playnext_price_cache, private.playnext_price_quota from public, anon, authenticated;

create or replace function public.playnext_price_cache_get(p_key text)
returns jsonb language sql security definer set search_path = '' as $$
  select value from private.playnext_price_cache where key = p_key and expires_at > clock_timestamp();
$$;
create or replace function public.playnext_price_cache_set(p_key text, p_value jsonb, p_ttl_ms integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if length(p_key) > 512 or octet_length(p_value::text) > 131072 or p_ttl_ms < 1 or p_ttl_ms > 604800000 then
    raise exception 'INVALID_PRICE_CACHE_VALUE' using errcode = '22023';
  end if;
  delete from private.playnext_price_cache where expires_at <= clock_timestamp();
  insert into private.playnext_price_cache(key, value, expires_at)
  values(p_key, p_value, clock_timestamp() + p_ttl_ms * interval '1 millisecond')
  on conflict (key) do update set value = excluded.value, expires_at = excluded.expires_at;
end;
$$;
create or replace function public.playnext_price_quota_take(p_bucket text, p_limit integer, p_window_ms integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_calls timestamptz[];
begin
  if length(p_bucket) > 256 or p_limit < 1 or p_limit > 100 or p_window_ms < 1 or p_window_ms > 300000 then
    raise exception 'INVALID_PRICE_QUOTA' using errcode = '22023';
  end if;
  -- One lock per bucket makes budget reservation atomic across all Vercel instances.
  perform pg_advisory_xact_lock(hashtextextended('playnext:price:' || p_bucket, 0));
  delete from private.playnext_price_quota where expires_at <= v_now;
  insert into private.playnext_price_quota(bucket, expires_at) values(p_bucket, v_now + interval '5 minutes') on conflict do nothing;
  select coalesce(array_agg(call_time), '{}') into v_calls
    from private.playnext_price_quota q cross join lateral unnest(q.calls) call_time
    where q.bucket = p_bucket and call_time > v_now - p_window_ms * interval '1 millisecond';
  if cardinality(v_calls) >= p_limit then return false; end if;
  update private.playnext_price_quota set calls = array_append(v_calls, v_now), expires_at = v_now + interval '5 minutes' where bucket = p_bucket;
  return true;
end;
$$;
revoke all on function public.playnext_price_cache_get(text), public.playnext_price_cache_set(text, jsonb, integer), public.playnext_price_quota_take(text, integer, integer) from public, anon, authenticated;
grant execute on function public.playnext_price_cache_get(text), public.playnext_price_cache_set(text, jsonb, integer), public.playnext_price_quota_take(text, integer, integer) to service_role;
