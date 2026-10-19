// Store price integration (Steam, GOG, Epic Games) via IsThereAnyDeal API v3/v1
// with multi-layer bot protection and a strict 5-minute sliding window rate limiter.

export const ITAD_SECRET_NAME = 'ITAD_API_KEY';
export const ITAD_ORIGIN = 'https://api.isthereanydeal.com';
export const ITAD_BASE_URL = 'https://api.isthereanydeal.com/';
export const ITAD_WINDOW_MS = 5 * 60 * 1000; // 5 minutes (300,000 ms)
export const ITAD_API_WINDOW_LIMIT = 100; // Official ITAD limit: 100 req / 5 min
export const ITAD_SAFE_UPSTREAM_BUDGET = 80; // Reserved safety margin below 100 req / 5 min
export const CLIENT_HEADER_NAME = 'x-playnext-client';
export const CLIENT_HEADER_VALUE = 'playnext-web/2';
export const PROOF_HEADER_NAME = 'x-playnext-proof';
export const ALLOWED_COUNTRIES = Object.freeze(['US', 'BR']);

export const ITAD_SHOPS = Object.freeze({
  steam: Object.freeze({ key: 'steam', id: 61, label: 'Steam', shortLabel: 'Steam', host: 'store.steampowered.com' }),
  gog: Object.freeze({ key: 'gog', id: 35, label: 'GOG', shortLabel: 'GOG', host: 'www.gog.com' }),
  epic: Object.freeze({ key: 'epic', id: 16, label: 'Epic Games', shortLabel: 'Epic', host: 'store.epicgames.com' }),
});

export const STORES = Object.freeze([
  ITAD_SHOPS.steam,
  ITAD_SHOPS.gog,
  ITAD_SHOPS.epic,
]);

const ALLOWED_STORE_HOSTS = new Set([
  'isthereanydeal.com',
  'next.isthereanydeal.com',
  'store.steampowered.com',
  'gog.com',
  'www.gog.com',
  'store.epicgames.com',
]);

const BOT_USER_AGENT_PATTERN = /(bot|crawler|spider|scraper|headlesschrome|curl|wget|python-requests|python-urllib|httpx|aiohttp|scrapy|go-http-client|java\/|axios|got\/|undici|postmanruntime|insomnia|phantomjs|sqlmap|nikto|nmap|masscan|zgrab)/i;

