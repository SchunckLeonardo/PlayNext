"use client";
import { useEffect, useRef, useState } from "react";
import {
  createClient,
  type Session,
  type AuthError,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { MEMORY_AUTH_OPTIONS } from "@/lib/account";
import type { ClientConfig } from "@/lib/types";
export function AuthCallback({ config }: { config: ClientConfig }) {
  const sdkRef = useRef<SupabaseClient | null>(null);
  const pending = useRef<Promise<{
    data: { session: Session | null };
    error: AuthError | null;
  }> | null>(null);
  const [status, setStatus] = useState("Waiting for Google sign-in…");
  useEffect(() => {
    if (new URL(location.href).searchParams.has("waiting")) return;
    if (!config.supabaseUrl || !config.supabaseKey) {
      setStatus("Sign-in is not configured. Return to PlayNext.");
      return;
    }
    const sdk = (sdkRef.current ??= createClient(
      config.supabaseUrl,
      config.supabaseKey,
      {
        auth: MEMORY_AUTH_OPTIONS,
      },
    ));
    let active = true;
    pending.current ??= sdk.auth.getSession();
    void pending.current
      .then(({ data, error }) => {
        if (!active) return;
        history.replaceState(null, "", location.pathname);
        if (!window.opener || window.opener.closed) {
          setStatus("Open PlayNext and click Sign in with Google to continue.");
          return;
        }
        window.opener.postMessage(
          error || !data.session
            ? { type: "playnext:oauth-result", error: "oauth_cancelled" }
            : {
                type: "playnext:oauth-result",
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
              },
          location.origin,
        );
        setStatus(
          error || !data.session
            ? "Sign-in did not complete. Return to PlayNext and try again."
            : "Sign-in received. You can return to PlayNext.",
        );
        void sdk.auth.stopAutoRefresh();
      })
      .catch(() => {
        if (!active) return;
        history.replaceState(null, "", location.pathname);
        if (window.opener && !window.opener.closed)
          window.opener.postMessage(
            { type: "playnext:oauth-result", error: "oauth_cancelled" },
            location.origin,
          );
        setStatus(
          "Sign-in did not complete. Return to PlayNext and try again.",
        );
        void sdk.auth.stopAutoRefresh();
      });
    return () => {
      active = false;
      void sdk.auth.stopAutoRefresh();
    };
  }, [config.supabaseUrl, config.supabaseKey]);
  return (
    <main className="callback-page">
      <h1>PlayNext</h1>
      <p role="status">{status}</p>
    </main>
  );
}
