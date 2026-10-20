interface SessionBackend {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<unknown>;
  delete(key: string): Promise<unknown>;
  clear(): Promise<unknown>;
  putIfAbsent<T>(key: string, value: T): Promise<T>;
}
interface SealedRecord {
  savedAt: number;
  iv: Uint8Array<ArrayBuffer>;
  data: ArrayBuffer;
}
// Keeps the Supabase session (access_token + refresh_token) on this device so a reload
// does not require another Google sign-in. Values are encrypted with AES-GCM under a
// non-extractable WebCrypto key; both live in IndexedDB. Same-origin JavaScript
// can still use that key; this does not protect against XSS or a compromised device.
// localStorage and sessionStorage are never used. Without IndexedDB/WebCrypto the
// adapter falls back to tab memory (the previous behavior).

export const SESSION_DB = "playnext-session";
export const SESSION_STORE = "sealed";
export const SESSION_DB_VERSION = 1;
export const SESSION_MAX_IDLE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days without use.
export const SESSION_MAX_VALUE = 65536;
const KEY_ID = "key:aes-gcm";
const ITEM_PREFIX = "item:";
// Supabase Auth keys only: the session, its user copy and PKCE verifier bookkeeping.
const ALLOWED_KEY =
  /^sb-[a-z0-9-]{1,80}-auth-token(?:-user|-code-verifier|-flows-code-verifier|-flow-[A-Za-z0-9_-]{8,64}-code-verifier)?$/;

const promisify = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("IDB_REQUEST_FAILED"));
  });

// Minimal IndexedDB backend. Every operation is its own transaction, so no await happens
// while a transaction is open (transactions auto-commit across tasks).
export function indexedDbBackend(
  idb: IDBFactory,
  name = SESSION_DB,
): SessionBackend {
  let opening: Promise<IDBDatabase> | null = null;
  const open = () => {
    opening ||= new Promise((resolve, reject) => {
      const request = idb.open(name, SESSION_DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(SESSION_STORE))
          request.result.createObjectStore(SESSION_STORE);
      };
      request.onsuccess = () => {
        const db = request.result;
        // Another tab may upgrade or delete the database; reopen lazily next time.
        db.onversionchange = () => {
          db.close();
          opening = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        opening = null;
        reject(request.error || new Error("IDB_OPEN_FAILED"));
      };
      request.onblocked = () => {
        opening = null;
        reject(new Error("IDB_BLOCKED"));
      };
    });
    return opening;
  };
  const run = async <T>(
    mode: IDBTransactionMode,
    operate: (store: IDBObjectStore) => Promise<T>,
  ): Promise<T> => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSION_STORE, mode);
      let result: T;
      Promise.resolve(operate(tx.objectStore(SESSION_STORE))).then((value) => {
        result = value;
      }, reject);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error("IDB_TX_FAILED"));
      tx.onabort = () => reject(tx.error || new Error("IDB_TX_ABORTED"));
    });
  };
  return {
    get: (key) => run("readonly", (store) => promisify(store.get(key))),
    put: (key, value) =>
      run("readwrite", (store) => promisify(store.put(value, key))),
    delete: (key) => run("readwrite", (store) => promisify(store.delete(key))),
    clear: () => run("readwrite", (store) => promisify(store.clear())),
    // Atomic "insert if missing": two tabs generating keys concurrently agree on one.
    putIfAbsent: <T>(key: string, value: T) =>
      run<T>(
        "readwrite",
        (store) =>
          new Promise<T>((resolve, reject) => {
            const request = store.get(key);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              if (request.result !== undefined) {
                resolve(request.result);
                return;
              }
              store.put(value, key).onsuccess = () => resolve(value);
            };
          }),
      ),
  };
}

export function memoryBackend() {
  const map = new Map<string, unknown>();
  return {
    map,
    get: async (key: string) => map.get(key),
    put: async (key: string, value: unknown) => {
      map.set(key, value);
    },
    delete: async (key: string) => {
      map.delete(key);
    },
    clear: async () => {
      map.clear();
    },
    putIfAbsent: async <T>(key: string, value: T): Promise<T> => {
      if (!map.has(key)) map.set(key, value);
      return map.get(key) as T;
    },
  };
}

