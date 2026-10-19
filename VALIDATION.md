# Validation — 2026-10-19

## v2.3.0 persistent encrypted session (`access_token` + `refresh_token`)

- **Encrypted IndexedDB session adapter (`dist/session-store.js`, `dist/account.js`, `dist/account-ui.js`)**: Configures the main Supabase client with `persistSession: true` and `autoRefreshToken: true` over `createSessionStorage()`, sealing `access_token` and `refresh_token` in IndexedDB (`playnext-session` / `sealed`) using AES-GCM (256-bit) under a non-extractable WebCrypto key (`extractable: false`) with storage key binding via `additionalData`. Neither `localStorage` nor `sessionStorage` is ever written.
- **Automatic `refresh_token` rotation & lifecycle**: Expired access tokens are transparently refreshed via `grant_type=refresh_token` and re-sealed on reload; unused sessions expire after a 30-day sliding window (`SESSION_MAX_IDLE_MS`); transient network outages preserve the sealed session and retry on `online` or when opening My Account; sign-out and account deletion wipe both the sealed tokens and the device key (`sessionStore.wipe()`).
- **Automated checks & Docker smoke**: `npm run check` (29 modules), `npm test` (61/61 passing tests including `tests/session-store.test.js`), `npm run verify:vendor`, `npm audit --audit-level=high` (0 vulnerabilities), and Docker integration (`npm run local:up`, `npm run local:test` verifying reload session restoration and `refreshSession()` against local Supabase Auth, and `npm run local:down`) all passed.

## v2.2.0 store prices (IsThereAnyDeal), bot protection, and English localization

- **IsThereAnyDeal store integration (`dist/prices.js`, `server.mjs`, `local/server.mjs`)**: Queries official IsThereAnyDeal endpoints (`GET /games/lookup/v1` and `POST /games/prices/v3` with shop IDs `61` Steam, `35` GOG, and `16` Epic Games). Normalizes lowest prices, discount cuts, regular prices, store URLs (`safeStoreUrl`), and historical lows (`historyLow`), with instant `USD ($)` / `BRL (R$)` currency switching on the discovery card and inside the game details dialog.
- **GitHub Secret (`ITAD_API_KEY`)**: The backend reads `process.env.ITAD_API_KEY` (forwarded in `.github/workflows/security.yml` and `scripts/local.mjs` when present) and never exposes the secret in `dist/config.js`, browser requests, or error messages. When `ITAD_API_KEY` is absent in local/demo environments, the service falls back to verified reference data for the 12 demo titles.
- **Anti-bot & 100 req / 5 min sliding window protection**:
  - Global sliding window rate limiter (`ITAD_WINDOW_MS = 300_000`, `ITAD_API_WINDOW_LIMIT = 100`, `ITAD_SAFE_UPSTREAM_BUDGET = 80`) prevents the backend from ever exceeding IsThereAnyDeal's 100 requests per 5 minutes quota, serving stale cached or reference prices if the budget is reached.
  - Per-IP burst limiter (6 req / 10s) and per-IP 5-minute window limiter (25 req / 5 min) block rapid scraping before any upstream call is made.
  - Request coalescing (`Singleflight`), 7-day ITAD UUID cache, 30-minute price cache, 6-hour negative cache, and 220ms frontend swipe debounce eliminate duplicate upstream requests.
  - `validateBotRequest` blocks non-GET methods (`405`), honeypot parameters (`403`), scraper/CLI/headless User-Agents (`403`), `Sec-Fetch-Site: cross-site` (`403`), and missing/expired 1-minute bucket `X-PlayNext-Proof` tokens (`403`).
- **Automated checks & Docker smoke**: `npm run check` (27 modules), `npm test` (47/47 passing tests), `npm run verify:vendor`, `npm audit --audit-level=high` (0 vulnerabilities), and full Docker verification (`npm run local:up`, `npm run local:test` verifying local Auth, Vault, `/api/prices` bot blocking `403` + valid proof `200`, and `npm run local:down`) all passed.

## v2.1.0 security and Docker review

- SAST: CodeQL `security-extended`; the severity gate covers rules in SARIF drivers and query packs, including results without a `level`. Reports missing metadata fail closed. A real SARIF result for `js/insecure-download` with severity 8.1 verified that the gate exits with status 1. The smoke test checks configuration through a health endpoint without downloading the JavaScript module.
- SCA: Supabase SDK 2.118.0 and five components are inventoried in the lockfile; the official UMD and vendored copy match the expected SHA-256. Local `npm audit` reported no vulnerabilities.
- The `qa@playnext.test` account is registered in local Auth. Its random password is in Git-ignored files; no fixture was sent to production.
- The app, Postgres, Auth, REST, and gateway were tested in Docker. Ports 4173/54321/54322 are restricted to 127.0.0.1; a second startup preserves the volume and account.
- Integration: three decisions, save and recovery after signing in again, conflicts, guest access denied, and a transactional SQL test for encryption/RLS/deletion. The fixture collection is restored after the test. Local UI sign-in was also checked without importing legacy choices.
- Workflows passed actionlint 1.7.12. GitHub Actions runs and PR reports are the current evidence for repository checks.
- `main` is protected by five required checks and PR review, disallows force-pushes, and applies rules to administrators. The `production` environment requires maintainer review. Release preparation pins the exact approved SHA and rejects source outside `main` history.
- Local `AGENTS.md` is excluded through `.git/info/exclude`. The production package contains only `dist/` and the hosting manifest; it excludes local accounts, `.env` files, and private instructions.
- The GitHub v2.1.0 release is published. Site deployment is separate and was not part of that release workflow.

