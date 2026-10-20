import test from "node:test";
import assert from "node:assert/strict";
import {
  ItadPriceService,
  normalizeItadPrices,
  PriceError,
} from "../src/server/itad.ts";
import { MemoryPriceStore } from "../src/server/price-store.ts";
import {
  handlePriceRequest,
  parsePriceQuery,
} from "../src/server/price-handler.ts";
import {
  CLIENT_HEADER_NAME,
  CLIENT_HEADER_VALUE,
  PROOF_HEADER_NAME,
  PriceClient,
  computeBotProof,
  safeStoreUrl,
} from "../src/lib/prices.ts";
const ID = "018d937f-590c-728b-b353-387a5a713d7f";
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const query = {
  title: "Subnautica",
  released: "2018-01-23",
  country: "US" as const,
};
const row = (amount: number, currency = "USD", extra = {}) => [
  {
    id: ID,
    deals: [
      {
        shop: { id: 61 },
        price: { amount, currency },
        regular: { amount: amount * 2, currency },
        cut: 50,
        url: "https://itad.link/verified-offer/",
      },
    ],
    ...extra,
  },
];
function provider() {
  let price = 10,
    present = true;
  const calls: { path: string; url: URL; options: RequestInit | undefined }[] =
    [];
  const request: typeof fetch = async (input, options) => {
    const url = new URL(String(input));
    calls.push({ path: url.pathname, url, options });
    assert.equal(url.origin, "https://api.isthereanydeal.com");
    assert.equal(url.searchParams.has("key"), false);
    assert.equal(
      new Headers(options?.headers).get("ITAD-API-Key"),
      "synthetic-key",
    );
    if (url.pathname === "/games/lookup/v1")
      return json(
        present ? { found: true, game: { id: ID } } : { found: false },
      );
    if (url.pathname === "/games/info/v2")
      return json({
        id: ID,
        title: "Subnautica",
        type: "game",
        appid: 264710,
        releaseDate: "2018-01-23",
      });
    if (url.pathname === "/games/prices/v3")
      return json(
        row(price, url.searchParams.get("country") === "BR" ? "BRL" : "USD"),
      );
    throw new Error("Unexpected provider path");
  };
  return {
    request,
    calls,
    set price(value: number) {
      price = value;
    },
    set present(value: boolean) {
      present = value;
    },
  };
}
test("uses official ITAD endpoints and actual country prices without currency conversion", async () => {
  const p = provider(),
    service = new ItadPriceService({
      apiKey: "synthetic-key",
      request: p.request,
    });
  const us = await service.getPrices(query);
  p.price = 49.9;
  const br = await service.getPrices({ ...query, country: "BR" });
  assert.equal(us.stores.steam?.amount, 10);
  assert.equal(br.stores.steam?.amount, 49.9);
  assert.equal(br.stores.steam?.currency, "BRL");
  assert.equal(br.source, "itad");
  assert.equal(p.calls.filter((c) => c.path === "/games/lookup/v1").length, 1);
  assert.deepEqual(
    p.calls
      .filter((c) => c.path === "/games/prices/v3")
      .map((c) => c.url.searchParams.get("country")),
    ["US", "BR"],
  );
  assert.equal(br.stores.steam?.url, "https://itad.link/verified-offer/");
});
test("Prey (2006) cannot receive the price of Prey (2017) after a title fallback", async () => {
  const calls: string[] = [];
  const service = new ItadPriceService({
    apiKey: "synthetic-key",
    request: async (input) => {
      const url = new URL(String(input));
      calls.push(url.pathname);
      if (url.pathname === "/games/lookup/v1")
        return json(
          url.searchParams.get("title") === "Prey (2006)"
            ? { found: false }
            : { found: true, game: { id: ID } },
        );
      if (url.pathname === "/games/info/v2")
        return json({
          id: ID,
          title: "Prey",
          type: "game",
          appid: 480490,
          releaseDate: "2017-05-04",
        });
      throw new Error("Must not request prices for a different game.");
    },
  });
  const result = await service.getPrices({
    title: "Prey (2006)",
    released: "2006-07-11",
    country: "US",
  });
  assert.equal(result.found, false);
  assert.equal(result.itadId, null);
  assert.ok(!calls.includes("/games/prices/v3"));
});
test("Steam identity supports a PC port with a later release date and rejects mismatched app IDs", async () => {
  const p = provider(),
    service = new ItadPriceService({
      apiKey: "synthetic-key",
      request: p.request,
    });
  assert.equal(
    (
      await service.getPrices({
        ...query,
        steamAppId: 264710,
        released: "2014-01-01",
      })
    ).found,
    true,
  );
  assert.equal(p.calls[0].url.searchParams.get("appid"), "264710");
  assert.equal(
    (await service.getPrices({ ...query, steamAppId: 999999 })).found,
    false,
  );
});
test("positive prices expire and fetch again; empty results also recover after their TTL", async () => {
  let now = 1700000000000;
  const p = provider(),
    store = new MemoryPriceStore(() => now),
    service = new ItadPriceService({
      apiKey: "synthetic-key",
      request: p.request,
      store,
      now: () => now,
    });
  assert.equal((await service.getPrices(query)).stores.steam?.amount, 10);
  now += 16 * 60_000;
  p.price = 20;
  assert.equal((await service.getPrices(query)).stores.steam?.amount, 20);
  assert.equal(p.calls.filter((c) => c.path === "/games/prices/v3").length, 2);
  const missing = provider();
  missing.present = false;
  const other = new ItadPriceService({
    apiKey: "synthetic-key",
    request: missing.request,
    store: new MemoryPriceStore(() => now),
    now: () => now,
  });
  assert.equal((await other.getPrices(query)).found, false);
  now += 6 * 60_000;
  missing.present = true;
  assert.equal((await other.getPrices(query)).found, true);
  assert.equal(
    missing.calls.filter((c) => c.path === "/games/lookup/v1").length,
    2,
  );
});
test("only an explicit all-time historical value is displayed, never a current or 1-year low", () => {
  assert.equal(normalizeItadPrices(row(10), ID, "US", 0).historyLow, null);
  assert.equal(
    normalizeItadPrices(
      row(10, "USD", { historyLow: { y1: { amount: 5, currency: "USD" } } }),
      ID,
      "US",
      0,
    ).historyLow,
    null,
  );
  assert.deepEqual(
    normalizeItadPrices(
      row(10, "USD", { historyLow: { all: { amount: 2.5, currency: "USD" } } }),
      ID,
      "US",
      0,
    ).historyLow,
    { amount: 2.5, currency: "USD" },
  );
  assert.equal(normalizeItadPrices(row(10, "USD"), ID, "BR", 0).found, false);
  assert.equal(
    normalizeItadPrices([{ ...row(10)[0], id: "different-game" }], ID, "US", 0)
      .found,
    false,
  );
});
test("missing configuration and provider errors never fall back to invented demo prices or expose the key", async () => {
  const service = new ItadPriceService({ apiKey: "" });
  await assert.rejects(
    service.getPrices(query),
    (error: unknown) => error instanceof PriceError && error.status === 503,
  );
  const failing = new ItadPriceService({
    apiKey: "synthetic-key",
    request: async () => {
      throw new Error("secret=synthetic-key");
    },
  });
  await assert.rejects(
    failing.getPrices(query),
    (error: unknown) =>
      error instanceof Error && !error.message.includes("synthetic-key"),
  );
});
test("same-game concurrent requests share upstream work and all instances share a quota store", async () => {
  const p = provider(),
    store = new MemoryPriceStore();
  const service = new ItadPriceService({
    apiKey: "synthetic-key",
    request: p.request,
    store,
  });
  await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      service.getPrices(query, `client-${i}`),
    ),
  );
  assert.equal(p.calls.length, 3);
  for (let i = 0; i < 77; i++)
    assert.equal(await store.take("itad:global", 80, 300000), true);
  const second = new ItadPriceService({
    apiKey: "synthetic-key",
    request: p.request,
    store,
  });
  await assert.rejects(
    second.getPrices({ ...query, title: "Uncached game" }),
    (error: unknown) => error instanceof PriceError && error.status === 429,
  );
  assert.equal(p.calls.length, 3);
});
function apiRequest(
  params = "title=Subnautica&country=US&released=2018-01-23",
  extra: RequestInit = {},
) {
  return new Request(`https://playnext.example/api/prices?${params}`, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      [CLIENT_HEADER_NAME]: CLIENT_HEADER_VALUE,
      [PROOF_HEADER_NAME]: computeBotProof(
        "Subnautica",
        "US",
        Math.floor(Date.now() / 60000),
      ),
    },
    ...extra,
  });
}
test("Next route returns typed price results and rejects forged, cross-origin and invalid requests", async () => {
  const p = provider(),
    service = new ItadPriceService({
      apiKey: "synthetic-key",
      request: p.request,
    });
  const response = await handlePriceRequest(apiRequest(), service);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).stores.steam.amount, 10);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(
    (
      await handlePriceRequest(
        apiRequest(undefined, { method: "POST" }),
        service,
      )
    ).status,
    405,
  );
  assert.equal(
    (
      await handlePriceRequest(
        apiRequest("title=Subnautica&country=XX"),
        service,
      )
    ).status,
    400,
  );
  const cross = apiRequest();
  cross.headers.set("origin", "https://evil.example");
  assert.equal((await handlePriceRequest(cross, service)).status, 403);
  const forged = apiRequest();
  forged.headers.set(PROOF_HEADER_NAME, "forged");
  assert.equal((await handlePriceRequest(forged, service)).status, 403);
  assert.throws(() =>
    parsePriceQuery(
      new URL("https://app.example/api/prices?title=x&steamAppId=NaN"),
    ),
  );
});
test("browser cache expires and console-only titles do not call the price API", async () => {
  let now = 0,
    calls = 0;
  const game = {
    id: 1,
    name: "Subnautica",
    slug: "subnautica",
    platforms: ["pc"],
    genres: [],
    image: "",
    description: "",
    released: "2018-01-23",
    rating: null,
    metacritic: null,
  };
  const client = new PriceClient(
    async () => {
      calls++;
      return json(normalizeItadPrices(row(calls * 10), ID, "US", now));
    },
    () => now,
  );
  assert.equal((await client.forGame(game, "US")).stores.steam?.amount, 10);
  assert.equal((await client.forGame(game, "US")).stores.steam?.amount, 10);
  now += 16 * 60_000;
  assert.equal((await client.forGame(game, "US")).stores.steam?.amount, 20);
  assert.equal(
    (await client.forGame({ ...game, platforms: ["playstation2"] }, "US"))
      .status,
    "console-only",
  );
  assert.equal(calls, 2);
  assert.equal(safeStoreUrl("https://evil.example/offer"), "");
  assert.equal(safeStoreUrl("javascript:alert(1)"), "");
});

