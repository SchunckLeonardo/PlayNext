# Validation — language, currency and price layout (2026-10-20)

Version 3.1.0 repairs discovery/detail store comparisons and adds independent English / Brazilian Portuguese and USD / BRL controls.

- Strict route and application TypeScript checking passes.
- All 67 unit/regression tests pass, including validated display preferences, translation placeholders and independent language/currency formatting.
- All 11 browser flows pass against the Node.js 24 standalone Docker application and an isolated local Supabase. Coverage includes 320, 375, 390, 844 and 1440 px layouts, portrait/landscape, reduced motion, comparison containment, unavailable offers, currency selection exclusively in details, discovery prices reflecting that selection, reload restoration and a delayed regional response that must not expose stale amounts.
- Existing guest choice, undo, filters, RAWG connection and encrypted account save/reload/sign-out flows pass. A second browser context recovers the account collection.
- The local Supabase smoke test passes, including account revisions, encrypted sessions and private price-store access controls. The test fixture is restored afterward.
- The production Docker build succeeds. npm audit reports zero known vulnerabilities.
- Desktop and phone screenshots were reviewed. Repository documentation and release notes remain English; the Portuguese catalog supplies the requested interface translations.

## Evidence limits

Price amounts and RAWG responses in browser tests are explicit synthetic fixtures. The local shell has no ITAD key, so the real local endpoint correctly reports 503. CI separately checks a genuine ITAD offer when its existing server secret is available. Third-party RAWG descriptions retain their source language; local demo summaries and the interface have both translations. Google consent was not completed against a new deployment during this UI change.

Language and store region are the only values in the display-preference storage record. Account documents, visitor API keys and tokens do not pass through this record. New production changes require approval for the concrete reviewed version.

Graphify's code index was updated (368 nodes / 777 edges). Its optional SQL parser is absent, so the unchanged SQL files were not indexed. Documentation and styles were reviewed directly.
