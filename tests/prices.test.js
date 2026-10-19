import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import {
  ITAD_ORIGIN,
  ITAD_SECRET_NAME,
  ITAD_WINDOW_MS,
  ITAD_API_WINDOW_LIMIT,
  ITAD_SAFE_UPSTREAM_BUDGET,
  ITAD_SHOPS,
  PUBLIC_DEALS_URL,
  CLIENT_HEADER_NAME,
  CLIENT_HEADER_VALUE,
  PROOF_HEADER_NAME,
  ItadPriceService,
  PriceClient,
  computeBotProof,
  verifyBotProof,
  validateBotRequest,
  handlePriceApiRequest,
  safeStoreUrl,
  formatStorePrice,
  stripTitleNoise,
  scoreDealTitle,
  demoPriceSnapshot,
} from '../dist/prices.js';

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

function mockHttpExchange({ method = 'GET', url = '/api/prices?title=Hades&slug=hades&country=US', headers = {}, remoteAddress = '127.0.0.1' } = {}) {
  const req = Object.assign(Readable.from([]), {
    method,
    url,
    headers,
    socket: { remoteAddress },
  });
  const response = { status: 200, headers: {}, body: '' };
  const res = {
    writeHead(status, hdrs = {}) {
      response.status = status;
      Object.assign(response.headers, hdrs);
      return this;
    },
    setHeader(name, value) {
      response.headers[name] = value;
    },
    end(chunk = '') {
      response.body = String(chunk);
    },
  };
  return { req, res, response };
}

test('ITAD constants expose the official GitHub Secret name, shop IDs, and 100 req / 5 min window limits', () => {
  assert.equal(ITAD_SECRET_NAME, 'ITAD_API_KEY');
  assert.equal(ITAD_WINDOW_MS, 300_000);
  assert.equal(ITAD_API_WINDOW_LIMIT, 100);
  assert.equal(ITAD_SAFE_UPSTREAM_BUDGET, 80);
  assert.equal(ITAD_SHOPS.steam.id, 61);
  assert.equal(ITAD_SHOPS.gog.id, 35);
  assert.equal(ITAD_SHOPS.epic.id, 16);
});

test('safeStoreUrl accepts only HTTPS URLs from official store domains and rejects untrusted origins', () => {
  assert.equal(safeStoreUrl('https://store.steampowered.com/app/1145360/Hades/'), 'https://store.steampowered.com/app/1145360/Hades/');
  assert.equal(safeStoreUrl('https://www.gog.com/en/game/hades'), 'https://www.gog.com/en/game/hades');
  assert.equal(safeStoreUrl('https://store.epicgames.com/en-US/p/hades'), 'https://store.epicgames.com/en-US/p/hades');
  assert.equal(safeStoreUrl('https://isthereanydeal.com/game/hades/info/'), 'https://isthereanydeal.com/game/hades/info/');
  assert.equal(safeStoreUrl('http://store.steampowered.com/app/1145360/'), '');
  assert.equal(safeStoreUrl('javascript:alert(1)'), '');
  assert.equal(safeStoreUrl('https://evil.example/store.steampowered.com'), '');
  assert.equal(safeStoreUrl('https://user:pass@store.steampowered.com/app/1'), '');
});

