import test from 'node:test';
import assert from 'node:assert/strict';
import { signInWithGoogle, GOOGLE_CALLBACK_PATH } from '../dist/oauth.js';
import { SUPABASE_URL } from '../dist/config.js';

function setup(url = SUPABASE_URL + '/auth/v1/authorize?provider=google') {
  const messages = new Map(), timers = {}, calls = [];
  const popup = { closed: false, location: {}, close() { this.closed = true; } };
  const browser = { location: { origin: 'https://playnext.example' }, open: (...args) => { calls.push(['open', ...args]); return popup; },
    addEventListener: (type, fn) => messages.set(type, fn), removeEventListener: type => messages.delete(type),
    setInterval: fn => { timers.closed = fn; return 1; }, clearInterval: () => { delete timers.closed; },
    setTimeout: fn => { timers.timeout = fn; return 2; }, clearTimeout: () => { delete timers.timeout; } };
  const session = { user: { id: 'synthetic-google-user' } };
  const client = { auth: {
    async signInWithOAuth(options) { calls.push(['oauth', options]); return { data: { url } }; },
    async setSession(tokens) { calls.push(['session', tokens]); return { data: { session } }; },
  } };
  const send = data => messages.get('message')?.({ origin: browser.location.origin, source: popup, data });
  return { browser, client, popup, messages, timers, calls, session, send };
}
test('Google login uses the exact callback and only accepts the expected popup and origin', async () => {
  const f = setup(), pending = signInWithGoogle(f.client, f.browser);
  await Promise.resolve();
  assert.equal(f.calls[1][1].provider, 'google');
  assert.deepEqual(f.calls[1][1].options, { redirectTo: f.browser.location.origin + GOOGLE_CALLBACK_PATH, skipBrowserRedirect: true });
  const result = { type: 'playnext:oauth-result', access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', provider_token: 'must-not-transfer' };
  await f.messages.get('message')({ origin: 'https://attacker.example', source: f.popup, data: result });
  await f.messages.get('message')({ origin: f.browser.location.origin, source: {}, data: result });
  assert.equal(f.calls.filter(c=>c[0]==='session').length, 0);
  await f.send(result);
  assert.equal(await pending, f.session);
  assert.deepEqual(f.calls.find(c=>c[0]==='session')[1], { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh' });
  assert.equal(f.messages.size, 0); assert.equal(f.popup.closed, true); assert.deepEqual(f.timers, {});
});
test('blocked popups give an actionable error before starting OAuth', async () => {
  const f = setup(); f.browser.open = () => null;
  await assert.rejects(signInWithGoogle(f.client, f.browser), { code: 'popup_blocked' });
  assert.deepEqual(f.calls, []);
});
test('an unexpected auth destination is rejected before navigating the popup', async () => {
  const f = setup('https://attacker.example/auth/v1/authorize?provider=google');
  await assert.rejects(signInWithGoogle(f.client, f.browser), { code: 'invalid_oauth_destination' });
  assert.equal(f.popup.location.href, undefined); assert.equal(f.popup.closed, true);
});
test('cancellation and provider errors clear listeners and timers without accepting tokens', async () => {
  const f = setup(), pending = signInWithGoogle(f.client, f.browser);
  await Promise.resolve(); await f.send({ type: 'playnext:oauth-result', error: 'access_denied' });
  await assert.rejects(pending, { code: 'oauth_cancelled' });
  assert.equal(f.messages.size, 0); assert.deepEqual(f.timers, {});
  const g = setup(), cancelled = signInWithGoogle(g.client, g.browser);
  await Promise.resolve(); g.popup.closed = true; g.timers.closed();
  await assert.rejects(cancelled, { code: 'oauth_cancelled' });
});
