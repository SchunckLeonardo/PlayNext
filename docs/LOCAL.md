# Test PlayNext with Docker

The app runs in a Node container; Postgres, Auth, REST, and the Supabase gateway run in separate containers. This setup never uses the production Supabase project and does not require a Google or RAWG key to test the demo.

## Start

Requirements: macOS/Linux (or WSL), Docker Desktop/Engine with a working local Unix socket, Node 24, and Supabase CLI **2.121.0**. The CLI is free; local `start`, `status`, and `stop` do not require Supabase sign-in. Official installation guide: https://supabase.com/docs/guides/local-development/cli/getting-started

```sh
npm ci --ignore-scripts
npm run local:up
```

`npm run dev` is an alias for the same Docker startup.

Open http://127.0.0.1:4173. The **LOCAL ENVIRONMENT** banner identifies synthetic data. Click **Sign in**, then **Sign in with local test account**.

The `qa@playnext.test` identity is registered in **local Auth**. Its random password is generated automatically and stored in `.local/test-user.json` and `.local/app.env`, which Git ignores. The local frontend receives only its publishable key and this fixture; the CLI admin key stays in process memory. Never send these files to production services.

This local adapter uses a password to test sessions, collections, and encryption without a Google test account. Production Google SSO remains in `dist/oauth.js`; the adapter and local button are served only by `local/server.mjs`, outside `dist/`. Local testing does not verify the real Google OAuth consent screen.

## Verify and stop

```sh
npm run local:test
npm run local:status
npm run local:down
```

`local:test` runs unit tests inside the container, the existing transactional SQL test, and a real flow covering sign-in, three lists, save, revision conflicts, sign-out, and sign-in again. It restores the fixture collection afterward. SQL changes are rolled back. The command rejects non-loopback URLs and does not use remote project credentials.

`local:down` stops only this project's containers and preserves the local volume and account for the next session. Do not run reset commands if you want to keep local data.

## Code and isolation

- `supabase/config.toml`: local-only configuration with no Google/SMTP and no remote project link. Do not run `supabase config push` with this file.
- `scripts/local.mjs`: starts the stack, creates the identity through local Auth Admin, and generates ignored local files.
- `local/`: development image and server; the app receives local configuration instead of production configuration.
- `compose.yaml`: PlayNext container; `.local` files are passed as environment variables and never copied into the image.
- App and Supabase ports bind to `127.0.0.1`. Supabase CLI 2.121.0 publishes services on all interfaces; `local/loopback.mjs` restricts only this project's `db` and `kong` containers while preserving the volume and gateway configuration in memory. The script checks labels before modifying a container.
- The image runs as an unprivileged user, with a read-only filesystem and no extra capabilities.
- The first run downloads official images and requires internet access and disk space. RAWG queries still require your own key when you leave the demo.
- Store prices (`/api/prices`) work out of the box using the reference demo catalog; if `ITAD_API_KEY` is set in your shell environment before `npm run local:up`, `scripts/local.mjs` forwards it into `.local/app.env` (`0600`, Git-ignored) so the container queries the live IsThereAnyDeal API within the 100 req / 5 min sliding window.

