# Validation — Next.js migration (2026-10-20)

## Scope

Version 3.0.0 replaces the handwritten JavaScript/static application with Next.js App Router, React and strict TypeScript. The same deployment serves the UI and `GET /api/prices`. The existing Supabase account schema, Vault document v1, revision behavior, OAuth callback alias and encrypted IndexedDB format are preserved.

## Verified locally

- `npm run check`: Next route type generation and strict TypeScript pass (`allowJs: false`).
- `npm test`: 64 tests pass. Pricing regressions cover the Prey release mismatch, actual regional amounts, positive and negative TTL expiration, explicit all-time history, no fictional fallback, request validation, per-client/global quotas, shared work, browser cooldown and secret-free errors. Existing RAWG, choice, OAuth, account-conflict and encrypted-session tests also pass.
- `npm run build`: production compilation succeeds and emits dynamic pages, Google callback and Node API routes. `npm run dev` was also checked with Strict Mode: dialogs remain open, close/reopen correctly and clear the key input.
- `npm run local:up` and `npm run local:test`: Next standalone server runs in Docker with Node.js 24 and a local isolated Supabase. Account encryption, revision conflict, device-session reload/refresh, denied anonymous operations, server-only cache/quota RPCs and the price endpoint were exercised. The new migration was applied only locally.
- `npm run test:e2e`: four Chromium/Chrome flows pass: guest choice/undo/filters/collection and regional prices; pointer swipe and mobile layout; synthetic RAWG connection with last-card refresh/undo; local sign-in, encrypted save, reload restoration and sign-out. A fresh browser context additionally recovered the same account's saved choice.
- `supabase db advisors --local --type all --level warn --fail-on error`: no issues found. `supabase db lint --local --schema public,private --fail-on error`: no schema errors.
- `npm run security:sca`: zero known vulnerabilities reported.

## Evidence limits and deployment requirements

Browser price interception and RAWG fixtures are synthetic and never seed production. The local shell has no ITAD key, so the local real endpoint correctly returned 503 without invented prices. CI's Docker smoke test requires a genuine Subnautica offer when the existing `ITAD_API_KEY` repository secret is present; consult the exact PR's checks for that result.

No Vercel production deployment, production database migration or change to the Google provider was performed during implementation. Before promotion, configure Vercel's runtime variables, apply the additive shared-price-store migration and authorize the exact Vercel callback origin in Supabase, as described in README. Real Google consent on that new origin must be checked after setup; local tests verify the compatible flow and persistence, not Google's live consent screen.

The prior Sites publication and immutable 2.x releases remain rollback references. A source release candidate can be prepared with `npm run release:prepare` after committing the complete source; it does not publish anything.

Graphify was updated after the migration. Its optional `tree_sitter_sql` dependency is not installed, so SQL files were not indexed; the migration was instead exercised and analyzed in the real local database. Community labels were refreshed from graph hubs without an LLM call.

The first Linux CI run exposed a host-loopback connectivity difference. The local server now joins the isolated Supabase bridge directly; its health check verifies the cache RPC before accepting traffic. Browser-facing ports remain bound to loopback.
