import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { localStatus, fixture, publicClient, run, root } from './local.mjs';
import { LOCAL_PROJECT } from '../local/config.mjs';
import { DEMO_GAMES } from '../dist/demo.js';
import { createClient } from '@supabase/supabase-js';
import { emptyState, persistentAuthOptions } from '../dist/account.js';
import { createSessionStorage, memoryBackend } from '../dist/session-store.js';
import { computeBotProof, CLIENT_HEADER_NAME, CLIENT_HEADER_VALUE, PROOF_HEADER_NAME } from '../dist/prices.js';

run('docker', ['compose', 'exec', '-T', 'app', 'npm', 'test'], { stdio: ['ignore', 'inherit', 'inherit'] });
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
  const health = await (await fetch('http://127.0.0.1:4173/__local/health')).json();
  assert.equal(health.local, true);
  assert.equal(health.api, new URL(status.API_URL).origin);
  assert.equal(health.prices?.secretName, 'ITAD_API_KEY');
  const blockedBot = await fetch('http://127.0.0.1:4173/api/prices?title=Hades&slug=hades&country=US', {
    headers: { 'User-Agent': 'curl/8.5.0' },
  });
  assert.equal(blockedBot.status, 403, 'Bot requests without client proof must be blocked.');
  const validPriceRes = await fetch('http://127.0.0.1:4173/api/prices?title=Hades&slug=hades&country=US', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
      [CLIENT_HEADER_NAME]: CLIENT_HEADER_VALUE,
      [PROOF_HEADER_NAME]: computeBotProof('Hades', 'US', Math.floor(Date.now() / 60000)),
    },
  });
  assert.equal(validPriceRes.status, 200);
  assert.equal(validPriceRes.headers.get('x-ratelimit-window'), '300');
  const pricePayload = await validPriceRes.json();
  assert.equal(pricePayload.found, true);
  assert.ok(pricePayload.stores && 'steam' in pricePayload.stores && 'gog' in pricePayload.stores && 'epic' in pricePayload.stores);
  assert.ok(pricePayload.stores.steam || pricePayload.stores.gog || pricePayload.stores.epic);
  const html = await (await fetch('http://127.0.0.1:4173/')).text();
  assert.ok(html.includes('LOCAL ENVIRONMENT') && html.includes('Sign in with local test account'));
  console.log('PASS: registered local Auth user, three encrypted choices, revision conflict, logout/login restore, anonymous denial, ITAD price endpoint + bot protection, and local-only frontend configuration.');
} finally {
  const restored = await client.rpc('playnext_save', { p_state: original, p_revision: revision });
  assert.equal(restored.error, null, 'Restore the fixture state after the smoke test.');
  await client.auth.signOut();
}

