# Security pipeline

The **Security** workflow runs on pull requests, pushes to `main`, and manual dispatch. It uses tools that require no external registration or additional API key:

| Check | Tool | What it blocks |
| --- | --- | --- |
| SAST | GitHub CodeQL, `security-extended` suite | High/critical findings (security severity ≥ 7), analysis errors, or missing reports |
| SCA | `npm audit --audit-level=high` | Known high/critical vulnerabilities in direct and transitive dependencies |
| Dependency changes | Dependency Review | New high/critical vulnerable dependency in a PR |
| SDK integrity | `npm run verify:vendor` | Bundle changes or a version mismatch with the npm package and lockfile |
| Regression | Node test runner + local Docker/Supabase | Syntax, unit, local Auth, Vault, isolation, or sync failures |

CodeQL, Dependency Review, and standard Linux runners are free for this **public** repository. Actions uses the automatic `GITHUB_TOKEN` with minimum permissions; no one needs to create or copy an API key for SAST or SCA. If the maintainer configures the optional `ITAD_API_KEY` GitHub Actions secret for IsThereAnyDeal store prices, it is passed only to the local Docker integration environment and is never required for SAST, SCA, or unit tests. The pipeline does not use SonarCloud, Snyk, or paid plans. If the repository becomes private, recheck availability and licensing before relying on the same terms.

The Supabase SDK in `dist/vendor` is also declared in `package.json` and `package-lock.json`, including its five components. The verifier requires matching versions and the expected SHA-256 of the official UMD. This prevents SCA from returning an empty result while overlooking the browser library. The upstream bundle is excluded from first-party source SAST and covered by SCA and integrity checks.

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run security:sca
```

GitHub CodeQL runs full SAST and publishes results under **Security → Code scanning** and in a seven-day SARIF artifact. `scripts/check-sarif.mjs` turns high/critical findings into a real job failure; uploading alerts alone would not block CI. SCA queries the public npm registry without sending source code. CodeQL analyzes code hosted on GitHub.

Actions are pinned by SHA. Dependabot proposes weekly npm and Actions updates without auto-merge. If the vulnerability database is unreachable, the check fails instead of returning an empty green result. No scanner guarantees the absence of every vulnerability.

Sources: [Code scanning](https://docs.github.com/en/code-security/concepts/code-scanning/code-scanning), [Dependency Review](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependency-review), [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
