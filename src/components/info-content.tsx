import { Icon } from "./icon";
export function PrivacyContent() {
  return (
    <>
      <h2>
        Your data and privacy<span>.</span>
      </h2>
      <div className="privacy-copy">
        <p>
          PlayNext is maintained by SchunckLeonardo. Google authenticates access
          and links your email to your collection; the RAWG key, choices, and
          filters help you discover games and manage your collection. We do not
          ask for your name, national ID, phone number, or address. The app has
          no ads or analytics.
        </p>
        <h3>How we protect data</h3>
        <p>
          Google handles sign-in. We do not collect or store your Google
          password. Supabase Auth links your authenticated identity. The RAWG
          key, collection, and filters are stored in one authenticated-encrypted
          document in Supabase Vault. Your email stays in the Auth service,
          protected by Supabase infrastructure. Production connections use
          HTTPS. The decrypted key stays in memory. To keep you signed in, the
          session tokens (access and refresh) are stored on this device in
          IndexedDB, encrypted with AES-GCM under a non-extractable browser key,
          never in localStorage or sessionStorage. They are removed when you
          sign out, delete your account, or after 30 days without use.
        </p>
        <p>
          Vault protects data at rest. The service must decrypt it for you to
          use the app; authorized project administrators may access it. This is
          not end-to-end encryption. Choices from older versions may remain in
          your browser until you import them; the old key is removed
          automatically without being read.
        </p>
        <h3>Services involved</h3>
        <p>
          Google provides sign-in and shares your email and basic profile with
          Supabase Auth. Supabase provides authentication, database, and Vault
          in the us-east-1 region (United States). RAWG receives your key and
          filters in catalog requests. IsThereAnyDeal provides PC store price
          comparisons for Steam, GOG, and Epic Games through PlayNext’s
          rate-limited backend proxy (capped within IsThereAnyDeal’s 100
          requests per 5 minutes window); the IsThereAnyDeal API key stays on
          the server and is never exposed to the browser. Vercel hosting and
          image/font providers receive normal technical access data, such as
          your IP address. This involves international data transfer. Providers
          apply their own policies and technical retention periods.
        </p>
        <h3>Retention and your rights</h3>
        <p>
          Your data stays in the active database until you remove it or delete
          your account. In My Account, you can download your data, remove your
          key, or delete your PlayNext data and identity link. Your Google
          account remains. You can correct and remove choices in your
          collection. Deletion removes active data and sessions; provider
          backups and logs follow their own retention periods and are not
          immediately deleted by this app.
        </p>
        <p>
          For other access, correction, or deletion requests, contact the
          maintainer through the{" "}
          <a
            href="https://github.com/SchunckLeonardo/PlayNext/issues"
            target="_blank"
            rel="noopener noreferrer"
          >
            project channel
          </a>
          , without posting passwords, keys, or personal data. See the{" "}
          <a
            href="https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares"
            target="_blank"
            rel="noopener noreferrer"
          >
            ANPD data subject rights
          </a>
          .
        </p>
        <p>
          This notice describes implemented controls and is not a certification
          of compliance with Brazil’s LGPD. Last updated: 2026-10-20.
        </p>
      </div>
    </>
  );
}
export function TutorialContent({ connect }: { connect: () => void }) {
  return (
    <>
      <h2>
        Your RAWG key, step by step<span>.</span>
      </h2>
      <p>Create a key in your own RAWG account, then connect it here.</p>
      <ol className="tutorial-steps">
        <li>
          <div className="step-copy">
            <span className="step-number">01</span>
            <div>
              <h3>Open the API page</h3>
              <p>
                Visit{" "}
                <a
                  href="https://rawg.io/apidocs"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  RAWG API
                </a>{" "}
                and click <strong>Get API Key</strong>. The Free plan is listed
                for personal and hobby projects. Check the current terms and
                limits.
              </p>
            </div>
          </div>
          <a
            href="/assets/tutorial/01-rawg-api.jpg"
            target="_blank"
            rel="noopener"
          >
            <img
              src="/assets/tutorial/01-rawg-api.jpg"
              alt="Official RAWG API page with the Get API Key button"
              loading="lazy"
              width="1280"
              height="720"
            />
          </a>
        </li>
        <li>
          <div className="step-copy">
            <span className="step-number">02</span>
            <div>
              <h3>Sign in or create a RAWG account</h3>
              <p>
                Use <strong>Log in</strong> if you already have an account or{" "}
                <strong>Sign up</strong> to sign up. Complete registration and
                confirm your email if RAWG asks you to.
              </p>
            </div>
          </div>
          <a
            href="/assets/tutorial/02-rawg-login.jpg"
            target="_blank"
            rel="noopener"
          >
            <img
              src="/assets/tutorial/02-rawg-login.jpg"
              alt="Real RAWG sign-in page with a Sign up link"
              loading="lazy"
              width="633"
              height="853"
            />
          </a>
        </li>
        <li>
          <div className="step-copy">
            <span className="step-number">03</span>
            <div>
              <h3>Request your key in the developer area</h3>
              <p>
                Return to <strong>Get API Key</strong> after signing in. Fill in
                the requested details about personal PlayNext use and accept
                RAWG’s terms if you agree. Copy the key generated by RAWG.
              </p>
              <p className="input-help">
                This area requires sign-in. Screenshots show public pages only;
                no API key is shown.
              </p>
            </div>
          </div>
          <a
            href="/assets/tutorial/03-rawg-signup.jpg"
            target="_blank"
            rel="noopener"
          >
            <img
              src="/assets/tutorial/03-rawg-signup.jpg"
              alt="Public RAWG signup page, before the developer area"
              loading="lazy"
              width="633"
              height="853"
            />
          </a>
        </li>
        <li>
          <div className="step-copy">
            <span className="step-number">04</span>
            <div>
              <h3>Paste the key into PlayNext</h3>
              <p>
                Sign in to PlayNext to store it encrypted, or use it as a guest
                in this tab only. Open <strong>Connect RAWG</strong>, paste your
                key and select <strong>Connect and discover</strong>.
              </p>
            </div>
          </div>
          <a
            href="/assets/tutorial/04-playnext-connect.jpg"
            target="_blank"
            rel="noopener"
          >
            <img
              src="/assets/tutorial/04-playnext-connect.jpg"
              alt="RAWG connection form in PlayNext with no key entered"
              loading="lazy"
              width="633"
              height="853"
            />
          </a>
          <button className="button primary-button" onClick={connect}>
            I already have my key <Icon name="arrow" />
          </button>
        </li>
      </ol>
    </>
  );
}
