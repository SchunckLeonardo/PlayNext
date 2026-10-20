# Releases and deployment

Develop on a feature branch and open a reviewable PR. Before a production release, present the exact commit and validation results and obtain current maintainer approval. Do not reuse approval for another feature or silently approve a protected environment.

After committing the complete source, `npm run release:prepare` creates a deployment-source ZIP, checksum and notes under ignored `reports/release/`. The archive contains the Next.js app, static assets, dependency lockfile, deployment configuration and database migrations. It excludes environment values, generated builds, local test accounts, tokens, agent instructions and development runtime state. Preparation does not publish a release.

The manual GitHub release workflow validates the approved immutable commit, runs checks and a Next.js build, and requires the protected `production` environment for final publication. Never rewrite an existing public tag or asset to represent a different commit.

For Vercel runtime setup, migration order and Google callback configuration, follow the README. Test the site and API together in a preview before promotion. Keep production deployment approval separate from PR preparation.

## Rollback

The pricing migration is additive and does not alter account data or the old RPCs. Rolling back the application does not require deleting price tables or restoring a database backup. Keep them while versions overlap. Use the previous approved Vercel deployment or immutable Git commit; preserve users and account encryption. The existing Sites publication continues to serve its previously deployed version until explicitly replaced.
