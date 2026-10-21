"use client";
import { useEffect, useId, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Game } from "@/lib/types";
import { errorMessage } from "@/lib/types";
import {
  REVIEW_LIMIT,
  deleteReview,
  loadGameReviews,
  loadOwnReview,
  publishReview,
  validReviewDraft,
  type PublicReview,
} from "@/lib/reviews";
import { usePreferences } from "./preferences";
import { Icon } from "./icon";

export function ShareReview({ id }: { id: string }) {
  const { t } = usePreferences();
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState("");
  return (
    <div className="review-share">
      <a href={`/reviews/${id}`} target="_blank" rel="noopener noreferrer">
        {t("Open public review")}
        <Icon name="external" />
      </a>
      <button
        className="text-button"
        onClick={async () => {
          const url = new URL(`/reviews/${id}`, window.location.origin).href;
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          } catch {
            setFallback(url);
          }
        }}
      >
        <Icon name="share" />
        {copied ? t("Link copied") : t("Copy review link")}
      </button>
      {fallback && (
        <label>
          {t("Public review link")}
          <input
            readOnly
            value={fallback}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
    </div>
  );
}

export function PublicReviewCard({ review }: { review: PublicReview }) {
  const { t, locale } = usePreferences();
  return (
    <article
      className="public-review"
      aria-label={t("Review by {name}", { name: review.author_name })}
    >
      <div className="public-review-heading">
        <div>
          <strong>{review.author_name}</strong>
          <time dateTime={review.updated_at}>
            {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
              new Date(review.updated_at),
            )}
          </time>
        </div>
        <span
          className="review-rating"
          aria-label={t("Rated {rating} out of 5", { rating: review.rating })}
        >
          <Icon name="star" />
          {review.rating} / 5
        </span>
      </div>
      <p className="review-body">{review.body}</p>
      <ShareReview id={review.id} />
    </article>
  );
}

