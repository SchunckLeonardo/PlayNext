# PlayNext

Less browsing, more playing. Discover a random game, swipe right to play it, left to skip it, or mark it as played. Filter by platform and genre, then revisit and edit every choice in your collection.

Choose English or Brazilian Portuguese in the header. Open game details to choose USD or BRL; the discovery card shows prices in the last selected currency without displaying a currency control. Language and store region are independent and remembered on this device; these preferences contain no keys, tokens or choices. English is the default interface language. RAWG descriptions remain in their source language and are attributed; demo summaries are available in both languages.

PlayNext 3 uses **Next.js App Router, React and strict TypeScript**. The site and `GET /api/prices` run together on Vercel. Google sign-in and encrypted collections continue to use the existing Supabase project and v1 account document; this migration does not reset users or collections.

## Collection roulette and public reviews

In **My collection**, spin the roulette to choose from **Want to play**. Its platform and genre filters do not change discovery filters or saved choices. A second spin avoids the previous winner when another eligible game exists. Empty and one-game collections are supported; reduced-motion mode skips the animation.

Change a collection game's status to **Completed**, or use **Mark as completed** in its details. Completed is distinct from Played in the interface and remains a played entry with an optional `completed: true` marker in the encrypted v1 document. Existing accounts need no private-data migration.

Open **Player reviews** in game details. A signed-in player can publish a 1–5 rating and up to 3,000 characters for a game marked Played or Completed. The author chooses a public display name; the UI does not publish the Google email. Reviews can be edited or deleted by their author. **Copy review link** shares `/reviews/<uuid>`, which anyone can read without Google sign-in or a RAWG key. If clipboard access is blocked, the link is displayed for manual copying.

Public reviews intentionally live outside the private Vault document. Only public review fields are returned on share pages. Anonymous readers cannot select account IDs; authenticated writers are restricted by owner RLS and column permissions. Removing a game from a collection keeps its public review; deleting the PlayNext account also deletes its reviews. Public review text is rendered as plain text, never HTML.

Before enabling this feature in a deployment, review and apply `supabase/migrations/20261021140141_public_reviews.sql` to the intended Supabase project. It creates the review table, indexes, input constraints, timestamp trigger and least-privilege policies/grants; it does not modify existing account documents or pricing tables. The preview cannot publish reviews until its database has this migration. Apply it through the approved deployment process, then publish the tested application commit. No new environment variables are required.

## Development

Use Node.js 24 and npm:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Fill environment values privately. The app runs at `http://127.0.0.1:3000`. Without account or price configuration, visitors can still use the demo and guest choices; the interface explains that live services are unavailable. No prices are invented.

For the complete isolated Docker/Supabase test environment, see [Local testing](docs/LOCAL.md).

```sh
npm run check
npm test
npm run build
npm run security:sca
```

## Deploy the site and API to Vercel

1. Import this GitHub repository into Vercel. Select **Next.js**, use the repository root, Node.js **24.x**, `npm ci`, and `npm run build`. Keep the default Next.js output setting; do not select a static export or `dist` output.
2. Configure the following variables directly in Vercel for the intended environment. Never put secrets in Git, chat, browser code, or variables named `NEXT_PUBLIC_*`.

| Variable | Purpose | Browser exposure |
| --- | --- | --- |
| `SUPABASE_URL` | Existing project's URL | Public connection detail |
| `SUPABASE_PUBLISHABLE_KEY` | Public Supabase client key | Public, authorized by Auth/RLS |
| `SUPABASE_SECRET_KEY` | Server-only service credential for the shared price cache/quota | Never sent to the browser |
| `ITAD_API_KEY` | IsThereAnyDeal app key | Never sent to the browser |

