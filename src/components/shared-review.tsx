"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import type { ClientConfig } from "@/lib/types";
import { loadSharedReview, type PublicReview } from "@/lib/reviews";
import { LanguageSelector, usePreferences } from "./preferences";
import { PublicReviewCard } from "./public-reviews";
import { Icon } from "./icon";

export function SharedReview({
  id,
  config,
}: {
  id: string;
  config: ClientConfig;
}) {
  const { t } = usePreferences();
  const [review, setReview] = useState<PublicReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const client = useMemo(
    () =>
      config.supabaseUrl && config.supabaseKey
        ? createClient(config.supabaseUrl, config.supabaseKey, {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
            },
          })
        : null,
    [config.supabaseUrl, config.supabaseKey],
  );
  useEffect(() => {
    if (!client) {
      setLoading(false);
      setError(true);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void loadSharedReview(client, id, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setReview(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [client, id, retry]);
  return (
    <>
      {config.local && (
        <div className="local-environment">
          {t("LOCAL ENVIRONMENT · isolated synthetic test account")}
        </div>
      )}
      <a href="#main" className="skip-link">
        {t("Skip to content")}
      </a>
      <header className="shared-review-topbar">
        <a href="/" className="brand" aria-label={t("PlayNext, home")}>
          <span className="brand-symbol">
            <Icon name="gamepad" />
          </span>
          <span>
            playnext<span className="brand-dot">.</span>
          </span>
        </a>
        <LanguageSelector />
      </header>
      <main id="main" className="shared-review-page" tabIndex={-1}>
        {loading ? (
          <p role="status">{t("Loading reviews…")}</p>
        ) : error ? (
          <div className="collection-empty">
            <Icon name="info" />
            <h1>
              {t(
                "Public reviews are temporarily unavailable. Please try again.",
              )}
            </h1>
            <button
              className="button"
              onClick={() => setRetry((value) => value + 1)}
            >
              {t("Retry reviews")}
            </button>
          </div>
        ) : review ? (
          <>
            <div className="shared-review-game">
              {review.game_image && (
                <img
                  src={review.game_image}
                  alt={t("Artwork for {name}", { name: review.game_name })}
                />
              )}
              <div>
                <div className="eyebrow">{t("A PLAYER’S REVIEW")}</div>
                <h1>{review.game_name}</h1>
                <p>{t("Shared on PlayNext")}</p>
              </div>
            </div>
            <PublicReviewCard review={review} />
            <p className="shared-review-notice">
              {t(
                "This is a public player review. Your collection and RAWG key are not shared.",
              )}
            </p>
            <a className="button primary-button" href="/">
              {t("Discover games")}
              <Icon name="arrow" />
            </a>
            <a
              className="shared-review-source"
              href={`https://rawg.io/games/${encodeURIComponent(review.game_slug)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("Data and images by")} RAWG
              <Icon name="external" />
            </a>
          </>
        ) : (
          <div className="collection-empty">
            <Icon name="info" />
            <h1>{t("This review is no longer available.")}</h1>
            <p>
              {t(
                "The link may be incorrect or the author may have deleted the review.",
              )}
            </p>
            <a href="/" className="button primary-button">
              {t("Discover games")}
            </a>
          </div>
        )}
      </main>
    </>
  );
}
