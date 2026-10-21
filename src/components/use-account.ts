"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  PrivateAccount,
  accountMessage,
  cleanState,
  emptyState,
  isAuthFailure,
  legacyChoices,
  persistentAuthOptions,
  removeLegacyChoices,
  removeLegacyKeys,
} from "@/lib/account";
import { createSessionStorage } from "@/lib/session-store";
import { signInWithGoogle } from "@/lib/oauth";
import type { AccountState, ClientConfig } from "@/lib/types";

export function useAccount(
  config: ClientConfig,
  getState: () => AccountState,
  replaceState: (state: AccountState) => void,
  notify: (message: string) => void,
) {
  const callbacks = useRef({ getState, replaceState, notify });
  callbacks.current = { getState, replaceState, notify };
  const runtime = useRef<{
    sdk: SupabaseClient;
    account: PrivateAccount;
    storage: ReturnType<typeof createSessionStorage>;
    restore: () => Promise<void>;
  } | null>(null);
  const guest = useRef<AccountState | null>(null),
    legacy = useRef(emptyState());
  const [, setVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const update = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    for (const name of ["localStorage", "sessionStorage"] as const) {
      try {
        removeLegacyKeys(window[name]);
      } catch {}
    }
    try {
      legacy.current = cleanState(legacyChoices(localStorage));
    } catch {}
    if (!config.supabaseUrl || !config.supabaseKey) return;
    let active = true,
      restoring = false,
      retryRestore = false;
    const storage = createSessionStorage();
    const sdk = createClient(config.supabaseUrl, config.supabaseKey, {
      auth: persistentAuthOptions(storage),
    });
    const account = new PrivateAccount(sdk);
    const hydrate = async (session: Session | null) => {
      if (
        !active ||
        !session ||
        restoring ||
        account.user?.id === session.user.id
      )
        return;
      restoring = true;
      try {
        const prior = callbacks.current.getState();
        const state = await account.open(session.user);
        if (!active) return;
        guest.current = prior.history.length ? prior : null;
        callbacks.current.replaceState(state);
        retryRestore = false;
        setError("");
        update();
      } catch (cause) {
        account.reset();
        if (!active) return;
        retryRestore = !isAuthFailure(cause);
        if (!retryRestore) {
          await sdk.auth.signOut({ scope: "local" });
          await storage.wipe();
        }
        setError(
          retryRestore
            ? "Could not reach your account. Your device session is kept; reconnect to retry."
            : accountMessage(cause),
        );
      } finally {
        restoring = false;
        if (active) update();
      }
    };
    const restore = async () => {
      const { data, error: cause } = await sdk.auth.getSession();
      if (!active) return;
      if (cause) {
        retryRestore = !isAuthFailure(cause);
        if (!retryRestore) await storage.wipe();
        setError(accountMessage(cause));
        return;
      }
      await hydrate(data.session);
    };
    runtime.current = { sdk, account, storage, restore };
    const { data: subscription } = sdk.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN" && session && !account.user)
          setTimeout(() => void hydrate(session), 0);
        if (event === "SIGNED_OUT" && account.user)
          setTimeout(() => {
            if (!active) return;
            account.reset();
            callbacks.current.replaceState(emptyState());
            update();
          }, 0);
      },
    );
    const online = () => {
      if (retryRestore) void restore();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (account.pending || account.error) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("online", online);
    window.addEventListener("beforeunload", beforeUnload);
    void restore().catch(() => {
      if (active)
        setError("Could not restore your account. Reconnect to retry.");
    });
    return () => {
      active = false;
      account.reset();
      subscription.subscription.unsubscribe();
      void sdk.auth.stopAutoRefresh();
      runtime.current = null;
      window.removeEventListener("online", online);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [config.supabaseUrl, config.supabaseKey, update]);
  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(accountMessage(cause));
    } finally {
      setBusy(false);
      update();
    }
  };
  const save = useCallback(
    async (state: AccountState) => {
      const account = runtime.current?.account;
      if (!account?.user) return;
      const pending = account.save(state);
      update();
      try {
        await pending;
        setError("");
      } catch (cause) {
        if (cause instanceof Error && cause.message === "SESSION_CHANGED")
          return;
        setError(accountMessage(cause));
      }
      update();
    },
    [update],
  );
  const clear = async () => {
    const current = runtime.current;
    if (!current) return;
    current.account.reset();
    await current.storage.wipe();
    guest.current = null;
    callbacks.current.replaceState(emptyState());
    setError("");
    update();
  };
  const account = runtime.current?.account;
  return {
    client: runtime.current?.sdk ?? null,
    flush: () => runtime.current?.account.flush() ?? Promise.resolve(),
    user: account?.user ?? null,
    busy,
    error,
    pending: account?.pending ?? 0,
    configured: !!(config.supabaseUrl && config.supabaseKey),
    importCount:
      (guest.current?.history.length || 0) + legacy.current.history.length,
    conflict:
      account?.error &&
      typeof account.error === "object" &&
      "code" in account.error &&
      account.error.code === "40001",
    save,
    restore: () => runtime.current?.restore(),
    signIn: () =>
      perform(async () => {
        const current = runtime.current;
        if (!current) throw new Error("AUTH_UNCONFIGURED");
        if (config.local) {
          const response = await fetch("/api/local/sign-in", {
            method: "POST",
          });
          const data = await response.json();
          if (!response.ok || !data.session)
            throw new Error("LOCAL_AUTH_FAILED");
          const { error: cause } = await current.sdk.auth.setSession(
            data.session,
          );
          if (cause) throw cause;
        } else await signInWithGoogle(current.sdk, config.supabaseUrl);
        await current.restore();
      }),
    retry: () =>
      perform(async () => {
        if (runtime.current)
          await runtime.current.account.retry(callbacks.current.getState());
      }),
    importChoices: () =>
      perform(async () => {
        const current = runtime.current;
        if (!current?.account.user) return;
        await current.account.flush();
        const state = structuredClone(callbacks.current.getState()),
          ids = new Set(state.history.map((e) => e.game.id));
        for (const entry of [
          ...(guest.current?.history || []),
          ...legacy.current.history,
        ])
          if (!ids.has(entry.game.id)) {
            state.history.push(entry);
            ids.add(entry.game.id);
          }
        await current.account.save(state);
        callbacks.current.replaceState(state);
        try {
          removeLegacyChoices(localStorage);
        } catch {}
        legacy.current = emptyState();
        guest.current = null;
        callbacks.current.notify("Choices imported and saved with encryption.");
      }),
    signOut: (discard = false) =>
      perform(async () => {
        const current = runtime.current;
        if (!current) return;
        if (!discard) await current.account.flush();
        else await current.account.tail;
        await current.sdk.auth.signOut({ scope: "local" });
        await clear();
        callbacks.current.notify("Signed out on this device.");
      }),
    deleteAccount: () =>
      perform(async () => {
        const current = runtime.current;
        if (!current) return;
        await current.account.tail;
        const { error: cause } = await current.sdk.rpc(
          "playnext_delete_account",
        );
        if (cause) throw cause;
        await current.sdk.auth.signOut({ scope: "local" });
        await clear();
        callbacks.current.notify("Your PlayNext account data was deleted.");
      }),
    exportData: () => {
      const state = callbacks.current.getState();
      const url = URL.createObjectURL(
        new Blob(
          [
            JSON.stringify(
              {
                exportedAt: new Date().toISOString(),
                email: account?.user?.email,
                history: state.history,
                filters: state.filters,
              },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "playnext-my-data.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      callbacks.current.notify(
        "Exported choices and filters. Keys and tokens are excluded.",
      );
    },
  };
}
