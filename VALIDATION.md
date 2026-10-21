# Validation — collection roulette, completion and public reviews (2026-10-21)

Version 3.2.0 adds a collection-only roulette, a distinct Completed state and public, shareable player reviews.

- Strict route and application TypeScript checking passes. All 74 unit/regression tests pass. npm audit reports zero known vulnerabilities.
- The Node.js 24 standalone production Docker build succeeds, including the dynamic `/reviews/[id]` route.
- All 16 browser flows pass against Docker and isolated local Supabase. They cover wanted-only roulette draws, platform/genre filters, zero/one candidates, avoiding consecutive repeats, completion exclusion, normal/reduced motion and 320/390/844/1440 px layouts. Existing discovery, RAWG, pricing-region, language and encrypted-account flows remain covered, including the existing 375 px check.
- An authenticated browser moves a wanted game to Completed, reloads the saved account, publishes a rating and review, copies its link, opens it anonymously in a separate browser context, edits the same review, and deletes it. Another flow publishes a review for a Played game without claiming completion.
- Browser checks verify publication failure retains the draft, read failure can retry, user text is rendered without HTML execution, deleted/malformed links have a clear empty state, and public pages do not display the account email. English and Brazilian Portuguese flows pass.
- Local database/API smoke checks exercise two synthetic identities: anonymous public reads, anonymous account-ID denial, authenticated owner writes, cross-account edit/delete/impersonation denial, immutable ownership/game identity, content/rating bounds, one review per account/game and deletion cascades. Fixtures are removed or restored afterward.
- The generated migration was replayed from a fresh review table inside a rollback transaction. Column ACL and trigger-function exposure assertions pass, and Supabase security advisors report no issues. The final migration explicitly includes column grants omitted by the schema diff tool.
- Desktop/mobile screenshots and the local browser were reviewed. A clearly labeled local demonstration review was published only to the isolated test database for visual review.

## Data and deployment boundary

Completed is stored as `status: "played"` plus optional `completed: true`, preserving the encrypted v1 account shape and existing three database choice values. New clients preserve that marker on load/save. Older clients display it as Played and may discard the marker on a later save; keep compatible clients when preserving completion metadata matters.

Public reviews intentionally use a separate table and explicit public publication. Share-page payloads contain only public review fields, never the Google email, private choices, RAWG key or session tokens. Authors can edit/delete their own reviews. Removing a collection game keeps its review; deleting the account removes it through the ownership foreign key.

The public-review migration has been applied only to isolated local Supabase. Production migration, merge and deployment require approval for the concrete reviewed commit. A hosted preview using the existing production database cannot publish reviews until its database receives the migration. No production users or reviews were seeded.

Browser RAWG and store-price amounts in the existing price tests are synthetic fixtures. The local shell has no ITAD key and correctly reports 503; CI can separately verify a genuine offer with its existing server secret. Google consent was not repeated for this feature; the existing SSO/session implementation remains in use.

Graphify's code index was updated. Its optional SQL parser is absent, so SQL was reviewed directly and verified through migration replay, database advisors and live local authorization tests.
