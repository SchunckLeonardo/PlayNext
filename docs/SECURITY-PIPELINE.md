# Security pipeline

The Security workflow validates PRs and `main` with tools that require no additional paid account:

| Gate | Evidence |
| --- | --- |
| TypeScript | `tsc --noEmit`, strict application code and `allowJs: false` |
| Regression | TypeScript Node tests for RAWG, choices, auth, encrypted sessions, prices and request handling |
| Production build | `next build`, including server routes and React compilation |
| SAST | CodeQL JavaScript/TypeScript with security-extended queries; missing reports and high/critical findings fail the gate |
| SCA | npm audit and Dependency Review over the complete pinned lockfile |
| Integration | Next.js Docker runtime, isolated Supabase and real Chromium flows |

The Supabase SDK is imported from npm and bundled by Next.js; there is no copied UMD vendor bundle. SCA covers the SDK and its transitive packages. Framework build outputs, dependencies and test reports are excluded from first-party SAST.

The optional GitHub `ITAD_API_KEY` secret is scoped to local integration startup. Unit, SAST and SCA tests do not require it. It does not provision Vercel variables. Never upload `.local/`, `.env`, tokens or browser traces as CI artifacts. Actions remain pinned by commit SHA; production releases retain their protected approval gate.

Public proof headers are not an authorization boundary. Real upstream protection is enforced atomically in the server-only database quota store. Missing production shared-state configuration fails closed. No scanner proves the absence of every vulnerability.
