"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Choice, Game } from "@/lib/types";
import {
  GENRES,
  PLATFORMS,
  pickCollectionGame,
  rouletteCandidates,
} from "@/lib/model";
import { usePreferences } from "./preferences";
import { Icon } from "./icon";
import { Artwork } from "./artwork";

export function CollectionRoulette({
  history,
  onDetails,
}: {
  history: Choice[];
  onDetails: (game: Game) => void;
}) {
  const { t, text } = usePreferences();
  const [platform, setPlatform] = useState("");
  const [genre, setGenre] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<Game | null>(null);
  const [reel, setReel] = useState(0);
  const previous = useRef<number | undefined>(undefined);
  const candidates = useMemo(
    () => rouletteCandidates(history, platform ? [platform] : [], genre),
    [history, platform, genre],
  );
  const winner = result && candidates.find((game) => game.id === result.id);
  useEffect(() => {
    if (!spinning) return;
    const next = pickCollectionGame(candidates, previous.current);
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const interval = reduced
      ? undefined
      : setInterval(() => setReel((value) => value + 1), 100);
    const timer = setTimeout(
      () => {
        setResult(next);
        previous.current = next?.id;
        setSpinning(false);
      },
      reduced ? 0 : 1000,
    );
    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [spinning, candidates]);
  const preview = spinning ? candidates[reel % candidates.length] : winner;
  return (
    <section className="collection-roulette" aria-labelledby="roulette-title">
      <div className="roulette-copy">
        <div className="eyebrow">
          <Icon name="shuffle" />
          {t("LET YOUR COLLECTION DECIDE")}
        </div>
        <h2 id="roulette-title">{t("What are we playing today?")}</h2>
        <p>
          {t(
            "Spin only the games you want to play. Your choices stay unchanged.",
          )}
        </p>
        <div className="roulette-filters">
          <label htmlFor="roulette-platform">
            {t("Roulette platform")}
            <select
              id="roulette-platform"
              value={platform}
              disabled={spinning}
              onChange={(e) => {
                setPlatform(e.target.value);
                setResult(null);
              }}
            >
              <option value="">{t("All platforms")}</option>
              {PLATFORMS.map((item) => (
                <option value={item.slug} key={item.slug}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="roulette-genre">
            {t("Roulette genre")}
            <select
              id="roulette-genre"
              value={genre}
              disabled={spinning}
              onChange={(e) => {
                setGenre(e.target.value);
                setResult(null);
              }}
            >
              <option value="">{t("All genres")}</option>
              {GENRES.map((item) => (
                <option value={item.slug} key={item.slug}>
                  {text(item.name)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="roulette-actions">
          <button
            className="button primary-button"
            disabled={!candidates.length || spinning}
            onClick={() => {
              setResult(null);
              setSpinning(true);
            }}
          >
            <Icon name="shuffle" />
            {spinning
              ? t("Choosing…")
              : winner
                ? t("Spin again")
                : t("Spin my collection")}
          </button>
          <span>
            {candidates.length === 1
              ? t("1 game ready to play")
              : t("{count} games ready to play", { count: candidates.length })}
          </span>
        </div>
      </div>
      <div
        className={`roulette-result${spinning ? " is-spinning" : ""}`}
        aria-busy={spinning}
      >
        {preview ? (
          <>
            <div className="roulette-art" aria-hidden={spinning}>
              <Artwork game={preview} />
            </div>
            <div className="roulette-result-copy">
              <span className="eyebrow">
                {spinning ? t("Choosing…") : t("TONIGHT’S PICK")}
              </span>
              <h3 aria-hidden={spinning}>{preview.name}</h3>
              {!spinning && (
                <button
                  className="text-button"
                  onClick={() => onDetails(preview)}
                >
                  {t("View details")}
                  <Icon name="arrow" />
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="roulette-placeholder">
            <Icon name="gamepad" />
            <strong>{t("Your next adventure is in your collection.")}</strong>
            <p>
              {history.some((entry) => entry.status === "yes")
                ? t(
                    "Choose filters, then spin. No matches? Try another platform or genre.",
                  )
                : t(
                    "Mark games as Want to play in Discover to start the roulette.",
                  )}
            </p>
          </div>
        )}
      </div>
      <span className="sr-only" role="status">
        {spinning
          ? t("Choosing a game from your collection.")
          : winner
            ? t("Tonight’s pick: {name}", { name: winner.name })
            : ""}
      </span>
    </section>
  );
}
