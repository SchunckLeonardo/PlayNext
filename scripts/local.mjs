import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { assertLoopback, LOCAL_PROJECT, SUPABASE_CLI_VERSION, TEST_EMAIL } from '../local/config.mjs';
import { bindLocalPorts } from '../local/loopback.mjs';

export const root = fileURLToPath(new URL('..', import.meta.url));
export const run = (command, args, options = {}) => execFileSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...options });
export async function localStatus() {
  const toml = await readFile(resolve(root, 'supabase/config.toml'), 'utf8');
  if (!toml.includes(`project_id = "${LOCAL_PROJECT}"`)) throw new Error('Unexpected local project ID.');
  const status = JSON.parse(run('supabase', ['status', '-o', 'json']));
  assertLoopback(status.API_URL, 54321);
  return status;
}
export async function fixture() {
  const user = JSON.parse(await readFile(resolve(root, '.local/test-user.json'), 'utf8'));
  if (user.email !== TEST_EMAIL || typeof user.password !== 'string' || user.password.length < 24) throw new Error('Invalid local fixture.');
  return user;
}
export function publicClient(status) {
  return createClient(assertLoopback(status.API_URL, 54321), status.PUBLISHABLE_KEY || status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function prepareAccount(status) {
  let user;
  try { user = await fixture(); } catch { user = { email: TEST_EMAIL, password: randomBytes(24).toString('base64url') }; }
  const admin = createClient(assertLoopback(status.API_URL, 54321), status.SECRET_KEY || status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const created = await admin.auth.admin.createUser({ ...user, email_confirm: true });
  if (created.error) {
    const list = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
    const existing = list.data?.users.find(u => u.email === TEST_EMAIL);
    if (list.error || !existing) throw new Error('Could not create the isolated local test identity.');
    const updated = await admin.auth.admin.updateUserById(existing.id, { password: user.password, email_confirm: true });
    if (updated.error) throw new Error('Could not prepare the local fixture.');
  }
  const client = publicClient(status);
  const login = await client.auth.signInWithPassword(user);
  if (login.error || !login.data.session) throw new Error('Local test identity could not sign in.');
  const probe = await client.rpc('playnext_load');
  if (probe.error) {
    run('docker', ['exec', `supabase_db_${LOCAL_PROJECT}`, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', 'DELETE FROM public.playnext_accounts;']);
  }
  await client.auth.signOut();
  await mkdir(resolve(root, '.local'), { recursive: true });
  await writeFile(resolve(root, '.local/test-user.json'), JSON.stringify(user) + '\n', { mode: 0o600 });
  const env = { LOCAL_API_URL: assertLoopback(status.API_URL, 54321), LOCAL_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY || status.ANON_KEY, LOCAL_TEST_EMAIL: user.email, LOCAL_TEST_PASSWORD: user.password };
  const itadKey = String(process.env.ITAD_API_KEY || process.env.ISTHEREANYDEAL_API_KEY || '').trim();
  if (itadKey && !/[\r\n]/.test(itadKey)) env.ITAD_API_KEY = itadKey;
  await writeFile(resolve(root, '.local/app.env'), Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
}
async function up() {
  if (run('supabase', ['--version']).trim() !== SUPABASE_CLI_VERSION) throw new Error(`Install Supabase CLI ${SUPABASE_CLI_VERSION}; see docs/LOCAL.md.`);
  run('docker', ['info', '--format', '{{.ServerVersion}}']);
  let network;
  try { network = JSON.parse(run('docker', ['network', 'inspect', LOCAL_PROJECT])); } catch {
    run('docker', ['network', 'create', '--driver', 'bridge', '-o', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', LOCAL_PROJECT]);
  }
  if (network && network[0].Options?.['com.docker.network.bridge.host_binding_ipv4'] !== '127.0.0.1') throw new Error('The local network must bind published ports to loopback.');
  console.log('Starting the isolated Supabase Docker stack…');
  run('supabase', ['start', '--network-id', LOCAL_PROJECT, '--exclude', 'realtime,storage-api,imgproxy,studio,edge-runtime,logflare,vector,supavisor,mailpit,postgres-meta']);
  await bindLocalPorts(run);
  await prepareAccount(await localStatus());
  console.log('Registered local test account ready. Building PlayNext…');
  run('docker', ['compose', 'up', '--build', '--wait'], { stdio: ['ignore', 'inherit', 'inherit'] });
  console.log(`PlayNext: http://127.0.0.1:4173 · ${TEST_EMAIL} · click “Sign in with local test account”.`);
}
async function main() {
  if (process.argv[2] === 'up') await up();
  else if (process.argv[2] === 'down') {
    run('docker', ['compose', 'down']);
    run('supabase', ['stop']);
    console.log('Local containers stopped; database and fixture preserved.');
  } else if (process.argv[2] === 'status') {
    const status = await localStatus();
    console.log(JSON.stringify({ app: 'http://127.0.0.1:4173', api: assertLoopback(status.API_URL, 54321), account: TEST_EMAIL }));
  } else throw new Error('Use up, down or status.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await main(); }
  catch (error) {
    // Never echo CLI status/errors: they may contain local admin keys.
    console.error(error.status !== undefined ? 'Local Docker/CLI command failed. Check Docker Desktop and the documented prerequisites.' : error.message);
    process.exitCode = 1;
  }
}