## Automated checks — version 2.0.0

- `npm test`: **33 tests passed**. Coverage included filters, three decisions, normalization, bounded sampling, cancellation, RAWG errors, and the native `fetch` context regression. Additional tests covered save snapshots, queues/revisions, conflicts, retries, cancellation during account changes, and legacy data normalization. Google flow tests reject invalid origins/windows, external targets, blocked pop-ups, and cancellation; they transfer only Supabase tokens and clear listeners/timers.
- The **official Supabase JS SDK 2.118.0** was exercised with a Google OAuth URL, simulated sessions/sign-out, and instrumented storage. With the app's options, it did not read or write persistent storage.
- `npm run check`: syntax of every application module.
- Mock HTTP tests use no real credentials. The Supabase publishable key is part of public configuration; no privileged key was obtained or included.

## Live database through Supabase MCP

Migration `playnext_private_accounts` was applied to the connected project. `supabase/tests/private_accounts.sql` passed with synthetic data and rollback:

- Encrypted save and matching read by the owner.
- The physical Vault column does not contain the synthetic secret as readable text.
- Stale revisions and invalid state are rejected.
- User B cannot load User A's data.
- Authenticated users cannot read the Vault schema or write directly; RLS exposes only their metadata.
- Guests cannot call the RPCs or read metadata.
- Deleting an account removes its secret and preserves the other user's data.
- Requests without an identity are rejected.

The security advisor reports **four warnings**: three for the intentional authenticated `SECURITY DEFINER` RPCs and one for disabled leaked-password protection. The latter does not apply because email/password sign-in is disabled and the app creates no passwords. The RPCs need the privilege to use Vault without exposing its schema and check `auth.uid()` internally. Guests receive no grants. See `supabase/README.md` for the rationale and source.

## Browser — current Google SSO

The real Google provider was used from a local HTTP preview:

- Google sign-in returned to the callback and the interface showed the connected identity. An aggregate query confirmed one Google identity and no password credential.
- A demo decision was saved. An aggregate query confirmed revision 1, one choice, and encrypted physical content without returning the private document.
- Reloading ended the tab session. Signing in again restored the choice in the collection. The test record was removed through the UI; an aggregate query confirmed revision 2 and an empty collection. Sign-out was verified in the UI. The Google account and legacy browser history were preserved.
- Google permissions requested: identity, email, and basic profile only.
- OAuth opens a separate window, which may close quickly if Google reuses an existing session. Automation follows the main tab; the return and restored collection were verified there.

## Earlier checks preserved

Before replacing passwords with Google, a local HTTP preview used a temporary synthetic QA-only account:

- Real password sign-in through local Supabase and state loading through the SDK.
- Three decisions, one per list, were saved. Fixture inspection confirmed revision 3, three choices (`played`/`no`/`yes`), and encrypted physical content.
- Reload required a new sign-in; all three choices returned to their correct Supabase lists.
- UI export contained no key, password, or token. Sign-in/sign-out and clearing tab memory on sign-out were verified.
- Import of choices from the previous version is explicit, never automatic. Existing browser history was neither removed nor assigned to the test account.
- The hidden key form used a fictitious key to exercise a connection/CORS failure without freezing the UI. No `Illegal invocation` error appeared in the observed log. The user's real key was not read.
- Sign-in modal, tutorial, and navigation were visually inspected at 633×853. The base layout had previously passed at 375, 768, 1024, and 1440 on 2026-10-17; that earlier check is not claimed for the new account elements.
- Tutorial: four real screenshots were saved, three from public RAWG pages (API/login/signup) and one from the empty PlayNext form. RAWG pages were navigated with Playwright locators. No RAWG account was created, terms accepted, or API key captured.

## External configuration confirmed

- Public GitHub repository `SchunckLeonardo/PlayNext`, branch `main`; publication was directly authorized by the maintainer.
- PlayNext web Google OAuth client was created in the maintainer's project and connected to Supabase through an authenticated form; no client secret is in source code.
- Google is enabled and email/password is disabled in Supabase. Google signup is allowed; anonymous sign-in and manual linking are disabled. Nonce and email requirements are preserved.
- HTTPS Site URL and two exact production redirects: root and `auth-callback.html`, with no wildcard. The temporary local callback was removed after QA; the dashboard showed only the two production redirects.
- Google brand is in **Testing / External**; it is not claimed as verified. The documented basic-scope exception allows sign-in without a tester list.

## Limitations

1. **Google brand remains in testing.** The console blocks Publish app until brand requirements are met. Basic access works but was not checked with a second external account. The brand is not verified; Google may show the Supabase domain and a testing notice. Google sign-in does not depend on SMTP.
2. **A valid RAWG-key query was not exercised.** Visitors should test their key in the app's own field and never send it in chat. The native transport fix is preserved; invalid-key responses may not include CORS headers.
3. **Brazil's LGPD:** technical controls, minimization, notice, export, choice correction, and deletion are implemented. This is not legal certification. US region and provider backup/log retention are disclosed.
4. **Import:** saving before deleting protects the source. The real flow was not run against the user's existing choices. Sync failures retain in-memory data and warn before sign-out.
5. **Hosting:** Site audience remains owner-only. A public repository does not make the Site public. Covers and fonts are external.

The earlier synthetic account and its data/secret were removed. The Google QA item was removed while the maintainer's real identity was preserved. No synthetic choices remain in the account collection. Operational screenshots are kept outside the public source in `outputs/playnext-validation/`.