test("per-client burst and window limits protect cached requests as well as upstream work", async () => {
  let now = 1700000000000;
  const p = provider(),
    service = new ItadPriceService({
      apiKey: "synthetic-key",
      request: p.request,
      store: new MemoryPriceStore(() => now),
      now: () => now,
    });
  for (let i = 0; i < 6; i++) await service.getPrices(query, "burst");
  await assert.rejects(
    service.getPrices(query, "burst"),
    (error: unknown) => error instanceof PriceError && error.status === 429,
  );
  for (let i = 0; i < 25; i++) {
    await service.getPrices(query, "window");
    now += 11000;
  }
  await assert.rejects(
    service.getPrices(query, "window"),
    (error: unknown) => error instanceof PriceError && error.status === 429,
  );
  now += 300000;
  assert.equal((await service.getPrices(query, "window")).found, true);
  assert.equal(p.calls.length, 3);
});
test("browser honors Retry-After without spamming the backend", async () => {
  let now = 1700000000000,
    calls = 0;
  const game = {
    id: 1,
    name: "Subnautica",
    slug: "subnautica",
    platforms: ["pc"],
    genres: [],
    image: "",
    description: "",
    released: "2018-01-23",
    rating: null,
    metacritic: null,
  };
  const client = new PriceClient(
    async () => {
      calls++;
      return new Response(JSON.stringify({ status: "rate-limited" }), {
        status: 429,
        headers: { "retry-after": "30" },
      });
    },
    () => now,
  );
  assert.equal((await client.forGame(game, "US")).status, "rate-limited");
  assert.equal(
    (await client.forGame({ ...game, id: 2 }, "US")).status,
    "rate-limited",
  );
  assert.equal(calls, 1);
  now += 31000;
  await client.forGame(game, "US");
  assert.equal(calls, 2);
});
