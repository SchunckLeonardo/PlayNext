import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { localStatus, fixture, publicClient, run, root } from './local.mjs';
import { LOCAL_PROJECT } from '../local/config.mjs';
import { DEMO_GAMES } from '../dist/demo.js';
import { emptyState } from '../dist/account.js';

run('docker', ['compose', 'exec', '-T', 'app', 'npm', 'test'], { stdio: ['ignore', 'inherit', 'inherit'] });
run('docker', ['exec', '-i', `supabase_db_${LOCAL_PROJECT}`, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
  input: await readFile(resolve(root, 'supabase/tests/private_accounts.sql'), 'utf8'),
});
const status = await localStatus(), user = await fixture();
const anonymous = publicClient(status);
assert.ok((await anonymous.rpc('playnext_load')).error, 'Anonymous reads must be rejected.');
const client = publicClient(status);
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
  await client.auth.signOut();
  assert.equal((await client.auth.getSession()).data.session, null);
  assert.equal((await client.auth.signInWithPassword(user)).error, null);
  const restored = await client.rpc('playnext_load');
  assert.equal(restored.error, null);
  assert.deepEqual(restored.data.data, state);
  const health = await (await fetch('http://127.0.0.1:4173/__local/health')).json();
  assert.equal(health.local, true);
  assert.equal(health.api, new URL(status.API_URL).origin);
  const html = await (await fetch('http://127.0.0.1:4173/')).text();
  assert.ok(html.includes('AMBIENTE LOCAL') && html.includes('Entrar com conta de teste local'));
  console.log('PASS: registered local Auth user, three encrypted choices, revision conflict, logout/login restore, anonymous denial and local-only frontend configuration.');
} finally {
  const restored = await client.rpc('playnext_save', { p_state: original, p_revision: revision });
  assert.equal(restored.error, null, 'Restore the fixture state after the smoke test.');
  await client.auth.signOut();
}
