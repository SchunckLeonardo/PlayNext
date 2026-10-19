# PlayNext

One game at a time to help you pick your next play. Filter by platform and genre, swipe to choose, and keep three lists: **Want to play**, **Not interested**, and **Played**.

Website: https://playnext-game-swipe.leonardorainha.chatgpt.site

Source: https://github.com/SchunckLeonardo/PlayNext

## Run locally

Node.js 24; no build step required. The official Supabase JS SDK 2.118.0 is versioned in `dist/vendor/`, with its license, and listed in the lockfile for SCA. Use the isolated Docker environment for development and QA.

```sh
npm ci --ignore-scripts
npm run local:up
# http://127.0.0.1:4173 — synthetic local test account
npm run local:test
npm run local:down
```

Guides: [Docker and the test account](docs/LOCAL.md), [free SAST/SCA](docs/SECURITY-PIPELINE.md), and [releases and approval](docs/RELEASES.md). `npm run dev` also starts the isolated Docker environment; development uses the synthetic account and local database by default.

To use another static host, publish `dist/` and update the allowed URLs in Supabase Auth. Production requires HTTPS.

## Use the app

1. Try 12 real games in the demo or connect your own RAWG API key. **How to get a key** opens a tutorial with four real Playwright screenshots.
2. Select platforms and a genre, or leave the filters broad. Supported platforms: PC, PS1–PS5, DS/NDS, 3DS, Nintendo Switch, and Xbox 360. DS and NDS refer to the same platform.
3. Swipe right for **Want to play**, left for **Not interested**, or use **Played**. Arrow keys ← ↓ → make the same choices; press **Z** to undo.
4. In your collection, search, change a game's status, or remove it. Each game has one status and leaves the deck after you choose.
5. Sign in to sync your collection, filters, and encrypted API key across devices. You stay signed in on this device across reloads (up to 30 days without use); without signing in, guest choices stay in the tab's memory.

**Google** is the only sign-in method. PlayNext does not create passwords or depend on confirmation or recovery emails. Supabase manages the Google identity and the session that authorizes access to private data. Sign-in opens a separate window to preserve guest choices in memory; allow pop-ups in your browser.

## Security and data

- Google verifies identity; Supabase Auth manages the linked identity, email, basic profile, and sessions. Email/password sign-in is disabled. The app does not copy profile data into its private document.
- Supabase Vault stores **one encrypted document per user** containing the RAWG key, collection, and filters. Supabase manages the encryption key outside the database. Auth data also relies on the provider's infrastructure protections.
- RPCs bind each operation to `auth.uid()` and never accept an owner ID from the client. RLS protects metadata; guests have no access, and users cannot read Vault directly.
- Serialized saves use optimistic revisions to prevent another tab from overwriting recent choices. Failures remain visible, with retry, export, and an explicit discard option when signing out.
- The decrypted RAWG key stays in memory. Session tokens (`access_token` and `refresh_token`) are persisted on this device in IndexedDB, sealed with AES-GCM (256-bit) under a non-extractable WebCrypto key (`dist/session-store.js`), and automatically refreshed by the Supabase SDK. The app never writes tokens or keys to `localStorage` or `sessionStorage`. Known legacy keys are removed from both without reading them. Older choices can be **imported explicitly** and are removed from old storage after the encrypted save succeeds.
- Personal exports exclude the RAWG key, passwords, and tokens. Deleting PlayNext data removes the linked Supabase Auth identity, sessions, metadata, and corresponding secret from the active database. The Google account is preserved. Provider backups and logs follow the providers' retention periods.
- `dist/config.js` contains the Supabase URL and **publishable key**, which is public by design. Never put a `service_role` key, Supabase secret key, or Google OAuth secret in the frontend or repository.
- The service decrypts data for use; authorized project administrators may access it. This is not end-to-end encryption or legal compliance certification. The site's privacy notice describes purposes, providers, US region, retention, export, and deletion. Legal governance and controller processes remain necessary.

## RAWG

Requests go directly to the official API over HTTPS using the visitor's key. There is no proxy. RAWG requires the key in the URL query string, where browser network tools and RAWG itself can see it. The app does not put it in logs, exports, or analytics.

`/platforms` and `/genres` discover current IDs. `/games` filters by platform, genre, and release status, then samples pages in up to four bounded attempts; it does not promise a uniform statistical distribution. Previous choices and duplicates are excluded. `/games/{id}` loads details on demand, which may be in English. Demo copy is editorial and metadata was checked on 2026-10-17; covers and fonts require an internet connection.

The transport preserves the native `fetch` context to prevent `Illegal invocation`. Invalid responses may not include CORS headers; in those cases the browser only permits a generic key/connection error. We do not claim to have validated a real authenticated request without a valid RAWG key entered by the visitor in the app.

## Store prices (IsThereAnyDeal)

PlayNext displays PC store prices for **Steam** (shop `61`), **GOG** (shop `35`), and **Epic Games** (shop `16`) on the discovery card and inside the game details dialog, with one-click switching between `USD ($)` and `BRL (R$)` and all-time low tracking.

- **GitHub Actions / Backend Secret**: Configure the repository secret named `ITAD_API_KEY` with your IsThereAnyDeal API key. The secret stays on the backend (`server.mjs` / `local/server.mjs`) and is never bundled into `dist/config.js` or exposed to browser network tools. When `ITAD_API_KEY` is absent in local/demo environments, the endpoint serves curated reference prices for the demo catalog.
- **100 req / 5 min Rate-Limit Protection**: IsThereAnyDeal enforces a sliding window of **100 requests per 5 minutes (300 seconds)**. PlayNext protects the backend with:
  1. A global 5-minute sliding window cap (`ITAD_SAFE_UPSTREAM_BUDGET = 80` upstream calls per 300s, hard-capped below 100) with stale-while-error fallback.
  2. Per-IP burst limiting (6 req / 10s) and per-IP 5-minute window limiting (25 req / 5 min).
  3. Singleflight request coalescing (concurrent requests for the same game share a single upstream lookup), 7-day ITAD game UUID caching, 30-minute price caching, and 220ms client debounce on card swipes.
- **Anti-Bot Shield**: `/api/prices` blocks non-`GET` methods, honeypot parameters (`?website=`, `?bot=`), automated scraper/CLI/headless User-Agents, `Sec-Fetch-Site: cross-site` requests, and requests missing a valid 1-minute bucket `X-PlayNext-Proof` challenge header.

Sources: [RAWG API](https://rawg.io/apidocs), [IsThereAnyDeal API](https://docs.isthereanydeal.com/), [Vault](https://supabase.com/docs/guides/database/vault), [Google Auth](https://supabase.com/docs/guides/auth/social-login/auth-google), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Brazilian data subject rights](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares).

## Project layout

- `dist/app.js`, `model.js`, `api.js`, `prices.js`: discovery, choices, RAWG, and IsThereAnyDeal store price service/client.
- `dist/account.js`, `account-ui.js`, `oauth.js`, `auth-callback.*`, `config.js`: sync, Google sign-in, and account management.
- `dist/index.html`, `styles.css`, `account.css`: responsive interface.
- `dist/assets/tutorial/`: public RAWG screenshots and the empty PlayNext form.
- `supabase/migrations/`: reproducible schema, Vault, RLS, and RPCs.
- `supabase/tests/`: transactional checks for encryption, isolation, and deletion, with rollback.
- `tests/`: network-independent regressions; the official SDK is exercised with instrumented storage.
- `design-system/MASTER.md`: visual direction based on UI UX Pro Max.
- `VALIDATION.md`: current evidence and limitations.

