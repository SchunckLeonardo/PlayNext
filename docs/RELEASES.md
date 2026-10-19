# Releases and approval

Versions follow SemVer: bug fixes are `PATCH`, backward-compatible features are `MINOR`, and breaking changes are `MAJOR`. Update `package.json`, the lockfile, and `CHANGELOG.md` together. Never move published tags.

1. Develop on a branch and open a PR. Require green Security checks and test with Docker.
2. Prepare a concrete version with `npm run release:prepare` after committing the complete source. The command rejects pending changes and writes a ZIP containing only `dist/` and the hosting manifest, a SHA-256 checksum, release notes, and the exact commit to `reports/release/`. Preparation does not publish anything.
3. Prepare the GitHub draft and present the PR, version, commit, notes, and results to the maintainer. Production approval must be explicit and apply to that exact version. Production ZIPs exclude `.env`, `.local`, `AGENTS.md`, and test-account fixtures.
4. After applicable approval and merge, run the manual **Release** workflow on `main`, providing the full approved and tested SHA as `approved_sha`. The workflow verifies that the commit belongs to `main` history and prepares that exact source even if `main` has advanced. Preserve the approved commit in the merge (merge commit, no rebase or squash); if the approved source changes, prepare and approve the new SHA.
5. The `publish` job requires maintainer approval through the GitHub **production** environment. Automation must not approve this step for the user. The job also requires a successful Security run for the same SHA and verifies the prepared artifact checksum.
6. Publish the release and corresponding Site only after approval. The workflow publishes the **GitHub release**; it does not deploy through Sites or store Sites/Supabase/Google tokens in GitHub Actions. Site deployment is a separate step tied to the same approved code. Record the resulting version and URL.

The workflow accepts only `main`. If a draft already exists, it must target the same SHA before the artifact can be attached and published; an existing final release stops the workflow. The `contents:write` permission is limited to the protected publish job.

## Rollback

Use the last approved release and its checksum/commit. Redeploy that source to the existing Site while preserving its audience. Do not rewrite tags, restore the database automatically, or run destructive migrations. Version 2.1.0 adds tools and a local environment without changing the production Supabase schema.

Agent operating instructions also live in the local **AGENTS.md**, excluded through `.git/info/exclude` by maintainer preference. This file is not included in clones, GitHub, or release artifacts; each new work checkout needs its own local copy before developing features.