// Reference store data for demo/local catalog when ITAD_API_KEY is not configured in local/demo environments.
const DEMO_STORE_CATALOG = Object.freeze({
  'elden-ring': {
    itadId: '018d937f-590c-728b-b353-387a5a713d7f',
    US: {
      currency: 'USD',
      historyLow: { amount: 35.99, currency: 'USD' },
      stores: {
        steam: { amount: 35.99, regular: 59.99, cut: 40, url: 'https://store.steampowered.com/app/1245620/ELDEN_RING/' },
        gog: null,
        epic: null,
      },
    },
    BR: {
      currency: 'BRL',
      historyLow: { amount: 137.94, currency: 'BRL' },
      stores: {
        steam: { amount: 137.94, regular: 229.90, cut: 40, url: 'https://store.steampowered.com/app/1245620/ELDEN_RING/' },
        gog: null,
        epic: null,
      },
    },
  },
  'hollow-knight': {
    itadId: '018d937f-32c6-7364-b51b-e96f13a0e7a2',
    US: {
      currency: 'USD',
      historyLow: { amount: 7.49, currency: 'USD' },
      stores: {
        steam: { amount: 7.49, regular: 14.99, cut: 50, url: 'https://store.steampowered.com/app/367520/Hollow_Knight/' },
        gog: { amount: 7.49, regular: 14.99, cut: 50, url: 'https://www.gog.com/en/game/hollow_knight' },
        epic: null,
      },
    },
    BR: {
      currency: 'BRL',
      historyLow: { amount: 23.49, currency: 'BRL' },
      stores: {
        steam: { amount: 23.49, regular: 46.99, cut: 50, url: 'https://store.steampowered.com/app/367520/Hollow_Knight/' },
        gog: { amount: 23.49, regular: 46.99, cut: 50, url: 'https://www.gog.com/en/game/hollow_knight' },
        epic: null,
      },
    },
  },
  'red-dead-redemption-2': {
    itadId: '018d937f-4484-7140-8b25-170c99bf5604',
    US: {
      currency: 'USD',
      historyLow: { amount: 19.79, currency: 'USD' },
      stores: {
        steam: { amount: 19.79, regular: 59.99, cut: 67, url: 'https://store.steampowered.com/app/1174180/Red_Dead_Redemption_2/' },
        gog: null,
        epic: { amount: 19.79, regular: 59.99, cut: 67, url: 'https://store.epicgames.com/en-US/p/red-dead-redemption-2' },
      },
    },
    BR: {
      currency: 'BRL',
      historyLow: { amount: 98.96, currency: 'BRL' },
      stores: {
        steam: { amount: 98.96, regular: 299.90, cut: 67, url: 'https://store.steampowered.com/app/1174180/Red_Dead_Redemption_2/' },
        gog: null,
        epic: { amount: 98.96, regular: 299.90, cut: 67, url: 'https://store.epicgames.com/en-US/p/red-dead-redemption-2' },
      },
    },
  },
  'stardew-valley': {
    itadId: '018d937f-21e1-72be-a51a-3159b3286081',
    US: {
      currency: 'USD',
      historyLow: { amount: 7.49, currency: 'USD' },
      stores: {
        steam: { amount: 14.99, regular: 14.99, cut: 0, url: 'https://store.steampowered.com/app/413150/Stardew_Valley/' },
        gog: { amount: 14.99, regular: 14.99, cut: 0, url: 'https://www.gog.com/en/game/stardew_valley' },
        epic: null,
      },
    },
    BR: {
      currency: 'BRL',
      historyLow: { amount: 14.99, currency: 'BRL' },
      stores: {
        steam: { amount: 24.99, regular: 24.99, cut: 0, url: 'https://store.steampowered.com/app/413150/Stardew_Valley/' },
        gog: { amount: 24.99, regular: 24.99, cut: 0, url: 'https://www.gog.com/en/game/stardew_valley' },
        epic: null,
      },
    },
  },
  'the-legend-of-zelda-breath-of-the-wild': { consoleOnly: true },
  'portal-2': {
    itadId: '018d937f-0144-7288-9682-6c7a79a82b12',
    US: {
      currency: 'USD',
      historyLow: { amount: 0.99, currency: 'USD' },
      stores: {
        steam: { amount: 9.99, regular: 9.99, cut: 0, url: 'https://store.steampowered.com/app/620/Portal_2/' },
        gog: null,
        epic: null,
      },
    },
    BR: {
      currency: 'BRL',
      historyLow: { amount: 3.29, currency: 'BRL' },
      stores: {
        steam: { amount: 32.99, regular: 32.99, cut: 0, url: 'https://store.steampowered.com/app/620/Portal_2/' },
        gog: null,
        epic: null,
      },
    },
  },
  'shadow-of-the-colossus-2': { consoleOnly: true },
  'final-fantasy-vii': {
    itadId: '018d937e-f98a-7140-8b0e-e82c8164481e',
    US: {
      currency: 'USD',
      historyLow: { amount: 4.79, currency: 'USD' },
      stores: {
        steam: { amount: 11.99, regular: 11.99, cut: 0, url: 'https://store.steampowered.com/app/39140/FINAL_FANTASY_VII/' },
        gog: null,
        epic: null,
      },
    },
    BR: {
      currency: 'BRL',
      historyLow: { amount: 12.79, currency: 'BRL' },
      stores: {
        steam: { amount: 31.99, regular: 31.99, cut: 0, url: 'https://store.steampowered.com/app/39140/FINAL_FANTASY_VII/' },
        gog: null,
        epic: null,
      },
    },
  },
  'pokemon-heartgold-version': { consoleOnly: true },
  'the-legend-of-zelda-a-link-between-worlds': { consoleOnly: true },
  'forza-horizon': { consoleOnly: true },
  'hades-2018': {
    itadId: '018d937f-3a27-7364-8635-2c3f8498e71a',
    US: {
      currency: 'USD',
      historyLow: { amount: 8.49, currency: 'USD' },
      stores: {
        steam: { amount: 12.49, regular: 24.99, cut: 50, url: 'https://store.steampowered.com/app/1145360/Hades/' },
        gog: { amount: 12.49, regular: 24.99, cut: 50, url: 'https://www.gog.com/en/game/hades' },
        epic: { amount: 12.49, regular: 24.99, cut: 50, url: 'https://store.epicgames.com/en-US/p/hades' },
      },
    },
    BR: {
      currency: 'BRL',
      historyLow: { amount: 25.15, currency: 'BRL' },
      stores: {
        steam: { amount: 36.99, regular: 73.99, cut: 50, url: 'https://store.steampowered.com/app/1145360/Hades/' },
        gog: { amount: 36.99, regular: 73.99, cut: 50, url: 'https://www.gog.com/en/game/hades' },
        epic: { amount: 36.99, regular: 73.99, cut: 50, url: 'https://store.epicgames.com/en-US/p/hades' },
      },
    },
  },
  'hades': {
    itadId: '018d937f-3a27-7364-8635-2c3f8498e71a',
    US: {
      currency: 'USD',
      historyLow: { amount: 8.49, currency: 'USD' },
      stores: {
        steam: { amount: 12.49, regular: 24.99, cut: 50, url: 'https://store.steampowered.com/app/1145360/Hades/' },
        gog: { amount: 12.49, regular: 24.99, cut: 50, url: 'https://www.gog.com/en/game/hades' },
        epic: { amount: 12.49, regular: 24.99, cut: 50, url: 'https://store.epicgames.com/en-US/p/hades' },
      },
    },
    BR: {
      currency: 'BRL',
      historyLow: { amount: 25.15, currency: 'BRL' },
      stores: {
        steam: { amount: 36.99, regular: 73.99, cut: 50, url: 'https://store.steampowered.com/app/1145360/Hades/' },
        gog: { amount: 36.99, regular: 73.99, cut: 50, url: 'https://www.gog.com/en/game/hades' },
        epic: { amount: 36.99, regular: 73.99, cut: 50, url: 'https://store.epicgames.com/en-US/p/hades' },
      },
    },
  },
  'cyberpunk-2077': {
    itadId: '018d937f-590c-728b-b353-cyberpunk2077',
    US: {
      currency: 'USD',
      historyLow: { amount: 24.99, currency: 'USD' },
      stores: {
        steam: { amount: 29.99, regular: 59.99, cut: 50, url: 'https://store.steampowered.com/app/1091500/Cyberpunk_2077/' },
        gog: { amount: 29.99, regular: 59.99, cut: 50, url: 'https://www.gog.com/en/game/cyberpunk_2077' },
        epic: { amount: 29.99, regular: 59.99, cut: 50, url: 'https://store.epicgames.com/en-US/p/cyberpunk-2077' },
      },
    },
    BR: {
      currency: 'BRL',
      historyLow: { amount: 99.95, currency: 'BRL' },
      stores: {
        steam: { amount: 99.95, regular: 199.90, cut: 50, url: 'https://store.steampowered.com/app/1091500/Cyberpunk_2077/' },
        gog: { amount: 99.95, regular: 199.90, cut: 50, url: 'https://www.gog.com/en/game/cyberpunk_2077' },
        epic: { amount: 99.95, regular: 199.90, cut: 50, url: 'https://store.epicgames.com/en-US/p/cyberpunk-2077' },
      },
    },
  },
  'celeste': {
    itadId: '018d937f-21e1-72be-a51a-celeste00001',
    US: {
      currency: 'USD',
      historyLow: { amount: 1.99, currency: 'USD' },
      stores: {
        steam: { amount: 4.99, regular: 19.99, cut: 75, url: 'https://store.steampowered.com/app/504230/Celeste/' },
        gog: null,
        epic: { amount: 4.99, regular: 19.99, cut: 75, url: 'https://store.epicgames.com/en-US/p/celeste' },
      },
    },
    BR: {
      currency: 'BRL',
      historyLow: { amount: 5.99, currency: 'BRL' },
      stores: {
        steam: { amount: 14.99, regular: 59.99, cut: 75, url: 'https://store.steampowered.com/app/504230/Celeste/' },
        gog: null,
        epic: { amount: 14.99, regular: 59.99, cut: 75, url: 'https://store.epicgames.com/en-US/p/celeste' },
      },
    },
  },
});

