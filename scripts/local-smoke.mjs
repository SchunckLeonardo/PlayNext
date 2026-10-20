import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { localStatus, fixture, publicClient, run, root } from './local.mjs';
import { LOCAL_PROJECT } from '../local/config.mjs';
import { DEMO_GAMES } from '../src/lib/demo.ts';
import { createClient } from '@supabase/supabase-js';
import { emptyState, persistentAuthOptions } from '../src/lib/account.ts';
import { createSessionStorage, memoryBackend } from '../src/lib/session-store.ts';
import { computeBotProof, CLIENT_HEADER_NAME, CLIENT_HEADER_VALUE, PROOF_HEADER_NAME } from '../src/lib/prices.ts';

run('docker', ['exec', '-i', `supabase_db_${LOCAL_PROJECT}`, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
  input: await readFile(resolve(root, 'supabase/tests/private_accounts.sql'), 'utf8'),
});
const status = await localStatus(), user = await fixture();
const anonymous = publicClient(status);
assert.ok((await anonymous.rpc('playnext_load')).error, 'Anonymous reads must be rejected.');
const sessionBackend = memoryBackend();
const makePersistentClient = () => createClient(status.API_URL, status.PUBLISHABLE_KEY || status.ANON_KEY, {
  auth: { ...persistentAuthOptions(createSessionStorage({ backend: sessionBackend })), autoRefreshToken: false },
});
const client = makePersistentClient();
assert.equal((await client.auth.signInWithPassword(user)).error, null);
const loaded = await client.rpc('playnext_load');
assert.equal(loaded.error, null);
const original = loaded.data.data || emptyState();
let revision = loaded.data.revision;
try {
  const state = { ...emptyState(), rawg_key: 'synthetic-local-vault-proof', history: DEMO_GAMES.slice(0, 3).map((game, i) => ({ game, status: ['yes', 'no', 'played'][i], decidedAt: new Date().toISOString() })) };
  const saved = await client.rpc('playnext_save', { p_state: state, p_revision: revision });
  assert.equal(saved.error, null); revision = saved.data;
  assert.equal((await client.rpc('playnext_save', { p_state: state, p_revision: revision - 1 })).error?.code, '40001');
  // Simulate a page reload: a fresh client over the same encrypted device store restores
  // the session (access_token + refresh_token), rotates tokens via refreshSession(), and
  // loads the encrypted Vault collection without logging in again.
  const reloadedClient = makePersistentClient();
  const reloadedSession = (await reloadedClient.auth.getSession()).data.session;
  assert.ok(reloadedSession?.access_token && reloadedSession?.refresh_token, 'Session must survive reload in the encrypted device store.');
  const refreshed = await reloadedClient.auth.refreshSession();
  assert.equal(refreshed.error, null);
  assert.ok(refreshed.data.session?.access_token && refreshed.data.session?.refresh_token);
  const restored = await reloadedClient.rpc('playnext_load');
  assert.equal(restored.error, null);
  assert.deepEqual(restored.data.data, state);
  await reloadedClient.auth.signOut({ scope: 'local' });
  assert.equal((await reloadedClient.auth.getSession()).data.session, null);
  assert.equal((await client.auth.signInWithPassword(user)).error, null);
  const health = await (await fetch('http://127.0.0.1:4173/api/local/health')).json();
  assert.equal(health.local, true);
  assert.equal(health.api, new URL(status.API_URL).origin);
  assert.equal(health.prices?.secretName, 'ITAD_API_KEY');
  const blockedBot = await fetch('http://127.0.0.1:4173/api/prices?title=Hades&slug=hades&country=US', {
    headers: { 'User-Agent': 'curl/8.5.0' },
  });
  assert.equal(blockedBot.status, 403, 'Bot requests without client proof must be blocked.');
  const validPriceRes = await fetch('http://127.0.0.1:4173/api/prices?title=Subnautica&steamAppId=264710&country=US', {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      [CLIENT_HEADER_NAME]: CLIENT_HEADER_VALUE,
      [PROOF_HEADER_NAME]: computeBotProof('Subnautica', 'US', Math.floor(Date.now() / 60000)),
    },
  });
  if (health.prices.configured) {
    assert.equal(validPriceRes.status, 200);
    const payload = await validPriceRes.json();
    assert.equal(payload.source, 'itad');
    assert.equal(payload.found, true, 'A configured server must resolve a real ITAD offer.');
    assert.ok(payload.stores.steam?.amount > 0 || payload.stores.gog?.amount > 0);
  } else {
    assert.equal(validPriceRes.status, 503, 'Missing ITAD configuration must never produce fictional prices.');
  }
  const { SupabasePriceStore } = await import('../src/server/price-store.ts');
  const shared = new SupabasePriceStore(status.API_URL, status.SECRET_KEY || status.SERVICE_ROLE_KEY);
  const bucket = 'smoke:' + Date.now();
  assert.equal(await shared.take(bucket, 2, 300000), true);
  assert.equal(await shared.take(bucket, 2, 300000), true);
  assert.equal(await shared.take(bucket, 2, 300000), false);
  await shared.set(bucket, { amount: 12.34 }, 10000);
  assert.deepEqual(await shared.get(bucket), { amount: 12.34 });
  assert.ok((await anonymous.rpc('playnext_price_cache_get', { p_key: bucket })).error, 'Anonymous users cannot read the shared cache.');
  assert.ok((await client.rpc('playnext_price_quota_take', { p_bucket: bucket, p_limit: 100, p_window_ms: 300000 })).error, 'Visitors cannot reset the upstream quota.');
  const html = await (await fetch('http://127.0.0.1:4173/')).text();
  assert.ok(html.includes('LOCAL ENVIRONMENT') && html.includes('Less browsing.') && html.includes('/_next/'));
  console.log('PASS: Next.js runtime, encrypted choices, account revisions, session reload/refresh, shared server-only price cache/quota, bot denial, and truthful ITAD configuration state.');
} finally {
  const restored = await client.rpc('playnext_save', { p_state: original, p_revision: revision });
  assert.equal(restored.error, null, 'Restore the fixture state after the smoke test.');
  await client.auth.signOut();
}

