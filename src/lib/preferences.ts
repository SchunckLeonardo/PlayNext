import type { Country } from "./types";

export type Locale = "en" | "pt-BR";
export interface Preferences {
  locale: Locale;
  country: Country;
}
export const PREFERENCES_KEY = "playnext.preferences.v1";

export function readPreferences(
  value: string | null,
  browserLanguage = "en",
): Preferences {
  const defaults: Preferences = {
    locale: "en",
    country: /^pt/i.test(browserLanguage) ? "BR" : "US",
  };
  try {
    const parsed: unknown = JSON.parse(value || "null");
    if (!parsed || typeof parsed !== "object") return defaults;
    return {
      locale: "locale" in parsed && parsed.locale === "pt-BR" ? "pt-BR" : "en",
      country:
        "country" in parsed &&
        (parsed.country === "US" || parsed.country === "BR")
          ? parsed.country
          : defaults.country,
    };
  } catch {
    return defaults;
  }
}