export class PriceError extends Error {
  constructor(message, status = 500, code = 'PRICE_ERROR', retryAfter = 0) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export function normalizeCountry(value) {
  const code = String(value || 'US').trim().toUpperCase();
  return ALLOWED_COUNTRIES.includes(code) ? code : 'US';
}

export function normalizeTitle(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

export function normalizeSlug(value) {
  if (typeof value !== 'string') return '';
  const slug = value.trim().toLowerCase();
  return /^[a-z0-9-]{1,100}$/.test(slug) ? slug : '';
}

export function normalizeTitleKey(title, slug = '') {
  const cleanSlug = normalizeSlug(slug);
  if (cleanSlug) return cleanSlug;
  return normalizeTitle(title).toLowerCase();
}

export function safeStoreUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    const host = url.hostname.toLowerCase();
    if (ALLOWED_STORE_HOSTS.has(host) || host.endsWith('.isthereanydeal.com')) return url.href;
    return '';
  } catch {
    return '';
  }
}

export function formatPrice(amount, currency = 'USD') {
  if (!Number.isFinite(amount) || amount < 0) return '—';
  if (amount === 0) return 'Free';
  const cleanCurrency = /^[A-Z]{3}$/.test(String(currency || '')) ? currency : 'USD';
  const locale = cleanCurrency === 'BRL' ? 'pt-BR' : 'en-US';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: cleanCurrency }).format(amount);
  } catch {
    return `${cleanCurrency} ${amount.toFixed(2)}`;
  }
}
export const formatStorePrice = formatPrice;

export function fallbackStoreLinks(title) {
  const clean = normalizeTitle(title);
  const encoded = encodeURIComponent(clean);
  return {
    steam: `https://store.steampowered.com/search/?term=${encoded}`,
    gog: `https://www.gog.com/en/games?query=${encoded}`,
    epic: `https://store.epicgames.com/en-US/browse?q=${encoded}`,
  };
}

