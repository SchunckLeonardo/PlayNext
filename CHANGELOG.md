# Changelog

## [2.2.0] — Unreleased

- Translate the PlayNext interface, demo copy, accessibility labels, tutorials, and documentation into English.
- Localize GitHub release and pull request descriptions.
- Replace the tutorial screenshot with a localized English version.

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
