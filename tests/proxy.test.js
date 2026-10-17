import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRawgProxy } from '../worker/rawg-proxy.js';
import { RawgClient } from '../public/api.js';

const origin = 'https://playnext.example';
const key = 'test-only-credential';
const req = (body = { path: 'genres', key }, options = {}) => new Request(origin + '/api/rawg', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body), ...options });

test('the Worker default fetch also retains the native global receiver', async context => {
  context.mock.method(globalThis, 'fetch', function () {
    if (this !== globalThis) throw new TypeError('Illegal invocation');
    return Promise.resolve(Response.json({ results: [] }));
  });
  assert.equal((await handleRawgProxy(req())).status, 200);
});

test('proxy works on Workers that do not implement the Request cache option', async () => {
  const response = await handleRawgProxy(req(), async (_url, options) => {
    if ('cache' in options) throw new Error("The 'cache' field on 'RequestInitializerDict' is not implemented.");
    assert.equal(options.headers['Cache-Control'], 'no-store');
    return Response.json({ results: [] });
  });
  assert.equal(response.status, 200);
});

test('proxy reads real upstream JSON even without CORS headers, preserves pagination and never echoes the key', async () => {
  let target;
  const response = await handleRawgProxy(req({ key, path: 'games', params: { platforms: '4,187', page: 2 } }), async (url, options) => {
    target = new URL(url);
    assert.deepEqual(options.headers, { Accept: 'application/json', 'Cache-Control': 'no-store' });
    assert.equal(options.cache, undefined);
    assert.equal(options.redirect, 'error');
    return Response.json({ count: 80, next: `https://api.rawg.io/api/games?page=3&key=${key}`, previous: `https://api.rawg.io/api/games?page=1&key=${key}`, results: [{ id: 1, name: 'A game' }] });
  });
  assert.equal(target.origin, 'https://api.rawg.io');
  assert.equal(target.pathname, '/api/games');
  assert.equal(target.searchParams.get('key'), key);
  assert.equal(target.searchParams.get('platforms'), '4,187');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const text = await response.text();
  assert.ok(!text.includes(key));
  assert.equal(JSON.parse(text).next, true);
  assert.equal(JSON.parse(text).results[0].name, 'A game');
});
for (const status of [401, 403, 404, 429, 500]) test(`upstream ${status} reaches browser without a CORS dependency or secret echo`, async () => {
  const response = await handleRawgProxy(req(), async () => new Response(`private error ${key}`, { status }));
  assert.equal(response.status, status === 500 ? 502 : status);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.ok(!(await response.text()).includes(key));
});
test('proxy refuses arbitrary URLs, methods, origins, key overrides and malformed inputs before contacting RAWG', async () => {
  let calls = 0;
  const upstream = async () => { calls++; return Response.json({}); };
  const cases = [
    [new Request(origin + '/api/rawg'), 405],
    [req({}, { headers: { 'Content-Type': 'application/json', Origin: 'https://other.example' } }), 403],
    [req({}, { headers: { 'Content-Type': 'text/plain' } }), 415],
    [req({}, { body: '{invalid' }), 400],
    [req({ path: '//other.example', key }), 400],
    [req({ path: 'https://other.example', key }), 400],
    [req({ path: 'games/../../other', key }), 400],
    [req({ path: 'games', key: '' }), 400],
    [req({ path: 'games', key, params: { key: 'override' } }), 400],
    [req({ path: 'games', key, params: [] }), 400],
    [req({ path: 'games', key, params: { page: {} } }), 400],
    [req({ path: 'games', key: 'x'.repeat(9000) }), 413],
  ];
  for (const [request, expected] of cases) assert.equal((await handleRawgProxy(request, upstream)).status, expected);
  assert.equal(calls, 0);
});
test('upstream failures, malformed JSON and timeout are returned safely', async () => {
  for (const [error, status] of [[new Error(`secret ${key}`), 502], [new DOMException('timeout', 'TimeoutError'), 504]]) {
    const response = await handleRawgProxy(req(), async () => { throw error; });
    assert.equal(response.status, status);
    assert.ok(!(await response.text()).includes(key));
  }
  const response = await handleRawgProxy(req(), async () => new Response('<html>unavailable</html>'));
  assert.equal(response.status, 502);
});
test('whole client path connects, filters, samples and opens details through the proxy with CORS-less upstream fixtures', async () => {
  const game = { id: 123, name: 'Fixture game', slug: 'fixture-game', platforms: [{ platform: { slug: 'pc' } }], genres: [{ slug: 'action' }], description_raw: 'Fixture description' };
  const transport = async (url, options) => {
    assert.equal(url, '/api/rawg');
    return handleRawgProxy(new Request(origin + url, options), async target => {
      const path = new URL(target).pathname;
      if (path === '/api/platforms') return Response.json({ results: [{ id: 4, slug: 'pc', name: 'PC' }], next: null });
      if (path === '/api/genres') return Response.json({ results: [{ id: 4, slug: 'action', name: 'Action' }], next: null });
      if (path === '/api/games/123') return Response.json(game);
      assert.equal(new URL(target).searchParams.get('platforms'), '4');
      return Response.json({ count: 1, results: [game], next: null });
    });
  };
  const client = new RawgClient(key, transport, () => 0);
  assert.equal((await client.connect()).platforms[0].id, 4);
  assert.equal((await client.sample({ platforms: [4], genre: 'action' })).games[0].id, 123);
  assert.equal((await client.details(123)).description, 'Fixture description');
});
