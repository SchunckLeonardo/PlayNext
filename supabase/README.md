# PlayNext Supabase configuration

Connected project: `cckunethwmnyjkmlgpsi`, region `us-east-1`.

## Applied database changes

Migration `playnext_private_accounts`, source in `migrations/202610190001_private_accounts.sql`. Vault and pgcrypto were already installed.

`playnext_accounts` contains only UUIDs, a revision, and timestamps. Vault encrypts the private document. Public functions `playnext_load`, `playnext_save`, and `playnext_delete_account` check `auth.uid()`, accept no other user's ID, and use a fixed `search_path`. Anonymous access, direct mutations, and user access to the Vault schema are revoked. Cleanup removes the secret when an account is deleted, including administrative deletions.

`tests/private_accounts.sql` was run through MCP and passed; its synthetic accounts and secrets are rolled back. Never run tests with real user data.

The advisor reports three warnings for `SECURITY DEFINER` functions accessible to authenticated users, plus a leaked-password protection warning (not applicable while the email/password provider is disabled). This is the intentional design of these RPCs: owners can use Vault without direct access to it or `auth.users`. Owner checks and grants are covered by tests. There is no anonymous access. [Warning explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Google is the only sign-in method

The Google Cloud project `project-ec3b2670-b01c-42c3-8fb` contains the **PlayNext** web OAuth client. Its public ID is `316543035245-b9uhfnfmv2slil66o0ri38bsgbuj91ed.apps.googleusercontent.com`. The secret was transferred directly from the Google dashboard to Supabase's Google provider; it is never part of the code or frontend.

- Google is enabled; email/password, phone, and anonymous sign-in are disabled.
- New identities may sign in with Google. Manual identity linking remains disabled.
- Google nonce and email requirements are preserved.
- Declared scopes: `openid`, `https://www.googleapis.com/auth/userinfo.email`, and `https://www.googleapis.com/auth/userinfo.profile`. No access to Gmail, Drive, or other Google data.
- Google client JavaScript origin: `https://playnext-game-swipe.leonardorainha.chatgpt.site`.
- Authorized Google callback: `https://cckunethwmnyjkmlgpsi.supabase.co/auth/v1/callback`.

The brand is in **Testing / External**. Google requires brand verification before publishing. Google's documentation permits sign-in by any user without a tester list when only the three basic identity scopes are requested. This is not brand verification; the Google screen may show the Supabase domain and a testing warning. No extra permissions were requested to work around this limitation.

Supabase Site URL:

```text
https://playnext-game-swipe.leonardorainha.chatgpt.site/
```

Exact production redirects (no wildcard): the root URL above and `https://playnext-game-swipe.leonardorainha.chatgpt.site/auth-callback.html`. The temporary local QA URL was removed after testing. For another host, update the Site URL, allowed Supabase callback, and Google origin.

## Session and callback

The official SDK uses an in-memory session (`persistSession:false`), implicit flow, and refresh while the tab is open. Reloading requires another Google sign-in. A separate window handles sign-in, returns to `auth-callback.html`, and sends only Supabase tokens to the originating tab. The tab checks the exact origin and window before validating the session with Auth. The Google token is never sent to the main tab or persisted.

The callback removes the URL fragment, uses `no-referrer`, and does not include analytics. The RAWG key and previous choices remain in memory while sign-in is in progress. The previous collection is offered for explicit import; a guest key must be connected again after sign-in. The app has no Google password form and does not require an email delivery service.

Official sources: [Supabase Google Auth](https://supabase.com/docs/guides/auth/social-login/auth-google), [OAuth states and basic-scope exception](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview), [brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification).