// Lightweight anti-bot challenge token bound to the normalized game title, country, and 1-minute bucket.
export function computeBotProof(title, country = 'US', minuteBucket = Math.floor(Date.now() / 60000)) {
  const payload = `playnext-itad-v1|${normalizeTitle(title).toLowerCase()}|${normalizeCountry(country)}|${minuteBucket}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < payload.length; i++) {
    const code = payload.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= code + i;
    h2 = Math.imul(h2, 0x5bd1e995) >>> 0;
  }
  return `${minuteBucket}.${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export function verifyBotProof(arg1, arg2, arg3 = 'US', nowMs = Date.now()) {
  // Support both verifyBotProof(title, country, proof, nowMs) and verifyBotProof(proof, title, country, nowMs)
  const firstLooksLikeProof = typeof arg1 === 'string' && /^\d+\.[0-9a-f]{16}$/i.test(arg1);
  const proof = firstLooksLikeProof ? arg1 : arg3;
  const title = firstLooksLikeProof ? arg2 : arg1;
  const country = firstLooksLikeProof ? arg3 : arg2;
  if (typeof proof !== 'string' || !proof.includes('.')) return false;
  const [bucketPart] = proof.split('.');
  const bucket = Number(bucketPart);
  if (!Number.isSafeInteger(bucket)) return false;
  const currentBucket = Math.floor(nowMs / 60000);
  if (Math.abs(currentBucket - bucket) > 1) return false;
  return proof === computeBotProof(title, country, bucket);
}

export function validateBotRequest(reqOrOptions = {}, maybeUrl = null, maybeNow = Date.now()) {
  let method = 'GET';
  let headers = {};
  let title = '';
  let country = 'US';
  let honeypot = '';
  let now = maybeNow;

  if (maybeUrl instanceof URL || typeof maybeUrl === 'string') {
    const parsedUrl = maybeUrl instanceof URL ? maybeUrl : new URL(maybeUrl, 'http://localhost');
    method = reqOrOptions.method || 'GET';
    headers = reqOrOptions.headers || {};
    title = parsedUrl.searchParams.get('title') || '';
    country = parsedUrl.searchParams.get('country') || 'US';
    honeypot = parsedUrl.searchParams.get('website') || parsedUrl.searchParams.get('bot') || parsedUrl.searchParams.get('webhook') || '';
  } else {
    ({ method = 'GET', headers = {}, title = '', country = 'US', honeypot = '', now = Date.now() } = reqOrOptions);
  }

  if (method !== 'GET') {
    return { ok: false, status: 405, code: 'method_not_allowed', message: 'Only GET requests are allowed.' };
  }
  if (honeypot) {
    return { ok: false, status: 403, code: 'honeypot_triggered', message: 'Automated price scraping is blocked.' };
  }
  const getHeader = name => {
    const lower = name.toLowerCase();
    if (typeof headers.get === 'function') return headers.get(name) || headers.get(lower) || '';
    return headers[name] || headers[lower] || '';
  };
  const ua = String(getHeader('user-agent') || '').trim();
  if (ua.length < 10 || ua.length > 512 || BOT_USER_AGENT_PATTERN.test(ua)) {
    return { ok: false, status: 403, code: 'bot_user_agent', message: 'Automated or non-browser requests are not allowed.' };
  }
  const fetchSite = String(getHeader('sec-fetch-site') || '').trim().toLowerCase();
  if (fetchSite === 'cross-site') {
    return { ok: false, status: 403, code: 'cross_site_blocked', message: 'Cross-site price requests are not allowed.' };
  }
  const clientHeader = String(getHeader(CLIENT_HEADER_NAME) || '').trim();
  if (clientHeader !== CLIENT_HEADER_VALUE) {
    return { ok: false, status: 403, code: 'missing_client_header', message: 'Missing PlayNext client verification header.' };
  }
  const cleanTitle = normalizeTitle(title);
  if (!cleanTitle) {
    return { ok: false, status: 400, code: 'invalid_title', message: 'Provide a valid game title.' };
  }
  const proof = String(getHeader(PROOF_HEADER_NAME) || '').trim();
  if (!verifyBotProof(cleanTitle, country, proof, now)) {
    return { ok: false, status: 403, code: 'invalid_bot_proof', message: 'Invalid or expired anti-bot verification token.' };
  }
  return { ok: true, status: 200, title: cleanTitle, country: normalizeCountry(country) };
}

function pickBestStore(stores) {
  let bestKey = null;
  let bestAmount = Infinity;
  for (const { key } of STORES) {
    const deal = stores[key];
    if (deal && Number.isFinite(deal.amount) && deal.amount < bestAmount) {
      bestAmount = deal.amount;
      bestKey = key;
    }
  }
  return bestKey;
}

export function demoPriceSnapshot({ slug = '', title = '', country = 'US', now = Date.now() } = {}) {
  const cleanSlug = normalizeSlug(slug) || normalizeSlug(title);
  const cleanCountry = normalizeCountry(country);
  const defaultCurrency = cleanCountry === 'BR' ? 'BRL' : 'USD';
  const entry = DEMO_STORE_CATALOG[cleanSlug];
  if (!entry) return null;
  if (entry.consoleOnly) {
    return {
      found: false,
      consoleOnly: true,
      source: 'demo',
      itadId: null,
      country: cleanCountry,
      currency: defaultCurrency,
      bestStore: null,
      historyLow: null,
      stores: { steam: null, gog: null, epic: null },
      searchLinks: fallbackStoreLinks(title || cleanSlug),
      fetchedAt: new Date(now).toISOString(),
    };
  }
  const region = entry[cleanCountry] || entry.US;
  const stores = { steam: null, gog: null, epic: null };
  for (const { key, id, label } of STORES) {
    const raw = region.stores[key];
    if (raw && Number.isFinite(raw.amount)) {
      const regular = Number.isFinite(raw.regular) ? raw.regular : raw.amount;
      const cut = Number.isFinite(raw.cut) ? Math.max(0, Math.min(100, Math.round(raw.cut))) : 0;
      stores[key] = {
        shopId: id,
        shopName: label,
        key,
        label,
        price: raw.amount,
        amount: raw.amount,
        regular,
        cut,
        currency: region.currency,
        formattedPrice: formatPrice(raw.amount, region.currency),
        formattedRegular: formatPrice(regular, region.currency),
        url: safeStoreUrl(raw.url),
      };
    }
  }
  return {
    found: true,
    consoleOnly: false,
    source: 'demo',
    itadId: entry.itadId,
    country: cleanCountry,
    currency: region.currency,
    bestStore: pickBestStore(stores),
    historyLow: region.historyLow ? {
      amount: region.historyLow.amount,
      currency: region.historyLow.currency,
      formattedAmount: formatPrice(region.historyLow.amount, region.historyLow.currency),
    } : null,
    stores,
    searchLinks: fallbackStoreLinks(title || cleanSlug),
    fetchedAt: new Date(now).toISOString(),
  };
}

export function normalizeItadPrices(rawList, { itadId = null, title = '', country = 'US', now = Date.now() } = {}) {
  const cleanCountry = normalizeCountry(country);
  const defaultCurrency = cleanCountry === 'BR' ? 'BRL' : 'USD';
  const list = Array.isArray(rawList) ? rawList : [];
  const item = (itadId && list.find(entry => entry?.id === itadId)) || list[0] || null;
  const stores = { steam: null, gog: null, epic: null };
  let detectedCurrency = defaultCurrency;

  if (item && Array.isArray(item.deals)) {
    for (const deal of item.deals) {
      const shopId = Number(deal?.shop?.id);
      const storeMeta = STORES.find(s => s.id === shopId);
      const amount = Number(deal?.price?.amount);
      if (!storeMeta || !Number.isFinite(amount) || amount < 0) continue;
      const regular = Number.isFinite(Number(deal?.regular?.amount)) && Number(deal.regular.amount) >= amount
        ? Number(deal.regular.amount)
        : amount;
      const cut = Number.isFinite(Number(deal?.cut))
        ? Math.max(0, Math.min(100, Math.round(Number(deal.cut))))
        : (regular > amount ? Math.round(((regular - amount) / regular) * 100) : 0);
      const currency = /^[A-Z]{3}$/.test(String(deal?.price?.currency || '')) ? deal.price.currency : defaultCurrency;
      detectedCurrency = currency;
      const existing = stores[storeMeta.key];
      if (!existing || amount < existing.amount) {
        stores[storeMeta.key] = {
          shopId: storeMeta.id,
          shopName: storeMeta.label,
          key: storeMeta.key,
          label: storeMeta.label,
          price: amount,
          amount,
          regular,
          cut,
          currency,
          formattedPrice: formatPrice(amount, currency),
          formattedRegular: formatPrice(regular, currency),
          url: safeStoreUrl(deal?.url) || fallbackStoreLinks(title)[storeMeta.key],
        };
      }
    }
  }

  const lowRaw = item?.historyLow?.all || item?.historyLow?.y1 || item?.historyLow?.m3 || null;
  const lowCurrency = /^[A-Z]{3}$/.test(String(lowRaw?.currency || '')) ? lowRaw.currency : detectedCurrency;
  const historyLow = Number.isFinite(Number(lowRaw?.amount)) && Number(lowRaw.amount) >= 0
    ? {
      amount: Number(lowRaw.amount),
      currency: lowCurrency,
      formattedAmount: formatPrice(Number(lowRaw.amount), lowCurrency),
    }
    : null;

  const hasAnyStore = Boolean(stores.steam || stores.gog || stores.epic);
  return {
    found: Boolean(itadId || hasAnyStore),
    consoleOnly: false,
    source: 'itad',
    itadId: item?.id || itadId || null,
    country: cleanCountry,
    currency: detectedCurrency,
    bestStore: pickBestStore(stores),
    historyLow,
    stores,
    searchLinks: fallbackStoreLinks(title),
    fetchedAt: new Date(now).toISOString(),
  };
}

export class ItadPriceService {
  constructor({
    apiKey = (typeof process !== 'undefined' && process?.env ? (process.env.ITAD_API_KEY || process.env.ISTHEREANYDEAL_API_KEY || '') : ''),
    request = (...args) => globalThis.fetch(...args),
    now = () => Date.now(),
    windowMs = ITAD_WINDOW_MS,
    maxUpstreamCalls = ITAD_SAFE_UPSTREAM_BUDGET,
    clientWindowMax = 25,
    clientBurstMax = 6,
    clientBurstMs = 10_000,
    priceTtlMs = 30 * 60 * 1000,
    negativeTtlMs = 6 * 60 * 60 * 1000,
    idTtlMs = 7 * 24 * 60 * 60 * 1000,
    maxCacheEntries = 500,
    maxTrackedClients = 2000,
  } = {}) {
    this.apiKey = String(apiKey || '').trim();
    this.request = request;
    this.now = now;
    this.windowMs = Math.max(1000, Number(windowMs) || ITAD_WINDOW_MS);
    // Never allow upstream budget to exceed ITAD's 100 requests / 5 minutes limit.
    this.maxUpstreamCalls = Math.min(ITAD_API_WINDOW_LIMIT, Math.max(1, Number(maxUpstreamCalls) || ITAD_SAFE_UPSTREAM_BUDGET));
    this.clientWindowMax = Math.max(1, Number(clientWindowMax) || 25);
    this.clientBurstMax = Math.max(1, Number(clientBurstMax) || 6);
    this.clientBurstMs = Math.max(1000, Number(clientBurstMs) || 10_000);
    this.priceTtlMs = Math.max(1000, Number(priceTtlMs) || 30 * 60 * 1000);
    this.negativeTtlMs = Math.max(1000, Number(negativeTtlMs) || 6 * 60 * 60 * 1000);
    this.idTtlMs = Math.max(1000, Number(idTtlMs) || 7 * 24 * 60 * 60 * 1000);
    this.maxCacheEntries = Math.max(20, Number(maxCacheEntries) || 500);
    this.maxTrackedClients = Math.max(50, Number(maxTrackedClients) || 2000);

    this.upstreamTimestamps = [];
    this.clientBuckets = new Map();
    this.idCache = new Map();
    this.priceCache = new Map();
    this.inFlight = new Map();
  }

  pruneUpstream(now = this.now()) {
    const cutoff = now - this.windowMs;
    while (this.upstreamTimestamps.length && this.upstreamTimestamps[0] <= cutoff) {
      this.upstreamTimestamps.shift();
    }
  }

  enforceClientRateLimit(clientId = 'anonymous', now = this.now()) {
    const key = String(clientId || 'anonymous').slice(0, 128);
    const windowCutoff = now - this.windowMs;
    const burstCutoff = now - this.clientBurstMs;

    let timestamps = this.clientBuckets.get(key) || [];
    timestamps = timestamps.filter(ts => ts > windowCutoff);

    const recentBurst = timestamps.filter(ts => ts > burstCutoff);
    if (recentBurst.length >= this.clientBurstMax) {
      const retryAfter = Math.max(1, Math.ceil((recentBurst[0] + this.clientBurstMs - now) / 1000));
      throw new PriceError('Too many rapid price requests. Please wait a few seconds before trying again.', 429, 'CLIENT_BURST_LIMIT', retryAfter);
    }
    if (timestamps.length >= this.clientWindowMax) {
      const retryAfter = Math.max(1, Math.ceil((timestamps[0] + this.windowMs - now) / 1000));
      throw new PriceError('Price request limit reached for this session. Please wait a moment.', 429, 'CLIENT_WINDOW_LIMIT', retryAfter);
    }

    timestamps.push(now);
    this.clientBuckets.delete(key);
    this.clientBuckets.set(key, timestamps);

    if (this.clientBuckets.size > this.maxTrackedClients) {
      const oldestKey = this.clientBuckets.keys().next().value;
      if (oldestKey !== undefined) this.clientBuckets.delete(oldestKey);
    }
  }

  reserveUpstreamQuota(neededCalls = 1, now = this.now()) {
    this.pruneUpstream(now);
    if (this.upstreamTimestamps.length + neededCalls > this.maxUpstreamCalls) {
      const oldest = this.upstreamTimestamps[0] || now;
      const retryAfter = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
      throw new PriceError(
        'IsThereAnyDeal rate-limit protection active (100 req / 5 min window). Try again shortly.',
        429,
        'UPSTREAM_QUOTA_PROTECTED',
        retryAfter,
      );
    }
  }

  recordUpstreamCall(now = this.now()) {
    this.pruneUpstream(now);
    this.upstreamTimestamps.push(now);
  }

  setBoundedMap(map, key, value) {
    if (map.has(key)) map.delete(key);
    map.set(key, value);
    if (map.size > this.maxCacheEntries) {
      const oldestKey = map.keys().next().value;
      if (oldestKey !== undefined) map.delete(oldestKey);
    }
  }

  status(now = this.now()) {
    this.pruneUpstream(now);
    return {
      configured: Boolean(this.apiKey),
      secretName: ITAD_SECRET_NAME,
      windowMs: this.windowMs,
      itadHardLimit: ITAD_API_WINDOW_LIMIT,
      upstreamBudget: this.maxUpstreamCalls,
      upstreamUsed: this.upstreamTimestamps.length,
      upstreamRemaining: Math.max(0, this.maxUpstreamCalls - this.upstreamTimestamps.length),
      cachedGames: this.priceCache.size,
      cachedIds: this.idCache.size,
    };
  }

  async callItad(path, { method = 'GET', params = {}, body = undefined, signal } = {}) {
    const url = new URL(path, ITAD_BASE_URL);
    url.search = new URLSearchParams({ ...params, key: this.apiKey });
    const headers = {
      Accept: 'application/json',
      'ITAD-API-Key': this.apiKey,
    };
    const options = {
      method,
      headers,
      referrerPolicy: 'no-referrer',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000),
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    this.recordUpstreamCall();
    let response;
    try {
      response = await this.request(url.href, options);
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new PriceError('Could not reach IsThereAnyDeal. Try again in a moment.', 502, 'UPSTREAM_NETWORK');
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new PriceError('IsThereAnyDeal rejected the configured server key.', 502, 'UPSTREAM_AUTH');
      }
      if (response.status === 429) {
        throw new PriceError('IsThereAnyDeal rate limit reached. Try again in a few minutes.', 429, 'UPSTREAM_429', 60);
      }
      throw new PriceError('Store price service is temporarily unavailable.', 502, 'UPSTREAM_STATUS');
    }

    try {
      return await response.json();
    } catch {
      throw new PriceError('IsThereAnyDeal returned an unexpected response.', 502, 'UPSTREAM_PARSE');
    }
  }

  async lookup({ clientId = 'anonymous', slug = '', title = '', country = 'US', signal } = {}) {
    const now = this.now();
    const cleanTitle = normalizeTitle(title);
    const cleanSlug = normalizeSlug(slug);
    const cleanCountry = normalizeCountry(country);

    if (!cleanTitle) {
      throw new PriceError('Provide a valid game title.', 400, 'INVALID_QUERY');
    }

    // Enforce per-client burst and 5-minute window limits before any work.
    this.enforceClientRateLimit(clientId, now);

    const titleKey = normalizeTitleKey(cleanTitle, cleanSlug);
    const cacheKey = `${titleKey}:${cleanCountry}`;

    // 1. Fresh cache hit costs 0 ITAD requests.
    const cached = this.priceCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return { ...cached.data, source: cached.data.source === 'demo' ? 'demo' : 'cache' };
    }

    // 2. Known console-only titles never need an ITAD PC storefront query.
    const demoSnapshot = demoPriceSnapshot({ slug: cleanSlug, title: cleanTitle, country: cleanCountry, now });
    if (demoSnapshot?.consoleOnly) {
      this.setBoundedMap(this.priceCache, cacheKey, { data: demoSnapshot, expiresAt: now + this.negativeTtlMs });
      return demoSnapshot;
    }

    // 3. When ITAD_API_KEY is not configured, return demo reference snapshot or unconfigured state without network spam.
    if (!this.apiKey) {
      if (demoSnapshot) {
        this.setBoundedMap(this.priceCache, cacheKey, { data: demoSnapshot, expiresAt: now + this.priceTtlMs });
        return demoSnapshot;
      }
      return {
        found: false,
        consoleOnly: false,
        source: 'unconfigured',
        itadId: null,
        country: cleanCountry,
        currency: cleanCountry === 'BR' ? 'BRL' : 'USD',
        bestStore: null,
        historyLow: null,
        stores: { steam: null, gog: null, epic: null },
        searchLinks: fallbackStoreLinks(cleanTitle),
        fetchedAt: new Date(now).toISOString(),
      };
    }

    // 4. Singleflight coalescing: concurrent requests for the same game share 1 upstream call.
    if (this.inFlight.has(cacheKey)) {
      return this.inFlight.get(cacheKey);
    }

    const task = (async () => {
      await Promise.resolve();
      try {
        let idEntry = this.idCache.get(titleKey) || (cleanSlug ? this.idCache.get(cleanSlug) : null);
        if (idEntry && idEntry.expiresAt <= this.now()) {
          idEntry = null;
        }

        let itadId = idEntry?.id || null;
        if (!itadId) {
          this.reserveUpstreamQuota(1, this.now());
          const lookupData = await this.callItad('games/lookup/v1', {
            method: 'GET',
            params: { title: cleanTitle },
            signal,
          });
          if (!lookupData?.found || typeof lookupData?.game?.id !== 'string') {
            const notFound = {
              found: false,
              consoleOnly: false,
              source: 'itad',
              itadId: null,
              country: cleanCountry,
              currency: cleanCountry === 'BR' ? 'BRL' : 'USD',
              bestStore: null,
              historyLow: null,
              stores: { steam: null, gog: null, epic: null },
              searchLinks: fallbackStoreLinks(cleanTitle),
              fetchedAt: new Date(this.now()).toISOString(),
            };
            this.setBoundedMap(this.priceCache, cacheKey, {
              data: notFound,
              expiresAt: this.now() + this.negativeTtlMs,
            });
            return notFound;
          }
          itadId = lookupData.game.id;
          this.setBoundedMap(this.idCache, titleKey, {
            id: itadId,
            expiresAt: this.now() + this.idTtlMs,
          });
        }

        this.reserveUpstreamQuota(1, this.now());
        const pricesData = await this.callItad('games/prices/v3', {
          method: 'POST',
          params: {
            country: cleanCountry,
            shops: STORES.map(s => s.id).join(','),
          },
          body: [itadId],
          signal,
        });

        const normalized = normalizeItadPrices(pricesData, {
          itadId,
          title: cleanTitle,
          country: cleanCountry,
          now: this.now(),
        });

        this.setBoundedMap(this.priceCache, cacheKey, {
          data: normalized,
          expiresAt: this.now() + this.priceTtlMs,
        });
        return normalized;
      } catch (error) {
        // Stale-while-error fallback: if ITAD is rate-limited or unreachable, serve cached or demo reference data when available.
        if (cached?.data) {
          return { ...cached.data, source: 'cache-stale', stale: true };
        }
        if (demoSnapshot) {
          return { ...demoSnapshot, source: 'demo-fallback', stale: true };
        }
        throw error;
      } finally {
        this.inFlight.delete(cacheKey);
      }
    })();

    this.inFlight.set(cacheKey, task);
    return task;
  }

  getPrices(options = {}) {
    return this.lookup(options);
  }
}

