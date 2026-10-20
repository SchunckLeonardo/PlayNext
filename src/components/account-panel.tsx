"use client";
import { usePreferences } from "./preferences";
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
  const { t, text } = usePreferences();
  const [confirmation, setConfirmation] = useState("");
  return (
    <>
      <div className="eyebrow">{t("YOUR COLLECTION GOES WITH YOU")}</div>
      <h2>
        {t("A home for your next plays")}
        <span>.</span>
      </h2>
      {!account.user ? (
        <>
          <p>
            {t(
              "Use your Google account to take your collection with you. Your RAWG key and choices are protected with encryption.",
            )}
          </p>
          <button
            className="google-sign-in"
            disabled={account.busy || !account.configured}
            onClick={account.signIn}
          >
            {account.busy
              ? t("Signing in…")
              : local
                ? t("Sign in with local test account")
                : t("Sign in with Google")}
          </button>
          {!account.configured && (
            <p className="input-help">
              {t(
                "Sign-in is temporarily unavailable. You can explore as a guest.",
              )}
            </p>
          )}
          <p className="input-help">
            {t("Your choices in this tab stay here while you sign in.")}
          </p>
          <p className="privacy-short">
            {t(
              "Your session stays on this device, encrypted. Sign out on shared computers.",
            )}
          </p>
        </>
      ) : (
        <>
          <p className="profile-identity">
            {account.user.email || t("Your account")}
          </p>
          <p role="status">
            {account.pending
              ? t("Saving with encryption…")
              : account.error
                ? t("You have unsaved changes.")
                : t("Collection saved with encryption to your account.")}
          </p>
          {account.importCount > 0 && (
            <div className="import-panel">
              <h3>{t("Bring your previous choices")}</h3>
              <p>
                {account.importCount}{" "}
                {t(
                  "choices are available to import. Your account’s choice takes precedence. Your guest key is not imported.",
                )}
              </p>
              <button
                className="button primary-button"
                disabled={account.busy}
                onClick={account.importChoices}
              >
                {t("Import previous choices")}
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
                {t("Try saving again")}
              </button>
            )}
            <button
              className="button"
              disabled={account.busy || account.pending > 0}
              onClick={() => account.signOut()}
            >
              {t("Sign out")}
            </button>
            {account.error && (
              <button
                className="button danger-button"
                disabled={account.busy}
                onClick={() => account.signOut(true)}
              >
                {t("Sign out and discard unsaved changes")}
              </button>
            )}
          </div>
          <details className="delete-section">
            <summary>{t("Delete my PlayNext data")}</summary>
            <p>
              {t(
                "This removes your PlayNext data and identity link. Your Google account remains. Type DELETE to confirm.",
              )}
            </p>
            <label htmlFor="delete-confirm" className="sr-only">
              {t("Deletion confirmation")}
            </label>
            <input
              id="delete-confirm"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
              placeholder={t("Type DELETE")}
            />
            <button
              className="button danger-button"
              disabled={account.busy || confirmation !== "DELETE"}
              onClick={account.deleteAccount}
            >
              {t("Delete my data")}
            </button>
          </details>
        </>
      )}
      {account.error && (
        <p className="form-error" role="alert">
          {text(account.error)}
        </p>
      )}
      <div className="account-options">
        <button className="button" onClick={account.exportData}>
          {t("Download my data")}
        </button>
        <button className="text-button" onClick={privacy}>
          {t("Privacy and your rights")}
        </button>
      </div>
    </>
  );
}
