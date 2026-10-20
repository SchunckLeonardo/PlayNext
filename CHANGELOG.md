# Changelog

## [3.0.0] — Unreleased

- Migrate the complete frontend and server to Next.js App Router, React and strict TypeScript for one Vercel project. Replace the static deployment and standalone handwritten Node server.
- Preserve the existing Google SSO callback, v1 encrypted account document, revision-safe writes and encrypted IndexedDB device sessions.
- Resolve ITAD games by validated Steam identity or matching title and release year; reject matches between different releases such as Prey (2006) and Prey (2017).
- Use genuine US/Brazil regional prices; remove fixed exchange rates, CheapShark fallback and hardcoded demo prices.
- Expire both successful and missing price results. Display an all-time low only when ITAD supplies its explicit all-time value.
- Add a server-only PostgreSQL cache and atomic shared quota for Vercel function instances. Keep missing configuration explicit and fail closed.
- Add production Docker and browser integration tests, and update deployment, environment, release and rollback documentation.

## [2.3.0] — 2026-10-19

- Keep the user signed in across page reloads and return visits with automatic `access_token` and `refresh_token` persistence and rotation (`persistSession: true`, `autoRefreshToken: true`).
- Seal Supabase session tokens in IndexedDB (`dist/session-store.js`) using AES-GCM (256-bit) under a non-extractable WebCrypto device key (`extractable: false`), never writing tokens or keys to `localStorage` or `sessionStorage`.
- Enforce a 30-day sliding idle window on stored sessions, preserve sealed sessions across temporary network outages (retrying automatically on reconnect), and wipe both the ciphertext and the device key on sign-out or account deletion.

## [2.2.0] — 2026-10-19

- Integrate Steam, GOG, and Epic Games store price comparisons via the IsThereAnyDeal API (`games/lookup/v1` and `games/prices/v3`) on the discovery card and in the game details dialog, with `USD` / `BRL` currency switching and all-time low tracking.
- Add multi-layer backend bot and spam protection on `/api/prices`: blocks non-GET methods, honeypot parameters, scraper/headless User-Agents, cross-site fetches, and missing/invalid `X-PlayNext-Client` / `X-PlayNext-Proof` challenge tokens.
- Enforce a strict 5-minute sliding window rate limiter (capped at 80 upstream calls per 300s to stay safely within IsThereAnyDeal’s 100 requests per 5 minutes quota), per-IP burst/window limits, Singleflight request coalescing, and 30-minute price caching (`ITAD_API_KEY` server secret).
- Translate the PlayNext interface, demo copy, accessibility labels, tutorials, and documentation into English.
- Localize GitHub release and pull request descriptions and replace the tutorial screenshot with a localized English version.

## [2.1.0] — 2026-10-19

- Free security pipeline: CodeQL SAST blocks high/critical findings; npm audit SCA and Dependency Review run on pull requests.
- The vendored Supabase SDK and its components are listed in the lockfile; integrity is checked against the npm package.
- The app and Supabase run in Docker with a registered synthetic test account and loopback-only access.
- Local integration checks cover encryption, isolation, revisions, and collection recovery after signing in again.
- SemVer release preparation creates a ZIP and checksum for an exact commit; final publication requires maintainer approval through the GitHub `production` environment.

## [2.0.0] — 2026-10-19

- Google SSO is the only production sign-in method.
- The RAWG key, collection, and filters are encrypted in Supabase Vault; sessions remain in memory.
- Added a RAWG tutorial with real screenshots, plus PlayNext data export and deletion.
- Previous production source: `a575ae3b3724d6a9f7b71c709fb704143a9d12c1`.