export async function handlePriceApiRequest(req, res, service) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');

  const url = new URL(req.url, 'http://localhost');
  const title = url.searchParams.get('title') || '';
  const slug = url.searchParams.get('slug') || '';
  const country = url.searchParams.get('country') || 'US';
  const honeypot = url.searchParams.get('website') || url.searchParams.get('bot') || '';

  const botCheck = validateBotRequest({
    method: req.method,
    headers: req.headers || {},
    title,
    country,
    honeypot,
    now: service.now(),
  });

  if (!botCheck.ok) {
    res.writeHead(botCheck.status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: botCheck.code, message: botCheck.message }));
    return;
  }

  const clientIp = req.socket?.remoteAddress || 'local';
  try {
    const result = await service.lookup({
      clientId: clientIp,
      slug,
      title: botCheck.title,
      country: botCheck.country,
    });
    const status = service.status();
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'X-RateLimit-Window': String(Math.floor(status.windowMs / 1000)),
      'X-RateLimit-Remaining': String(status.upstreamRemaining),
    });
    res.end(JSON.stringify(result));
  } catch (error) {
    const httpStatus = Number.isInteger(error?.status) ? error.status : 500;
    const headers = { 'Content-Type': 'application/json; charset=utf-8' };
    if (httpStatus === 429 && error?.retryAfter) {
      headers['Retry-After'] = String(error.retryAfter);
    }
    res.writeHead(httpStatus, headers);
    res.end(JSON.stringify({
      error: error?.code || 'PRICE_ERROR',
      message: error?.message || 'Could not load store prices.',
      retryAfter: error?.retryAfter || 0,
    }));
  }
}