test('ItadPriceService queries official lookup/v1 and prices/v3 endpoints, selects lowest prices, and caches results', async () => {
  const calls = [];
  let clock = 1_700_000_000_000;
  const service = new ItadPriceService({
    apiKey: 'itad-secret-test-key',
    now: () => clock,
    request: async (url, options) => {
      const parsed = new URL(url);
      calls.push({ url: parsed, options });
      if (parsed.pathname === '/games/lookup/v1') {
        assert.equal(parsed.origin, ITAD_ORIGIN);
        assert.equal(parsed.searchParams.get('key'), 'itad-secret-test-key');
        assert.equal(parsed.searchParams.get('title'), 'Outer Wilds');
        return jsonResponse({ found: true, game: { id: '018d937f-0000-7000-8000-000000000099', slug: 'outer-wilds', title: 'Outer Wilds' } });
      }
      if (parsed.pathname === '/games/prices/v3') {
        assert.equal(parsed.origin, ITAD_ORIGIN);
        assert.equal(parsed.searchParams.get('key'), 'itad-secret-test-key');
        assert.equal(parsed.searchParams.get('country'), 'US');
        assert.equal(parsed.searchParams.get('shops'), '61,35,16');
        assert.equal(options.method, 'POST');
        assert.deepEqual(JSON.parse(options.body), ['018d937f-0000-7000-8000-000000000099']);
        return jsonResponse([
          {
            id: '018d937f-0000-7000-8000-000000000099',
            historyLow: { all: { amount: 11.99, currency: 'USD' } },
            deals: [
              { shop: { id: 61, name: 'Steam' }, price: { amount: 14.99, currency: 'USD' }, regular: { amount: 24.99, currency: 'USD' }, cut: 40, url: 'https://store.steampowered.com/app/753640/Outer_Wilds/' },
              { shop: { id: 61, name: 'Steam' }, price: { amount: 24.99, currency: 'USD' }, regular: { amount: 24.99, currency: 'USD' }, cut: 0, url: 'https://store.steampowered.com/app/753640/Outer_Wilds/' },
              { shop: { id: 16, name: 'Epic Game Store' }, price: { amount: 12.49, currency: 'USD' }, regular: { amount: 24.99, currency: 'USD' }, cut: 50, url: 'https://store.epicgames.com/en-US/p/outer-wilds' },
            ],
          },
        ]);
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  });

  const first = await service.getPrices({ title: 'Outer Wilds', slug: 'outer-wilds', country: 'US', clientId: '10.0.0.1' });
  assert.equal(first.found, true);
  assert.equal(first.source, 'itad');
  assert.equal(first.bestStore, 'epic');
  assert.equal(first.stores.steam.price, 14.99);
  assert.equal(first.stores.steam.cut, 40);
  assert.equal(first.stores.epic.price, 12.49);
  assert.equal(first.stores.gog, null);
  assert.equal(first.historyLow.amount, 11.99);
  assert.equal(calls.length, 2);

  // Repeat request within cache TTL hits memory cache with zero upstream calls.
  clock += 5_000;
  const cached = await service.getPrices({ title: 'Outer Wilds', slug: 'outer-wilds', country: 'US', clientId: '10.0.0.2' });
  assert.equal(cached.source, 'cache');
  assert.equal(cached.bestStore, 'epic');
  assert.equal(calls.length, 2);
});

test('Singleflight coalescing deduplicates concurrent requests for the same game', async () => {
  let upstreamCount = 0;
  let release;
  const gate = new Promise(r => { release = r; });
  const service = new ItadPriceService({
    apiKey: 'itad-secret-test-key',
    request: async url => {
      upstreamCount++;
      await gate;
      if (String(url).includes('/games/lookup/v1')) {
        return jsonResponse({ found: true, game: { id: 'uuid-celeste' } });
      }
      return jsonResponse([{ id: 'uuid-celeste', deals: [{ shop: { id: 61, name: 'Steam' }, price: { amount: 4.99, currency: 'USD' }, regular: { amount: 19.99, currency: 'USD' }, cut: 75, url: 'https://store.steampowered.com/app/504230/Celeste/' }] }]);
    },
  });

  const p1 = service.getPrices({ title: 'Celeste', slug: 'celeste', country: 'US', clientId: 'client-a' });
  const p2 = service.getPrices({ title: 'Celeste', slug: 'celeste', country: 'US', clientId: 'client-b' });
  release();
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1.stores.steam.price, 4.99);
  assert.equal(r2.stores.steam.price, 4.99);
  // Both concurrent callers share a single lookup/v1 + prices/v3 pair (2 upstream calls instead of 4).
  assert.equal(upstreamCount, 2);
});

test('per-client burst and 5-minute window rate limits block abusive clients before touching upstream quota', async () => {
  let clock = 1_700_000_000_000;
  let upstreamCalls = 0;
  const service = new ItadPriceService({
    apiKey: 'itad-secret-test-key',
    now: () => clock,
    clientBurstMax: 3,
    clientBurstMs: 10_000,
    clientWindowMax: 5,
    request: async () => {
      upstreamCalls++;
      return jsonResponse({ found: false });
    },
  });

  for (let i = 0; i < 3; i++) {
    await service.getPrices({ title: `Unknown Game ${i}`, slug: `unknown-${i}`, country: 'US', clientId: 'spammer-ip' });
  }
  await assert.rejects(
    service.getPrices({ title: 'Unknown Game 99', slug: 'unknown-99', country: 'US', clientId: 'spammer-ip' }),
    error => error.status === 429 && error.code === 'CLIENT_BURST_LIMIT' && error.retryAfter >= 1,
  );
  const callsAfterBurstBlock = upstreamCalls;

  // Advance past the 10s burst window, make 2 more requests to hit clientWindowMax (5), and verify 6th fails.
  clock += 11_000;
  await service.getPrices({ title: 'Unknown Game 4', slug: 'unknown-4', country: 'US', clientId: 'spammer-ip' });
  await service.getPrices({ title: 'Unknown Game 5', slug: 'unknown-5', country: 'US', clientId: 'spammer-ip' });
  await assert.rejects(
    service.getPrices({ title: 'Unknown Game 6', slug: 'unknown-6', country: 'US', clientId: 'spammer-ip' }),
    error => error.status === 429 && error.code === 'CLIENT_WINDOW_LIMIT',
  );
  assert.equal(upstreamCalls, callsAfterBurstBlock + 2);
});

test('global 5-minute sliding window hard-caps upstream calls to protect the 100 req / 5 min ITAD quota', async () => {
  let clock = 1_700_000_000_000;
  let upstreamCalls = 0;
  const service = new ItadPriceService({
    apiKey: 'itad-secret-test-key',
    now: () => clock,
    maxUpstreamCalls: 4, // tight budget for test; production uses 80 (capped at 100)
    clientBurstMax: 50,
    clientWindowMax: 50,
    request: async url => {
      upstreamCalls++;
      if (String(url).includes('/games/lookup/v1')) return jsonResponse({ found: false });
      return jsonResponse([]);
    },
  });

  // 4 uncached unknown games consume 4 lookup calls.
  for (let i = 1; i <= 4; i++) {
    await service.getPrices({ title: `Quota Game ${i}`, slug: `quota-game-${i}`, country: 'US', clientId: `ip-${i}` });
  }
  assert.equal(upstreamCalls, 4);
  assert.equal(service.status().upstreamRemaining, 0);

  // 5th uncached unknown game is blocked before calling ITAD.
  await assert.rejects(
    service.getPrices({ title: 'Quota Game 5', slug: 'quota-game-5', country: 'US', clientId: 'ip-5' }),
    error => error.status === 429 && error.code === 'UPSTREAM_QUOTA_PROTECTED',
  );
  assert.equal(upstreamCalls, 4);

  // Known demo games still gracefully fall back to reference prices even when upstream quota is full.
  const demoFallback = await service.getPrices({ title: 'Elden Ring', slug: 'elden-ring', country: 'US', clientId: 'ip-6' });
  assert.equal(demoFallback.found, true);
  assert.equal(demoFallback.stores.steam.price, 35.99);
  assert.equal(upstreamCalls, 4);

  // After 5 minutes + 1ms, the sliding window releases the quota.
  clock += ITAD_WINDOW_MS + 1;
  assert.equal(service.status().upstreamRemaining, 4);
  await service.getPrices({ title: 'Quota Game 5', slug: 'quota-game-5', country: 'US', clientId: 'ip-5' });
  assert.equal(upstreamCalls, 5);
});

test('bot protection rejects scrapers, invalid methods, honeypots, cross-site fetches, and missing/forged proofs', async () => {
  const now = 1_700_000_000_000;
  const bucket = Math.floor(now / 60000);
  const validProof = computeBotProof('Hades', 'US', bucket);
  const browserUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36';

  assert.equal(verifyBotProof('Hades', 'US', validProof, now), true);
  assert.equal(verifyBotProof('Hades', 'US', 'forged-proof', now), false);

  // Non-GET rejected
  assert.equal(validateBotRequest({ method: 'POST', headers: { 'user-agent': browserUA } }, new URL('http://localhost/api/prices?title=Hades'), now).status, 405);

  // Honeypot rejected
  assert.equal(validateBotRequest({ method: 'GET', headers: { 'user-agent': browserUA } }, new URL('http://localhost/api/prices?title=Hades&bot=1'), now).status, 403);

  // Scraper User-Agents rejected
  for (const ua of ['curl/8.5.0', 'python-requests/2.31.0', 'HeadlessChrome/120.0', 'GPTBot/1.0', '']) {
    const check = validateBotRequest({ method: 'GET', headers: { 'user-agent': ua, [CLIENT_HEADER_NAME]: CLIENT_HEADER_VALUE, [PROOF_HEADER_NAME]: validProof } }, new URL('http://localhost/api/prices?title=Hades&country=US'), now);
    assert.equal(check.ok, false);
    assert.equal(check.status, 403);
  }

  // Cross-site fetch rejected
  const crossSite = validateBotRequest({
    method: 'GET',
    headers: { 'user-agent': browserUA, 'sec-fetch-site': 'cross-site', [CLIENT_HEADER_NAME]: CLIENT_HEADER_VALUE, [PROOF_HEADER_NAME]: validProof },
  }, new URL('http://localhost/api/prices?title=Hades&country=US'), now);
  assert.equal(crossSite.ok, false);
  assert.equal(crossSite.code, 'cross_site_blocked');

  // Valid browser request passes
  const valid = validateBotRequest({
    method: 'GET',
    headers: { 'user-agent': browserUA, 'sec-fetch-site': 'same-origin', [CLIENT_HEADER_NAME]: CLIENT_HEADER_VALUE, [PROOF_HEADER_NAME]: validProof },
  }, new URL('http://localhost/api/prices?title=Hades&country=US'), now);
  assert.equal(valid.ok, true);

  // End-to-end HTTP handler test
  const service = new ItadPriceService({ apiKey: '', now: () => now });
  const blockedExchange = mockHttpExchange({
    headers: { 'user-agent': 'curl/8.5.0' },
  });
  await handlePriceApiRequest(blockedExchange.req, blockedExchange.res, service);
  assert.equal(blockedExchange.response.status, 403);

  const allowedExchange = mockHttpExchange({
    url: '/api/prices?title=Hades&slug=hades&country=BR',
    headers: {
      'user-agent': browserUA,
      [CLIENT_HEADER_NAME]: CLIENT_HEADER_VALUE,
      [PROOF_HEADER_NAME]: computeBotProof('Hades', 'BR', bucket),
    },
  });
  await handlePriceApiRequest(allowedExchange.req, allowedExchange.res, service);
  assert.equal(allowedExchange.response.status, 200);
  const body = JSON.parse(allowedExchange.response.body);
  assert.equal(body.country, 'BR');
  assert.equal(body.currency, 'BRL');
  assert.equal(body.stores.steam.price, 36.99);
  assert.equal(body.stores.gog.price, 36.99);
  assert.equal(body.stores.epic.price, 36.99);
  assert.equal(allowedExchange.response.headers['X-RateLimit-Window'], '300');
});

test('upstream errors never leak ITAD_API_KEY in exceptions or HTTP responses', async () => {
  const secret = 'super-secret-itad-key-999';
  for (const status of [401, 403, 429, 500]) {
    const service = new ItadPriceService({
      apiKey: secret,
      request: async () => jsonResponse({ error: secret }, status),
    });
    await assert.rejects(
      service.getPrices({ title: 'Non Demo Title', slug: 'non-demo-title', country: 'US', clientId: '127.0.0.1' }),
      error => !error.message.includes(secret),
    );
  }
  const throwingService = new ItadPriceService({
    apiKey: secret,
    request: async () => { throw new Error(`Failed https://api.isthereanydeal.com/games/lookup/v1?key=${secret}`); },
  });
  await assert.rejects(
    throwingService.getPrices({ title: 'Non Demo Title', slug: 'non-demo-title', country: 'US', clientId: '127.0.0.1' }),
    error => !error.message.includes(secret),
  );
});

test('PriceClient caches in memory, switches currency country, respects 429 cooldown, and preserves Window fetch receiver', async context => {
  let clock = 1_700_000_000_000;
  let calls = 0;
  const client = new PriceClient({
    country: 'US',
    now: () => clock,
    request: async (url, options) => {
      calls++;
      assert.equal(options.headers[CLIENT_HEADER_NAME], CLIENT_HEADER_VALUE);
      assert.ok(options.headers[PROOF_HEADER_NAME]);
      if (String(url).includes('country=BR')) {
        return jsonResponse({ found: true, country: 'BR', currency: 'BRL', bestStore: 'steam', stores: { steam: { price: 137.94, formattedPrice: formatStorePrice(137.94, 'BRL'), cut: 40, url: 'https://store.steampowered.com/app/1245620/ELDEN_RING/' }, gog: null, epic: null } });
      }
      return jsonResponse({ found: true, country: 'US', currency: 'USD', bestStore: 'steam', stores: { steam: { price: 35.99, formattedPrice: '$35.99', cut: 40, url: 'https://store.steampowered.com/app/1245620/ELDEN_RING/' }, gog: null, epic: null } });
    },
  });

  const game = { id: 326243, slug: 'elden-ring', name: 'Elden Ring' };
  const us = await client.forGame(game);
  assert.equal(us.stores.steam.price, 35.99);
  assert.equal(client.peek(game).stores.steam.price, 35.99);
  assert.equal(calls, 1);

  // Switching to BR fetches BRL prices and caches separately.
  client.setCountry('BR');
  assert.equal(client.peek(game), null);
  const br = await client.forGame(game);
  assert.equal(br.currency, 'BRL');
  assert.equal(calls, 2);

  // Verify 429 cooldown prevents hitting backend during cooldown window.
  let rateLimitedCalls = 0;
  const limitedClient = new PriceClient({
    now: () => clock,
    request: async () => {
      rateLimitedCalls++;
      return jsonResponse({ error: 'Too many requests', retryAfter: 60 }, 429);
    },
  });
  const fallback1 = await limitedClient.forGame(game);
  const fallback2 = await limitedClient.forGame({ id: 41494, slug: 'cyberpunk-2077', name: 'Cyberpunk 2077' });
  assert.equal(rateLimitedCalls, 1);
  assert.equal(fallback1.stores.steam.price, 35.99);
  assert.equal(fallback2.stores.gog.price, 29.99);

  // Verify default fetch keeps Window receiver.
  context.mock.method(globalThis, 'fetch', function () {
    if (this !== globalThis) throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
    return Promise.resolve(jsonResponse({ found: true, country: 'US', currency: 'USD', bestStore: 'steam', stores: { steam: { price: 12.49, formattedPrice: '$12.49', cut: 50, url: 'https://store.steampowered.com/app/1145360/Hades/' }, gog: null, epic: null } }));
  });
  const nativeClient = new PriceClient();
  const res = await nativeClient.forGame({ id: 274755, slug: 'hades-2018', name: 'Hades' });
  assert.equal(res.stores.steam.price, 12.49);
});

test('stripTitleNoise and scoreDealTitle handle RAWG year suffixes, canonical editions, and reject DLC/soundtracks', () => {
  assert.equal(stripTitleNoise('God of War (2018)'), 'God of War');
  assert.equal(stripTitleNoise('Tomb Raider (2013)'), 'Tomb Raider');
  assert.equal(stripTitleNoise('Life is Strange - Episode 1'), 'Life is Strange');

  assert.equal(scoreDealTitle('God of War (2018)', 'God of War'), 100);
  assert.equal(scoreDealTitle('Disco Elysium', 'Disco Elysium - The Final Cut'), 90);
  assert.equal(scoreDealTitle('Control', 'Control Ultimate Edition'), 90);
  assert.equal(scoreDealTitle('The Witcher 3: Wild Hunt', 'The Witcher 3: Wild Hunt Remastered'), 90);
  assert.equal(scoreDealTitle('Hollow Knight', 'Hollow Knight - Official Soundtrack'), 0);
  assert.equal(scoreDealTitle('Tomb Raider (2013)', 'Dead by Daylight: Tomb Raider'), 0);
  assert.equal(scoreDealTitle('DOOM (2016)', 'Deponia Doomsday'), 0);
});

test('PriceClient falls back to live public store deals when static hosting returns 404 or backend is unconfigured', async () => {
  let clock = 1_700_000_000_000;
  const requestedUrls = [];
  const client = new PriceClient({
    country: 'US',
    now: () => clock,
    request: async url => {
      const href = String(url);
      requestedUrls.push(href);
      if (href.startsWith('./api/prices')) {
        return jsonResponse({ error: 'Not found' }, 404);
      }
      if (href.startsWith(PUBLIC_DEALS_URL)) {
        return jsonResponse([
          { title: 'Disco Elysium - Soundtrack', storeID: '7', salePrice: '3.99', normalPrice: '14.99', savings: '73' },
          { title: 'Disco Elysium - The Final Cut', storeID: '7', salePrice: '9.99', normalPrice: '39.99', savings: '75', steamAppID: '632470' },
          { title: 'Disco Elysium - The Final Cut', storeID: '1', salePrice: '14.99', normalPrice: '39.99', savings: '62.5', steamAppID: '632470' },
          { title: 'Disco Elysium - The Final Cut', storeID: '25', salePrice: '11.99', normalPrice: '39.99', savings: '70', steamAppID: null },
        ]);
      }
      throw new Error(`Unexpected URL: ${href}`);
    },
  });

  const rawgGame = { id: 28153, slug: 'disco-elysium', name: 'Disco Elysium', platforms: ['pc', 'playstation4'] };
  const usSnapshot = await client.forGame(rawgGame);
  assert.equal(usSnapshot.found, true);
  assert.equal(usSnapshot.source, 'public-stores');
  assert.equal(usSnapshot.bestStore, 'gog');
  assert.equal(usSnapshot.stores.gog.price, 9.99);
  assert.equal(usSnapshot.stores.gog.cut, 75);
  assert.equal(usSnapshot.stores.steam.price, 14.99);
  assert.equal(usSnapshot.stores.steam.url, 'https://store.steampowered.com/app/632470/');
  assert.equal(usSnapshot.stores.epic.price, 11.99);
  assert.equal(requestedUrls.length, 2); // 1st: ./api/prices (404), 2nd: CheapShark deals

  // Switching to BR reuses cached raw deals without any extra network call and converts to BRL.
  client.setCountry('BR');
  const brSnapshot = await client.forGame(rawgGame);
  assert.equal(brSnapshot.found, true);
  assert.equal(brSnapshot.currency, 'BRL');
  assert.equal(brSnapshot.bestStore, 'gog');
  assert.ok(brSnapshot.stores.gog.price > 50);
  assert.equal(requestedUrls.length, 2);

  // Console-only RAWG game (no 'pc' in platforms) resolves immediately without network calls.
  const consoleGame = { id: 99911, slug: 'bloodborne', name: 'Bloodborne', platforms: ['playstation4'] };
  const consoleSnapshot = await client.forGame(consoleGame);
  assert.equal(consoleSnapshot.consoleOnly, true);
  assert.equal(consoleSnapshot.found, false);
  assert.equal(requestedUrls.length, 2);

  // Free-to-Play PC titles resolve with price 0 ('Free').
  const f2p = demoPriceSnapshot({ slug: 'counter-strike-2', title: 'Counter-Strike 2', country: 'US', now: clock });
  assert.equal(f2p.found, true);
  assert.equal(f2p.stores.steam.price, 0);
  assert.equal(f2p.stores.steam.formattedPrice, 'Free');
});

test('ItadPriceService retries stripped RAWG year titles on ITAD and serves live public fallback when unconfigured', async () => {
  const itadCalls = [];
  const serviceWithKey = new ItadPriceService({
    apiKey: 'itad-test-key',
    request: async url => {
      const parsed = new URL(url);
      itadCalls.push(parsed.pathname + parsed.search);
      if (parsed.pathname === '/games/lookup/v1') {
        if (parsed.searchParams.get('title') === 'God of War (2018)') {
          return jsonResponse({ found: false });
        }
        if (parsed.searchParams.get('title') === 'God of War') {
          return jsonResponse({ found: true, game: { id: 'uuid-gow-2018' } });
        }
      }
      if (parsed.pathname === '/games/prices/v3') {
        return jsonResponse([{ id: 'uuid-gow-2018', deals: [{ shop: { id: 61, name: 'Steam' }, price: { amount: 19.99, currency: 'USD' }, regular: { amount: 49.99, currency: 'USD' }, cut: 60, url: 'https://store.steampowered.com/app/1593500/God_of_War/' }] }]);
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  });

  const gow = await serviceWithKey.getPrices({ title: 'God of War (2018)', slug: 'god-of-war-2', country: 'US', clientId: '10.0.0.9' });
  assert.equal(gow.found, true);
  assert.equal(gow.stores.steam.price, 19.99);
  assert.equal(itadCalls.length, 3); // 1st lookup (with year), 2nd lookup (stripped year), 3rd prices/v3

  // Unconfigured service with enablePublicFallback: true resolves non-demo RAWG games via public storefront deals.
  const keylessService = new ItadPriceService({
    apiKey: '',
    enablePublicFallback: true,
    request: async url => {
      assert.ok(String(url).startsWith(PUBLIC_DEALS_URL));
      return jsonResponse([
        { title: 'Subnautica', storeID: '1', salePrice: '14.99', normalPrice: '29.99', savings: '50', steamAppID: '264710' },
      ]);
    },
  });
  const subnautica = await keylessService.getPrices({ title: 'Subnautica', slug: 'subnautica', country: 'US', clientId: '10.0.0.10' });
  assert.equal(subnautica.found, true);
  assert.equal(subnautica.source, 'public-stores');
  assert.equal(subnautica.stores.steam.price, 14.99);
});