3. Apply the new migration `supabase/migrations/20261020135756_shared_price_cache.sql` to the existing project through the normal reviewed database deployment. It adds only server-only price cache/quota tables and RPCs. Keep the existing accounts migration and data. Apply the additive migration before routing visitors to the new API. A missing shared store fails closed; it does not bypass the upstream budget.
4. Add the exact approved Vercel origin plus `/auth-callback.html` to **Supabase Auth → URL Configuration → Redirect URLs**. The old callback path redirects to the new Next route `/auth/callback`; Google still returns to the existing Supabase `/auth/v1/callback` URL. Do not change the Google client or create another account database. Set Supabase's Site URL to the approved production origin when promoting the migration. Avoid broad preview wildcards; authorize only the preview origin you intend to test.
5. Build a preview, test sign-in and live prices, and promote the reviewed commit only after maintainer approval. The repository does not install an automatic production deployment workflow. Vercel Git integration settings must preserve the same approval policy.

A GitHub Actions `ITAD_API_KEY` secret is only available to CI; it does **not** configure the Vercel runtime. Do not set `PLAYNEXT_LOCAL_TEST`, `LOCAL_TEST_PASSWORD`, or other `LOCAL_*` variables in Vercel.

## Store prices

Prices come exclusively from the [IsThereAnyDeal API](https://docs.isthereanydeal.com/) through the same-origin Next.js route. Supported shops: Steam (`61`), GOG (`35`), Epic Games (`16`).

- The RAWG key stays in the visitor's browser. RAWG storefront links supply the Steam app ID when available. ITAD lookup and game information validate that identity; title-only lookups also validate the release year. Ambiguous games are left unmatched rather than linked to another release such as Prey (2006) versus Prey (2017).
- US and Brazil requests use the provider's regional amounts and currency. There is no fixed exchange rate and no CheapShark or hardcoded-price fallback.
- Only `historyLow.all` from ITAD is labeled an all-time low. Missing historical information is omitted.
- Positive price results expire after 15 minutes, misses after 5 minutes, and verified identities after 7 days. Client cache entries use the server expiration. No permanent raw-response cache exists.
- PostgreSQL atomically enforces one conservative budget of 80 upstream requests per 300 seconds across Vercel instances, plus per-client burst/window limits. Server requests share in-flight work within each instance. The shared state is accessible only to the server's service role. Public request headers are traffic friction, not authentication or a secret anti-bot mechanism.
- Missing configuration, provider errors, and request limits produce an explicit unavailable state with store search links. Demo games use live prices when configured, not editorial price examples.

## Accounts and data

Google is the only production sign-in method. The existing authenticated RPCs and RLS protect a Vault-encrypted account document containing the RAWG key, choices, and filters. Account writes remain serialized and revision-checked; a conflict preserves unsaved choices for export instead of overwriting another tab.

The session adapter retains the existing IndexedDB database (`playnext-session` / `sealed`), AES-GCM record format, non-extractable device key and 30-day idle policy. Sign-out wipes device session data. This protects stored token representation; same-origin malicious JavaScript or a compromised device can still use a browser key. Vault is not end-to-end encryption.

Guest keys and choices stay in tab memory. Legacy browser choices can be imported after sign-in, and their old source is removed only after a successful encrypted save. Export includes choices and filters, excluding RAWG keys and auth tokens. Account deletion keeps the existing confirmation and server RPC.

## Project layout

- `src/app/`: Next.js pages, Google callback and Node.js API routes.
- `src/components/`: React discovery, collection, account, prices and dialogs.
- `src/lib/`: typed domain model, RAWG client, OAuth and compatible encrypted session adapter.
- `src/server/`: ITAD identity validation, normalization, shared cache/quota and request handling.
- `public/assets/`: favicon and RAWG tutorial images.
- `supabase/migrations/`: existing private accounts and additive server-only pricing state.
- `tests/`: TypeScript unit/regression tests and real-browser Docker integration tests.

Sources: [Next.js](https://nextjs.org/docs/app), [Vercel Next.js hosting](https://vercel.com/docs/frameworks/full-stack/nextjs), [RAWG](https://rawg.io/apidocs), [IsThereAnyDeal](https://docs.isthereanydeal.com/), [Supabase Auth](https://supabase.com/docs/guides/auth), [Vault](https://supabase.com/docs/guides/database/vault).