// Supabase-compatible async storage: { getItem, setItem, removeItem }.
export function createSessionStorage({
  backend,
  indexedDB = globalThis.indexedDB,
  crypto = globalThis.crypto,
  now = () => Date.now(),
  maxIdleMs = SESSION_MAX_IDLE_MS,
}: {
  backend?: SessionBackend;
  indexedDB?: IDBFactory;
  crypto?: Crypto;
  now?: () => number;
  maxIdleMs?: number;
} = {}) {
  const subtle = crypto?.subtle;
  let store: SessionBackend | null = null;
  try {
    store =
      backend || (indexedDB && subtle ? indexedDbBackend(indexedDB) : null);
  } catch {
    store = null;
  }
  const memory = new Map<string, string>();
  const encoder = new TextEncoder(),
    decoder = new TextDecoder();
  let creating: Promise<CryptoKey> | null = null;

  // The key is read on every use so tabs never hold a stale key after another tab signs out.
  // Concurrent creation is deduplicated here and atomically across tabs by putIfAbsent.
  const cryptoKey = async (): Promise<CryptoKey> => {
    if (!store || !subtle) throw new Error("SESSION_STORAGE_UNAVAILABLE");
    const currentStore = store;
    const existing = await store.get(KEY_ID);
    if (existing) return existing as CryptoKey;
    creating ||= subtle
      .generateKey({ name: "AES-GCM", length: 256 }, false, [
        "encrypt",
        "decrypt",
      ])
      .then((created) => currentStore.putIfAbsent(KEY_ID, created))
      .finally(() => {
        creating = null;
      });
    return creating;
  };
  const allowed = (key: string) =>
    typeof key === "string" && ALLOWED_KEY.test(key);
  const discard = async (key: string) => {
    memory.delete(key);
    try {
      await store?.delete(ITEM_PREFIX + key);
    } catch {
      /* best effort */
    }
  };

  return {
    isServer: false,
    get persistent() {
      return !!(store && subtle);
    },
    async getItem(key: string) {
      if (!allowed(key)) return null;
      if (memory.has(key)) return memory.get(key) ?? null;
      if (!store || !subtle) return null;
      try {
        const record = (await store.get(ITEM_PREFIX + key)) as
          SealedRecord | undefined;
        if (!record) return null;
        if (
          !Number.isFinite(record.savedAt) ||
          now() - record.savedAt > maxIdleMs ||
          now() < record.savedAt - 60_000
        ) {
          await discard(key);
          return null;
        }
        const plain = await subtle.decrypt(
          {
            name: "AES-GCM",
            iv: record.iv,
            additionalData: encoder.encode(key),
          },
          await cryptoKey(),
          record.data,
        );
        return decoder.decode(plain);
      } catch {
        // Tampered, foreign or undecryptable data is dropped; the user simply signs in again.
        await discard(key);
        return null;
      }
    },
    async setItem(key: string, value: string) {
      if (!allowed(key)) throw new Error("SESSION_KEY_REJECTED");
      if (typeof value !== "string" || value.length > SESSION_MAX_VALUE)
        throw new Error("SESSION_VALUE_REJECTED");
      if (!store || !subtle) {
        memory.set(key, value);
        return;
      }
      try {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const data = await subtle.encrypt(
          { name: "AES-GCM", iv, additionalData: encoder.encode(key) },
          await cryptoKey(),
          encoder.encode(value),
        );
        await store.put(ITEM_PREFIX + key, { iv, data, savedAt: now() });
        memory.delete(key);
      } catch {
        // Storage blocked or quota exceeded: keep the session for this tab only.
        memory.set(key, value);
      }
    },
    async removeItem(key: string) {
      if (allowed(key)) await discard(key);
    },
    // Called on sign-out/account deletion: removes sealed tokens and the device key.
    async wipe() {
      memory.clear();
      try {
        await store?.clear();
      } catch {
        /* best effort */
      }
    },
  };
}