// Browser-side client with in-memory cache, debounce-friendly AbortSignal support, and graceful static-host fallback.
export class PriceClient {
  constructor({
    endpoint = './api/prices',
    country = 'US',
    request = (...args) => globalThis.fetch(...args),
    now = () => Date.now(),
    ttlMs = 15 * 60 * 1000,
  } = {}) {
    this.endpoint = endpoint;
    this.country = normalizeCountry(country);
    this.request = request;
    this.now = now;
    this.ttlMs = ttlMs;
    this.cache = new Map();
    this.inFlight = new Map();
    this.cooldownUntil = 0;
  }

  setCountry(country) {
    this.country = normalizeCountry(country);
    return this.country;
  }

  cacheKey(game) {
    const key = normalizeTitleKey(game?.name || '', game?.slug || '');
    return `${key}:${this.country}`;
  }

  peek(game) {
    if (!game?.name) return null;
    const entry = this.cache.get(this.cacheKey(game));
    if (entry && entry.expiresAt > this.now()) return entry.data;
    return null;
  }

  async forGame(game, signal) {
    if (!game?.name) return null;
    const now = this.now();
    const key = this.cacheKey(game);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) return cached.data;

    // Respect backend rate-limit cooldown so the browser never spams a rate-limited backend.
    if (this.cooldownUntil > now) {
      return demoPriceSnapshot({ slug: game.slug, title: game.name, country: this.country, now }) || {
        found: false,
        consoleOnly: false,
        source: 'cooldown',
        country: this.country,
        currency: this.country === 'BR' ? 'BRL' : 'USD',
        bestStore: null,
        historyLow: null,
        stores: { steam: null, gog: null, epic: null },
        searchLinks: fallbackStoreLinks(game.name),
      };
    }

