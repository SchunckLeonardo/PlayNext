# Local testing

Requirements: Docker Desktop/Engine, Node.js 24, npm and Supabase CLI 2.121.0.

```sh
npm ci
npm run local:up
npm run local:test
npm run test:e2e
```

`local:up` starts the isolated `playnext-local` Supabase stack, applies pending migrations **locally**, and builds the same Next.js standalone server used for production. Open `http://127.0.0.1:4173`, select **Sign in**, then **Sign in with local test account**. The identity is synthetic (`qa@playnext.test`); credentials are generated privately in ignored `.local/` files. Docker publishes only to loopback. The container uses `host.docker.internal` to reach the host's local Supabase API, while the browser receives the loopback URL.

The local sign-in route is enabled only by `PLAYNEXT_LOCAL_TEST=true`, a loopback Supabase URL and loopback Host/Origin. It always returns 404 on Vercel. Production uses Google SSO.

The smoke test covers account encryption and revisions, restoration/refresh of a device session, denied anonymous access, shared price cache/quota RPCs and the real Next API route. If `ITAD_API_KEY` is configured in the shell or CI, it additionally requires a genuine ITAD offer for Subnautica. Otherwise it verifies a truthful 503 configuration state. Unit tests cover provider behavior deterministically; browser price fixtures are synthetic and exist only in test interception.

Browser tests use installed Google Chrome locally. CI installs the Chromium version pinned by `@playwright/test`. Browser traces are disabled to avoid capturing auth tokens. Screenshots show only the UI and are ignored by Git. Tests restore the synthetic account's prior state after changing it.

```sh
npm run local:status
npm run local:down
```

Stopping keeps the local database volume. No local command seeds or resets the production project. Never copy `.local/`, auth traces, `.env` values, or local test credentials into a release or Vercel.
