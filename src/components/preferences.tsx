"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useId,
  type ReactNode,
} from "react";
import {
  PREFERENCES_KEY,
  readPreferences,
  type Preferences,
  type Locale,
} from "@/lib/preferences";
import { translate, type MessageKey } from "@/lib/messages";
import type { Country } from "@/lib/types";
import { Icon } from "./icon";

type Values = Record<string, string | number>;
interface PreferencesContext extends Preferences {
  setLocale: (locale: Locale) => void;
  setCountry: (country: Country) => void;
  t: (message: MessageKey, values?: Values) => string;
  text: (message: string) => string;
}
const Context = createContext<PreferencesContext | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>({
    locale: "en",
    country: "US",
  });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(PREFERENCES_KEY);
    } catch {}
    setPreferences(readPreferences(stored, navigator.language));
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = preferences.locale;
    document.title = translate(
      preferences.locale,
      "PlayNext — your next game is here",
    );
    try {
      // Only these two non-sensitive preferences are written to Web Storage.
      localStorage.setItem(
        PREFERENCES_KEY,
        JSON.stringify({
          locale: preferences.locale,
          country: preferences.country,
        }),
      );
    } catch {}
  }, [preferences, ready]);
  const setLocale = useCallback(
    (locale: Locale) => setPreferences((current) => ({ ...current, locale })),
    [],
  );
  const setCountry = useCallback(
    (country: Country) =>
      setPreferences((current) => ({ ...current, country })),
    [],
  );
  const t = useCallback(
    (message: MessageKey, values?: Values) =>
      translate(preferences.locale, message, values),
    [preferences.locale],
  );
  const text = useCallback(
    (message: string) => translate(preferences.locale, message),
    [preferences.locale],
  );
  const value = useMemo(
    () => ({ ...preferences, setLocale, setCountry, t, text }),
    [preferences, setLocale, setCountry, t, text],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePreferences() {
  const preferences = useContext(Context);
  if (!preferences) throw new Error("PreferencesProvider is required.");
  return preferences;
}

export function LanguageSelector() {
  const { locale, setLocale, t } = usePreferences();
  const id = useId();
  return (
    <label className="preference-control language-control" htmlFor={id}>
      <span>
        <Icon name="globe" />
        {t("Language")}
      </span>
      <select
        id={id}
        value={locale}
        onChange={(event) =>
          setLocale(event.target.value === "pt-BR" ? "pt-BR" : "en")
        }
      >
        <option value="en" lang="en">
          English
        </option>
        <option value="pt-BR" lang="pt-BR">
          Português
        </option>
      </select>
    </label>
  );
}

export function CurrencySelector() {
  const { country, setCountry, t } = usePreferences();
  const id = useId();
  return (
    <label className="preference-control currency-control" htmlFor={id}>
      <span>{t("Currency")}</span>
      <select
        id={id}
        value={country}
        onChange={(event) =>
          setCountry(event.target.value === "BR" ? "BR" : "US")
        }
      >
        <option value="US">{t("USD · US dollar")}</option>
        <option value="BR">{t("BRL · Brazilian real")}</option>
      </select>
    </label>
  );
}