    if (this.inFlight.has(key)) return this.inFlight.get(key);

    const task = (async () => {
      await Promise.resolve();
      try {
        const params = new URLSearchParams({
          title: normalizeTitle(game.name),
          slug: normalizeSlug(game.slug),
          country: this.country,
        });
        const proof = computeBotProof(game.name, this.country, Math.floor(this.now() / 60000));
        const response = await this.request(`${this.endpoint}?${params.toString()}`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            [CLIENT_HEADER_NAME]: CLIENT_HEADER_VALUE,
            [PROOF_HEADER_NAME]: proof,
          },
          referrerPolicy: 'no-referrer',
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
        });

        if (response.status === 429) {
          let body = {};
          try { body = await response.json(); } catch {}
          const retrySeconds = Math.max(5, Math.min(300, Number(body?.retryAfter) || 30));
          this.cooldownUntil = this.now() + retrySeconds * 1000;
          const fallback = demoPriceSnapshot({ slug: game.slug, title: game.name, country: this.country, now: this.now() }) || {
            found: false,
            consoleOnly: false,
            source: 'cooldown',
            country: this.country,
            currency: this.country === 'BR' ? 'BRL' : 'USD',
            bestStore: null,
            historyLow: null,
            stores: { steam: null, gog: null, epic: null },
            searchLinks: fallbackStoreLinks(game.name),
          };
          return fallback;
        }

        if (!response.ok) {
          const fallback = demoPriceSnapshot({ slug: game.slug, title: game.name, country: this.country, now: this.now() }) || {
            found: false,
            consoleOnly: false,
            source: 'fallback',
            country: this.country,
            currency: this.country === 'BR' ? 'BRL' : 'USD',
            bestStore: null,
            historyLow: null,
            stores: { steam: null, gog: null, epic: null },
            searchLinks: fallbackStoreLinks(game.name),
          };
          this.cache.set(key, { data: fallback, expiresAt: this.now() + 5 * 60 * 1000 });
          return fallback;
        }

        const data = await response.json();
        this.cache.set(key, { data, expiresAt: this.now() + this.ttlMs });
        return data;
      } catch (error) {
        if (signal?.aborted) throw error;
        const fallback = demoPriceSnapshot({ slug: game.slug, title: game.name, country: this.country, now: this.now() }) || {
          found: false,
          consoleOnly: false,
          source: 'fallback',
          country: this.country,
          currency: this.country === 'BR' ? 'BRL' : 'USD',
          bestStore: null,
          historyLow: null,
          stores: { steam: null, gog: null, epic: null },
          searchLinks: fallbackStoreLinks(game.name),
        };
        return fallback;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, task);
    return task;
  }
}
