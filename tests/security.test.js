import test from 'node:test';
import assert from 'node:assert/strict';
import { highSecurityFindings } from '../scripts/check-sarif.mjs';
import { assertLoopback, localSettings } from '../local/config.mjs';
import { readFile } from 'node:fs/promises';
import { loopbackSpec } from '../local/loopback.mjs';

test('SAST gate rejects missing reports and detects high severity results', () => {
  assert.throws(() => highSecurityFindings({}), /Missing/);
  const report = { runs: [{ tool: { driver: { rules: [{ id: 'test/injection', properties: { 'security-severity': '9.1' } }] } }, results: [{ ruleId: 'test/injection' }] }] };
  assert.deepEqual(highSecurityFindings(report), ['test/injection']);
  assert.deepEqual(highSecurityFindings({ runs: [{ results: [] }] }), []);
});
test('local test account configuration cannot target a cloud or non-loopback endpoint', () => {
  assert.equal(assertLoopback('http://127.0.0.1:54321', 54321), 'http://127.0.0.1:54321');
  for (const url of ['https://example.supabase.co', 'http://192.168.1.10:54321', 'http://127.0.0.1:54321.evil.test', 'http://user:password@127.0.0.1:54321', 'http://127.0.0.1:54322']) {
    assert.throws(() => assertLoopback(url, 54321));
  }
  assert.throws(() => localSettings({ LOCAL_API_URL: 'http://127.0.0.1:54321', LOCAL_TEST_EMAIL: 'real@example.com' }));
});
test('the local credential adapter is absent from the production OAuth implementation', async () => {
  const production = await readFile(new URL('../dist/oauth.js', import.meta.url), 'utf8');
  assert.ok(production.includes("provider: 'google'"));
  assert.ok(!production.includes('signInWithPassword') && !production.includes('__local/test-user'));
});
test('Docker port restriction refuses other projects and preserves the local DB volume', () => {
  const container = { Config: { Labels: { 'com.supabase.cli.project': 'another-project' } } };
  assert.throws(() => loopbackSpec(container), /another project/);
  container.Config.Labels['com.supabase.cli.project'] = 'playnext-local';
  container.HostConfig = { Binds: ['local-db:/var/lib/postgresql/data'], PortBindings: { '5432/tcp': [{ HostIp: '0.0.0.0', HostPort: '54322' }] } };
  container.NetworkSettings = { Networks: { 'playnext-local': { IPAddress: '172.30.0.2', Aliases: ['db'] } } };
  const spec = loopbackSpec(container);
  assert.equal(spec.HostConfig.PortBindings['5432/tcp'][0].HostIp, '127.0.0.1');
  assert.deepEqual(spec.HostConfig.Binds, container.HostConfig.Binds);
  assert.equal(container.HostConfig.PortBindings['5432/tcp'][0].HostIp, '0.0.0.0');
});
