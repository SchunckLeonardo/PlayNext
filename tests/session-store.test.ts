import { createClient } from "@supabase/supabase-js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import {
  createSessionStorage,
  memoryBackend,
  indexedDbBackend,
  SESSION_MAX_IDLE_MS,
} from "../src/lib/session-store.ts";
import {
  persistentAuthOptions,
  MEMORY_AUTH_OPTIONS,
  isAuthFailure,
} from "../src/lib/account.ts";

const KEY = "sb-abcdefghijklmnopqrst-auth-token";
const SESSION = JSON.stringify({
  access_token: "synthetic-access-SECRET",
  refresh_token: "synthetic-refresh-SECRET",
  expires_at: 4102444800,
});
const bytes = (value) =>
  Buffer.from(
    value instanceof ArrayBuffer ? new Uint8Array(value) : value,
  ).toString("latin1");
const sealedText = (backend) =>
  [...backend.map.values()]
    .map((v) => (v?.data ? bytes(v.data) + bytes(v.iv) : String(v)))
    .join("|");

// Blocks any access to Web Storage while `run` executes.
async function withoutWebStorage(run) {
  const saved = {};
  for (const name of ["localStorage", "sessionStorage"]) {
    saved[name] = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() {
        throw new Error(name + " must not be used");
      },
    });
  }
  try {
    return await run();
  } finally {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

test("session tokens are sealed with AES-GCM under a non-extractable key and never stored in plaintext", async () => {
  const backend = memoryBackend();
  const storage = createSessionStorage({ backend });
  assert.equal(storage.persistent, true);
  await withoutWebStorage(() => storage.setItem(KEY, SESSION));
  assert.doesNotMatch(sealedText(backend), /SECRET|refresh_token|access_token/);
  const deviceKey = backend.map.get("key:aes-gcm");
  assert.equal(deviceKey.extractable, false);
  assert.deepEqual([...deviceKey.usages].sort(), ["decrypt", "encrypt"]);
  await assert.rejects(crypto.webcrypto.subtle.exportKey("raw", deviceKey));
  // A reload builds a new adapter over the same IndexedDB contents and restores the session.
  assert.equal(await createSessionStorage({ backend }).getItem(KEY), SESSION);
});

test("tampered, relocated or foreign ciphertext is discarded instead of trusted", async () => {
  const backend = memoryBackend();
  const storage = createSessionStorage({ backend });
  await storage.setItem(KEY, SESSION);
  const record = backend.map.get("item:" + KEY);
  // The storage key is bound as AES-GCM additional data.
  const otherKey = "sb-zzzzzzzzzzzzzzzzzzzz-auth-token";
  backend.map.set("item:" + otherKey, { ...record });
  assert.equal(await storage.getItem(otherKey), null);
  assert.equal(backend.map.has("item:" + otherKey), false);
  const data = new Uint8Array(record.data.slice(0));
  data[0] ^= 1;
  backend.map.set("item:" + KEY, { ...record, data: data.buffer });
  assert.equal(await storage.getItem(KEY), null);
  assert.equal(backend.map.has("item:" + KEY), false);
});

test("a session unused for 30 days expires, while regular use keeps sliding the window", async () => {
  let clock = Date.UTC(2026, 9, 19);
  const backend = memoryBackend();
  const storage = createSessionStorage({ backend, now: () => clock });
  await storage.setItem(KEY, SESSION);
  clock += SESSION_MAX_IDLE_MS - 60_000;
  assert.equal(await storage.getItem(KEY), SESSION);
  await storage.setItem(KEY, SESSION); // Supabase rewrites the session on every token refresh.
  clock += SESSION_MAX_IDLE_MS - 60_000;
  assert.equal(await storage.getItem(KEY), SESSION);
  clock += 120_000;
  assert.equal(await storage.getItem(KEY), null);
  assert.equal(backend.map.has("item:" + KEY), false);
});

test("only Supabase auth keys and bounded values are accepted", async () => {
  const storage = createSessionStorage({ backend: memoryBackend() });
  for (const key of [
    "playnext.rawg.key",
    "playnext.api.key",
    "sb-x-auth-token/../evil",
    "",
    null,
  ]) {
    await assert.rejects(storage.setItem(key, "x"), /SESSION_KEY_REJECTED/);
  }
  await assert.rejects(
    storage.setItem(KEY, "x".repeat(70000)),
    /SESSION_VALUE_REJECTED/,
  );
  await assert.rejects(
    storage.setItem(KEY, { not: "a string" }),
    /SESSION_VALUE_REJECTED/,
  );
  for (const key of [
    "sb-127-auth-token",
    "sb-localhost-auth-token",
    KEY + "-code-verifier",
    KEY + "-user",
    KEY + "-flows-code-verifier",
    KEY + "-flow-abcDEF12_-x-code-verifier",
  ]) {
    await storage.setItem(key, "ok");
    assert.equal(await storage.getItem(key), "ok");
  }
  // Unknown keys are never stored and read as empty without breaking the SDK.
  assert.equal(await storage.getItem("playnext.rawg.key"), null);
  await storage.removeItem("playnext.rawg.key");
});

test("a tab keeps decrypting after another tab signs out and back in with a new device key", async () => {
  const backend = memoryBackend();
  const tabA = createSessionStorage({ backend }),
    tabB = createSessionStorage({ backend });
  await tabA.setItem(KEY, SESSION);
  assert.equal(await tabB.getItem(KEY), SESSION);
  await tabA.wipe();
  await tabA.setItem(KEY, SESSION.replace("SECRET", "ROTATED"));
  assert.match(await tabB.getItem(KEY), /ROTATED/);
});

test("sign-out wipe removes sealed tokens and the device key; a new sign-in uses a fresh key", async () => {
  const backend = memoryBackend();
  const storage = createSessionStorage({ backend });
  await storage.setItem(KEY, SESSION);
  const firstKey = backend.map.get("key:aes-gcm");
  await storage.wipe();
  assert.equal(backend.map.size, 0);
  assert.equal(await storage.getItem(KEY), null);
  await storage.setItem(KEY, SESSION);
  assert.notEqual(backend.map.get("key:aes-gcm"), firstKey);
  await storage.removeItem(KEY);
  assert.equal(backend.map.has("item:" + KEY), false);
});

test("concurrent tabs agree on a single device key", async () => {
  const backend = memoryBackend();
  const a = createSessionStorage({ backend }),
    b = createSessionStorage({ backend });
  await Promise.all([
    a.setItem(KEY, SESSION),
    b.setItem(KEY + "-user", '{"id":"u"}'),
  ]);
  assert.equal(await createSessionStorage({ backend }).getItem(KEY), SESSION);
  assert.equal(
    await createSessionStorage({ backend }).getItem(KEY + "-user"),
    '{"id":"u"}',
  );
});

test("without IndexedDB or WebCrypto the session falls back to tab memory, never Web Storage", async () => {
  await withoutWebStorage(async () => {
    for (const options of [
      { indexedDB: undefined },
      { indexedDB: fakeIndexedDB(), crypto: {} },
    ]) {
      const storage = createSessionStorage(options);
      assert.equal(storage.persistent, false);
      await storage.setItem(KEY, SESSION);
      assert.equal(await storage.getItem(KEY), SESSION);
      await storage.removeItem(KEY);
      assert.equal(await storage.getItem(KEY), null);
    }
  });
});

test("a failing IndexedDB write keeps the session for this tab instead of losing it", async () => {
  const backend = {
    ...memoryBackend(),
    put: async () => {
      throw new Error("QuotaExceededError");
    },
  };
  const storage = createSessionStorage({ backend });
  await storage.setItem(KEY, SESSION);
  assert.equal(await storage.getItem(KEY), SESSION);
});

test("the IndexedDB backend creates its store and supports get/put/delete/clear/putIfAbsent", async () => {
  const idb = fakeIndexedDB();
  const backend = indexedDbBackend(idb);
  assert.equal(await backend.get("missing"), undefined);
  await backend.put("a", { v: 1 });
  assert.deepEqual(await backend.get("a"), { v: 1 });
  assert.deepEqual(await backend.putIfAbsent("a", { v: 2 }), { v: 1 });
  assert.deepEqual(await backend.putIfAbsent("b", { v: 3 }), { v: 3 });
  await backend.delete("a");
  assert.equal(await backend.get("a"), undefined);
  await backend.clear();
  assert.equal(await backend.get("b"), undefined);
  // End to end with the real crypto adapter over the IndexedDB backend.
  const storage = createSessionStorage({ indexedDB: idb });
  await storage.setItem(KEY, SESSION);
  assert.equal(
    await createSessionStorage({ indexedDB: idb }).getItem(KEY),
    SESSION,
  );
  assert.doesNotMatch(JSON.stringify([...idb.dump()]), /SECRET/);
});

test("the bundled Supabase SDK keeps access and refresh tokens across a reload and removes them on sign-out", async () => {
  const backend = memoryBackend();
  const calls = [];
  const context = vm.createContext({
    console,
    URL,
    Headers,
    Request,
    Response,
    AbortController,
    TextEncoder,
    TextDecoder,
    crypto: crypto.webcrypto,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    WebSocket: globalThis.WebSocket,
    fetch: async (url) => {
      calls.push(String(url));
      if (String(url).includes("/logout"))
        return new Response(null, { status: 204 });
      assert.match(String(url), /\/auth\/v1\/user$/);
      return new Response(
        JSON.stringify({
          id: "00000000-0000-4000-8000-000000000001",
          aud: "authenticated",
          email: "test@example.invalid",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  const make = () =>
    createClient(
      "https://abcdefghijklmnopqrst.supabase.co",
      "sb_publishable_synthetic",
      {
        auth: persistentAuthOptions(createSessionStorage({ backend })),
        global: { fetch: context.fetch },
      },
    );
  const part = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const token =
    part({ alg: "HS256", typ: "JWT" }) +
    "." +
    part({
      exp: Math.floor(Date.now() / 1000) + 3600,
      sub: "00000000-0000-4000-8000-000000000001",
    }) +
    "." +
    Buffer.from("synthetic-signature").toString("base64url");
  const first = make();
  try {
    assert.equal(
      (
        await first.auth.setSession({
          access_token: token,
          refresh_token: "synthetic-refresh-SECRET",
        })
      ).error,
      null,
    );
  } finally {
    await first.auth.stopAutoRefresh();
  }
  assert.ok(
    backend.map.has("item:" + KEY),
    "session sealed under the Supabase storage key",
  );
  assert.doesNotMatch(sealedText(backend), /SECRET|synthetic-signature/);

  // Simulated reload: a fresh client restores the session without contacting Google or Auth.
  const callsBefore = calls.length;
  const second = make();
  try {
    const { data } = await second.auth.getSession();
    assert.equal(data.session.user.email, "test@example.invalid");
    assert.equal(data.session.refresh_token, "synthetic-refresh-SECRET");
    assert.equal(data.session.access_token, token);
    assert.equal(calls.length, callsBefore);
    await second.auth.signOut({ scope: "local" });
    assert.ok(
      calls.some((url) => url.includes("/logout")),
      "server-side refresh token revoked",
    );
    assert.equal(backend.map.has("item:" + KEY), false);
    assert.equal((await second.auth.getSession()).data.session, null);
  } finally {
    await second.auth.stopAutoRefresh();
  }
});

test("an expired access_token is automatically refreshed via refresh_token and re-sealed on reload", async () => {
  const backend = memoryBackend();
  const refreshBodies = [];
  const part = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const freshToken =
    part({ alg: "HS256", typ: "JWT" }) +
    "." +
    part({
      exp: Math.floor(Date.now() / 1000) + 3600,
      sub: "00000000-0000-4000-8000-000000000001",
    }) +
    "." +
    Buffer.from("rotated-sig").toString("base64url");
  const context = vm.createContext({
    console,
    URL,
    Headers,
    Request,
    Response,
    AbortController,
    TextEncoder,
    TextDecoder,
    crypto: crypto.webcrypto,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    WebSocket: globalThis.WebSocket,
    fetch: async (url, init) => {
      if (String(url).includes("grant_type=refresh_token")) {
        refreshBodies.push(JSON.parse(init.body));
        return new Response(
          JSON.stringify({
            access_token: freshToken,
            refresh_token: "rotated-refresh-SECRET",
            expires_in: 3600,
            token_type: "bearer",
            user: {
              id: "00000000-0000-4000-8000-000000000001",
              aud: "authenticated",
              email: "test@example.invalid",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          id: "00000000-0000-4000-8000-000000000001",
          aud: "authenticated",
          email: "test@example.invalid",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  const storage = createSessionStorage({ backend });
  // Seed a session whose access_token is already expired so getSession() must use refresh_token.
  const expiredToken =
    part({ alg: "HS256", typ: "JWT" }) +
    "." +
    part({
      exp: Math.floor(Date.now() / 1000) - 120,
      sub: "00000000-0000-4000-8000-000000000001",
    }) +
    "." +
    Buffer.from("expired-sig").toString("base64url");
  await storage.setItem(
    KEY,
    JSON.stringify({
      access_token: expiredToken,
      refresh_token: "initial-refresh-SECRET",
      expires_at: Math.floor(Date.now() / 1000) - 120,
      expires_in: 3600,
      token_type: "bearer",
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        aud: "authenticated",
        email: "test@example.invalid",
      },
    }),
  );
  const client = createClient(
    "https://abcdefghijklmnopqrst.supabase.co",
    "sb_publishable_synthetic",
    {
      auth: persistentAuthOptions(createSessionStorage({ backend })),
      global: { fetch: context.fetch },
    },
  );
  try {
    const { data, error } = await client.auth.getSession();
    assert.equal(error, null);
    assert.deepEqual(refreshBodies, [
      { refresh_token: "initial-refresh-SECRET" },
    ]);
    assert.equal(data.session.access_token, freshToken);
    assert.equal(data.session.refresh_token, "rotated-refresh-SECRET");
    assert.doesNotMatch(sealedText(backend), /SECRET|rotated-sig/);
    const reloaded = JSON.parse(
      await createSessionStorage({ backend }).getItem(KEY),
    );
    assert.equal(reloaded.access_token, freshToken);
    assert.equal(reloaded.refresh_token, "rotated-refresh-SECRET");
  } finally {
    await client.auth.stopAutoRefresh();
  }
});

test("auth options: main app persists through the sealed store, the popup stays memory-only", () => {
  const storage = createSessionStorage({ backend: memoryBackend() });
  const options = persistentAuthOptions(storage);
  assert.equal(options.persistSession, true);
  assert.equal(options.autoRefreshToken, true);
  assert.equal(options.detectSessionInUrl, false);
  assert.equal(options.storage, storage);
  assert.equal(MEMORY_AUTH_OPTIONS.persistSession, false);
  assert.equal("storage" in MEMORY_AUTH_OPTIONS, false);
});

test("restored sessions are dropped only on auth rejections, not on network failures", () => {
  for (const error of [
    { status: 401 },
    { code: "PGRST301" },
    { code: "42501", message: "AUTH_REQUIRED" },
    { code: "refresh_token_not_found" },
    { message: "JWT expired" },
  ])
    assert.equal(isAuthFailure(error), true);
  for (const error of [
    new TypeError("Failed to fetch"),
    { status: 503 },
    { code: "40001" },
    null,
  ])
    assert.equal(isAuthFailure(error), false);
});

// Small asynchronous IndexedDB stand-in: requests fire on later tasks and a transaction
// completes after its last request (including requests issued from success callbacks).
function fakeIndexedDB() {
  const databases = new Map();
  const later = (fn) => setTimeout(fn, 0);
  return {
    dump: () =>
      [...databases.values()]
        .flatMap((stores) =>
          [...stores.values()].flatMap((store) => [...store.values()]),
        )
        .map((v) => (v?.data ? bytes(v.data) : v)),
    open(name) {
      const request = {};
      later(() => {
        const isNew = !databases.has(name);
        if (isNew) databases.set(name, new Map());
        const stores = databases.get(name);
        const db = {
          objectStoreNames: { contains: (storeName) => stores.has(storeName) },
          createObjectStore: (storeName) => {
            stores.set(storeName, new Map());
          },
          close() {},
          transaction(storeName, mode) {
            const map = stores.get(storeName);
            const tx = {};
            let pending = 0;
            const finish = () => {
              if (pending === 0) later(() => tx.oncomplete?.());
            };
            const issue = (operate) => {
              const req = {};
              pending++;
              later(() => {
                req.result = operate();
                req.onsuccess?.();
                pending--;
                finish();
              });
              return req;
            };
            const writable = () => {
              if (mode !== "readwrite") throw new Error("ReadOnlyError");
            };
            tx.objectStore = () => ({
              get: (key) => issue(() => map.get(key)),
              put: (value, key) => {
                writable();
                return issue(() => {
                  map.set(key, value);
                  return key;
                });
              },
              delete: (key) => {
                writable();
                return issue(() => {
                  map.delete(key);
                });
              },
              clear: () => {
                writable();
                return issue(() => {
                  map.clear();
                });
              },
            });
            return tx;
          },
        };
        request.result = db;
        if (isNew) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
}
