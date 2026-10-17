import test from 'node:test';
import assert from 'node:assert/strict';
import { RawgClient } from '../public/api.js';

const rawGame = id => ({ id, slug: `game-${id}`, name: `Game ${id}`, platforms: [{ platform: { slug: 'pc' } }], genres: [{ slug: 'action' }], background_image: 'https://media.rawg.io/example.jpg' });
const requestURL = options => { const body = JSON.parse(options.body); const url = new URL(body.path, 'https://api.rawg.io/api/'); url.search = new URLSearchParams({ ...body.params, key: body.key }); return url; };
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('default browser fetch keeps the Window receiver instead of binding the API client', async context => {
  context.mock.method(globalThis, 'fetch', function () {
    if (this !== globalThis) throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
    return Promise.resolve(response({ results: [] }));
  });
  const api = new RawgClient('test-placeholder');
  assert.deepEqual(await api.get('genres'), { results: [] });
});

test('a browser that blocks cross-origin RAWG responses still receives the actual authentication error', async () => {
  const origin = 'https://playnext.example';
  const browserFetch = async (url, options) => {
    if (new URL(url, origin).origin !== origin) throw new TypeError('Failed to fetch: CORS');
    assert.equal(options.method, 'POST');
    assert.equal(new URL(url, origin).pathname, '/api/rawg');
    return response({ error: 'The API key is not found' }, 401);
  };
  const api = new RawgClient('test-placeholder', browserFetch);
  await assert.rejects(api.get('genres'), error => error.status === 401 && error.message.includes('não aceitou'));
});

test('browser sends key in a POST body to the same origin, never a URL', async () => {
  let called;
  const api = new RawgClient(' test-key ', async (url, options) => { called = { url: new URL(url, 'https://playnext.example'), options }; return response({ results: [] }); });
  await api.get('games', { page: 2, genres: 'action' });
  assert.equal(called.url.origin, 'https://playnext.example');
  assert.equal(called.url.pathname, '/api/rawg');
  assert.equal(called.url.search, '');
  assert.equal(JSON.parse(called.options.body).key, 'test-key');
  assert.equal(called.options.method, 'POST');
  assert.equal(called.options.cache, 'no-store');
  assert.equal(JSON.parse(called.options.body).params.page, 2);
  assert.equal(called.options.referrerPolicy, 'no-referrer');
});
test('connection discovers platforms and genres, follows catalog pagination safely', async () => {
  const urls = [];
  const api = new RawgClient('test-key', async (url, options) => {
    const parsed = requestURL(options); urls.push(parsed);
    if (parsed.pathname.endsWith('genres')) return response({ results: [{ id: 4, slug: 'action' }], next: null });
    return response({ results: [{ id: Number(parsed.searchParams.get('page')), slug: 'pc' }], next: parsed.searchParams.get('page') === '1' ? 'https://untrusted.example/?key=do-not-follow' : null });
  });
  const catalog = await api.connect();
  assert.equal(catalog.platforms.length, 2);
  assert.equal(catalog.genres[0].slug, 'action');
  assert.ok(urls.every(url => url.origin === 'https://api.rawg.io'));
});
test('sampling selects a random page and passes platform, genre and release-date filters', async () => {
  const calls = [];
  const api = new RawgClient('test-key', async (url, options) => {
    const parsed = requestURL(options); calls.push(parsed);
    return response({ count: 200, results: [rawGame(parsed.searchParams.get('page') === '4' ? 4 : 1)] });
  }, () => .6);
  const result = await api.sample({ platforms: [4, 187], genre: 'action' });
  assert.equal(result.games[0].id, 4);
  assert.equal(calls[1].searchParams.get('page'), '4');
  assert.equal(calls[1].searchParams.get('platforms'), '4,187');
  assert.equal(calls[1].searchParams.get('genres'), 'action');
  assert.match(calls[1].searchParams.get('dates'), /^1970-01-01,\d{4}-\d{2}-\d{2}$/);
});
test('sampling never returns previously classified or duplicate games', async () => {
  const api = new RawgClient('test-key', async () => response({ count: 3, results: [rawGame(1), rawGame(2), rawGame(2)] }), () => 0);
  const result = await api.sample({ platforms: [4], history: [{ game: { id: 1 }, status: 'played' }] });
  assert.deepEqual(result.games.map(g => g.id), [2]);
});
test('zero results and already classified selection return cleanly', async () => {
  let api = new RawgClient('test-key', async () => response({ count: 0, results: [] }));
  assert.deepEqual(await api.sample({ platforms: [4] }), { count: 0, games: [] });
  api = new RawgClient('test-key', async () => response({ count: 1, results: [rawGame(1)] }));
  assert.equal((await api.sample({ platforms: [4], history: [{ game: { id: 1 } }] })).games.length, 0);
});
test('an unavailable random page falls back without an unbounded retry loop', async () => {
  let calls = 0;
  const api = new RawgClient('test-key', async (url, options) => {
    calls++;
    return requestURL(options).searchParams.has('page') ? response({}, 404) : response({ count: 8000, results: [rawGame(1)] });
  }, () => .99);
  assert.equal((await api.sample({ platforms: [4] })).games[0].id, 1);
  assert.equal(calls, 2);
});
for (const status of [401, 403, 429, 500]) test(`RAWG status ${status} has a clear error without exposing the key`, async () => {
  const api = new RawgClient('sensitive-test-placeholder', async () => response({}, status));
  await assert.rejects(api.get('games'), error => error.status === status && !error.message.includes('sensitive-test-placeholder'));
});
test('network exceptions never expose a request URL or key', async () => {
  const api = new RawgClient('sensitive-test-placeholder', async () => { throw Error('failed https://api.rawg.io?key=sensitive-test-placeholder'); });
  await assert.rejects(api.get('games'), error => !error.message.includes('sensitive-test-placeholder') && error.message.includes('conexão'));
});
test('cancellation propagates and malformed data is rejected', async () => {
  const controller = new AbortController(); controller.abort();
  const api = new RawgClient('test-key', async () => { throw new DOMException('Aborted', 'AbortError'); });
  await assert.rejects(api.get('games', {}, controller.signal), error => error.name === 'AbortError');
  const malformed = new RawgClient('test-key', async () => response({ results: 'unexpected' }));
  await assert.rejects(malformed.sample({ platforms: [4] }), /lista inesperada/);
  await assert.rejects(malformed.sample({ platforms: [] }), /plataforma/);
});