export function PublicReviews({
  game,
  client,
  user,
  played,
  onSignIn,
  beforePublish,
}: {
  game: Game;
  client: SupabaseClient | null;
  user: { id: string } | null;
  played: boolean;
  onSignIn: () => void;
  beforePublish: () => Promise<void>;
}) {
  const { t, text } = usePreferences();
  const id = useId();
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [total, setTotal] = useState(0);
  const [own, setOwn] = useState<PublicReview | null>(null);
  const [authorName, setAuthorName] = useState("");
  const [rating, setRating] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);
  const [touched, setTouched] = useState({ name: false, body: false });
  useEffect(() => {
    if (!client) {
      setLoading(false);
      setError("Public reviews are not configured on this server.");
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void Promise.all([
      loadGameReviews(client, game.id, 0, controller.signal),
      user
        ? loadOwnReview(client, user.id, game.id, controller.signal)
        : Promise.resolve(null),
    ])
      .then(([page, mine]) => {
        if (controller.signal.aborted) return;
        setReviews(page.reviews);
        setTotal(page.total);
        setOwn(mine);
        setAuthorName(mine?.author_name || "");
        setRating(mine ? String(mine.rating) : "");
        setBody(mine?.body || "");
        setTouched({ name: false, body: false });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "Public reviews are temporarily unavailable. Please try again.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [client, user?.id, game.id, reload]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!client || !user || busy || (!played && !own)) return;
    const draft = { author_name: authorName, rating: Number(rating), body };
    setFormError("");
    setMessage("");
    if (!validReviewDraft(draft)) {
      setTouched({ name: true, body: true });
      setFormError(
        "Add a public name, a rating from 1 to 5, and a review of up to 3,000 characters.",
      );
      const field = !authorName.trim() ? "name" : !rating ? "rating" : "body";
      document.getElementById(`${id}-${field}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      await beforePublish();
      await publishReview(client, user.id, game, draft, own?.id);
      setMessage("Your review is public. Share its link with anyone.");
      setReload((value) => value + 1);
    } catch (cause) {
      setFormError(
        errorMessage(
          cause,
          "Could not publish your review. Your draft is still here.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="reviews-section" aria-labelledby={`${id}-title`}>
      <div className="reviews-heading">
        <div>
          <div className="eyebrow">{t("THE PLAYER’S PERSPECTIVE")}</div>
          <h3 id={`${id}-title`}>{t("Player reviews")}</h3>
        </div>
        <span>{total}</span>
      </div>
      <p className="reviews-intro">
        {t(
          "Reviews, ratings and display names are public. Anyone with the link can read them.",
        )}
      </p>
      {message && (
        <p className="form-success" role="status">
          {text(message)}
        </p>
      )}
      {loading ? (
        <p className="price-loading" role="status">
          <span className="spinner" />
          {t("Loading reviews…")}
        </p>
      ) : error ? (
        <div className="review-feedback" role="alert">
          <p>{text(error)}</p>
          {client && (
            <button
              className="button"
              onClick={() => setReload((value) => value + 1)}
            >
              {t("Retry reviews")}
            </button>
          )}
        </div>
      ) : (
        <>
          {user && (played || own) ? (
            <details className="review-editor" open={!own}>
              <summary>
                <Icon name="pencil" />
                {own ? t("Edit your review") : t("Write a public review")}
              </summary>
              <form onSubmit={submit}>
                <div className="review-fields">
                  <label htmlFor={`${id}-name`}>
                    {t("Public display name")}
                    <input
                      id={`${id}-name`}
                      aria-label={t("Public display name")}
                      value={authorName}
                      onChange={(event) => setAuthorName(event.target.value)}
                      onBlur={() =>
                        setTouched((value) => ({ ...value, name: true }))
                      }
                      maxLength={60}
                      required
                      disabled={busy}
                      aria-invalid={touched.name && !authorName.trim()}
                      aria-describedby={`${id}-name-help`}
                      autoComplete="nickname"
                    />
                    <small id={`${id}-name-help`}>
                      {touched.name && !authorName.trim()
                        ? t("Enter a public display name.")
                        : t(
                            "Choose a name you want everyone to see. Your email stays private.",
                          )}
                    </small>
                  </label>
                  <label htmlFor={`${id}-rating`}>
                    {t("Your rating")}
                    <select
                      id={`${id}-rating`}
                      aria-label={t("Your rating")}
                      value={rating}
                      onChange={(event) => setRating(event.target.value)}
                      required
                      disabled={busy}
                    >
                      <option value="">{t("Choose a rating")}</option>
                      {[1, 2, 3, 4, 5].map((value) => (
                        <option key={value} value={value}>
                          {t("{rating} out of 5", { rating: value })}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label htmlFor={`${id}-body`}>
                  {t("Your review")}
                  <textarea
                    id={`${id}-body`}
                    aria-label={t("Your review")}
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    onBlur={() =>
                      setTouched((value) => ({ ...value, body: true }))
                    }
                    maxLength={REVIEW_LIMIT}
                    rows={5}
                    required
                    disabled={busy}
                    aria-invalid={touched.body && !body.trim()}
                    aria-describedby={`${id}-body-help`}
                  />
                  <small id={`${id}-body-help`}>
                    {touched.body && !body.trim()
                      ? t("Write your review before publishing.")
                      : `${body.length} / ${REVIEW_LIMIT}`}
                  </small>
                </label>
                {formError && (
                  <p className="form-error" role="alert">
                    {text(formError)}
                  </p>
                )}
                <p className="public-disclosure">
                  <Icon name="globe" />
                  {t(
                    "Publishing makes your review, rating and display name visible to everyone.",
                  )}
                </p>
                <div className="review-form-actions">
                  <button className="button primary-button" disabled={busy}>
                    {busy
                      ? t("Publishing…")
                      : own
                        ? t("Save public changes")
                        : t("Publish review")}
                  </button>
                  {own && (
                    <button
                      type="button"
                      className="text-button danger-button"
                      disabled={busy}
                      onClick={async () => {
                        if (
                          !client ||
                          !user ||
                          !window.confirm(
                            t(
                              "Delete this public review? Its shared link will stop working.",
                            ),
                          )
                        )
                          return;
                        setBusy(true);
                        setFormError("");
                        setMessage("");
                        try {
                          await deleteReview(client, user.id, own.id);
                          setMessage("Public review deleted.");
                          setReload((value) => value + 1);
                        } catch (cause) {
                          setFormError(errorMessage(cause));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <Icon name="trash" />
                      {t("Delete review")}
                    </button>
                  )}
                </div>
              </form>
            </details>
          ) : (
            <div className="review-eligibility">
              <Icon name={user ? "gamepad" : "lock"} />
              <p>
                {user
                  ? t(
                      "Mark this game as Played or Completed in your collection to write a review.",
                    )
                  : t(
                      "Sign in with Google to publish a review of a game you have played.",
                    )}
              </p>
              {!user && (
                <button className="button" onClick={onSignIn}>
                  {t("Sign in")}
                </button>
              )}
            </div>
          )}
          <div className="public-reviews-list">
            {reviews.length ? (
              reviews.map((review) => (
                <PublicReviewCard review={review} key={review.id} />
              ))
            ) : (
              <p className="reviews-empty">
                {t(
                  "No public reviews yet. Be the first to share your experience.",
                )}
              </p>
            )}
          </div>
          {reviews.length < total && (
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                if (!client) return;
                setBusy(true);
                try {
                  const page = await loadGameReviews(
                    client,
                    game.id,
                    reviews.length,
                  );
                  setReviews((current) => [
                    ...current,
                    ...page.reviews.filter(
                      (item) =>
                        !current.some((existing) => existing.id === item.id),
                    ),
                  ]);
                  setTotal(page.total);
                } catch {
                  setError(
                    "Public reviews are temporarily unavailable. Please try again.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("Load more reviews")}
            </button>
          )}
        </>
      )}
    </section>
  );
}
