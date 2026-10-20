"use client";
import { useState } from "react";
import type { useAccount } from "./use-account";
export function AccountPanel({
  account,
  local,
  privacy,
}: {
  account: ReturnType<typeof useAccount>;
  local: boolean;
  privacy: () => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  return (
    <>
      <div className="eyebrow">YOUR COLLECTION GOES WITH YOU</div>
      <h2>
        A home for your next plays<span>.</span>
      </h2>
      {!account.user ? (
        <>
          <p>
            Use your Google account to take your collection with you. Your RAWG
            key and choices are protected with encryption.
          </p>
          <button
            className="google-sign-in"
            disabled={account.busy || !account.configured}
            onClick={account.signIn}
          >
            {account.busy
              ? "Signing in…"
              : local
                ? "Sign in with local test account"
                : "Sign in with Google"}
          </button>
          {!account.configured && (
            <p className="input-help">
              Sign-in is temporarily unavailable. You can explore as a guest.
            </p>
          )}
          <p className="input-help">
            Your choices in this tab stay here while you sign in.
          </p>
          <p className="privacy-short">
            Your session stays on this device, encrypted. Sign out on shared
            computers.
          </p>
        </>
      ) : (
        <>
          <p className="profile-identity">
            {account.user.email || "Your account"}
          </p>
          <p role="status">
            {account.pending
              ? "Saving with encryption…"
              : account.error
                ? "You have unsaved changes."
                : "Collection saved with encryption to your account."}
          </p>
          {account.importCount > 0 && (
            <div className="import-panel">
              <h3>Bring your previous choices</h3>
              <p>
                {account.importCount} choices are available to import. Your
                account’s choice takes precedence. Your guest key is not
                imported.
              </p>
              <button
                className="button primary-button"
                disabled={account.busy}
                onClick={account.importChoices}
              >
                Import previous choices
              </button>
            </div>
          )}
          <div className="account-options">
            {account.error && !account.conflict && (
              <button
                className="button"
                disabled={account.busy}
                onClick={account.retry}
              >
                Try saving again
              </button>
            )}
            <button
              className="button"
              disabled={account.busy || account.pending > 0}
              onClick={() => account.signOut()}
            >
              Sign out
            </button>
            {account.error && (
              <button
                className="button danger-button"
                disabled={account.busy}
                onClick={() => account.signOut(true)}
              >
                Sign out and discard unsaved changes
              </button>
            )}
          </div>
          <details className="delete-section">
            <summary>Delete my PlayNext data</summary>
            <p>
              This removes your PlayNext data and identity link. Your Google
              account remains. Type DELETE to confirm.
            </p>
            <label htmlFor="delete-confirm" className="sr-only">
              Deletion confirmation
            </label>
            <input
              id="delete-confirm"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
              placeholder="Type DELETE"
            />
            <button
              className="button danger-button"
              disabled={account.busy || confirmation !== "DELETE"}
              onClick={account.deleteAccount}
            >
              Delete my data
            </button>
          </details>
        </>
      )}
      {account.error && (
        <p className="form-error" role="alert">
          {account.error}
        </p>
      )}
      <div className="account-options">
        <button className="button" onClick={account.exportData}>
          Download my data
        </button>
        <button className="text-button" onClick={privacy}>
          Privacy and your rights
        </button>
      </div>
    </>
  );
}
