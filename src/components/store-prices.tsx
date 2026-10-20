"use client";
import { useEffect, useState } from "react";
import type { Country, Game, PriceSnapshot } from "@/lib/types";
import type { RawgClient } from "@/lib/api";
import {
  PriceClient,
  ITAD_SHOPS,
  STORE_KEYS,
  fallbackStoreLinks,
  formatPrice,
  safeStoreUrl,
} from "@/lib/prices";
import { Icon } from "./icon";
const client = new PriceClient();
export function StorePrices({
  game,
  country,
  setCountry,
  rawg,
  detailed = false,
}: {
  game: Game;
  country: Country;
  setCountry: (country: Country) => void;
  rawg: RawgClient | null;
  detailed?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<PriceSnapshot | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setSnapshot(null);
    const timer = setTimeout(
      () => {
        void (async () => {
          let identity = game;
          if (rawg) {
            try {
              identity = await rawg.priceIdentity(game, controller.signal);
            } catch {
              if (controller.signal.aborted) return;
            }
          }
          const result = await client.forGame(
            identity,
            country,
            controller.signal,
          );
          if (!controller.signal.aborted) setSnapshot(result);
        })().catch(() => {
          /* An obsolete card or closed dialog was canceled. */
        });
      },
      detailed ? 0 : 220,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [game, country, rawg, detailed]);
  const toggle = (
    <button
      type="button"
      className="store-currency"
      onClick={() => setCountry(country === "BR" ? "US" : "BR")}
      aria-label="Switch store region"
    >
      {country === "BR" ? "BRL" : "USD"}
    </button>
  );
  if (!snapshot)
    return (
      <>
        <span className="store-pill store-pill-loading">
          <Icon name="tag" /> Checking Steam · GOG · Epic…
        </span>
        {toggle}
      </>
    );
  if (snapshot.status === "console-only")
    return (
      <span className="store-pill store-pill-muted">
        Console release · No PC store listing
      </span>
    );
  const links = fallbackStoreLinks(game.name);
  const message =
    snapshot.status === "unconfigured"
      ? "Live prices are not configured on this server."
      : snapshot.status === "unavailable"
        ? "Live prices are temporarily unavailable."
        : snapshot.status === "rate-limited"
          ? "Price requests are paused. Try again shortly."
          : snapshot.status === "not-found"
            ? "No verified offer found for this game and region."
            : "";
  return (
    <>
      {detailed && <h3>Compare PC stores</h3>}
      <div className={detailed ? "details-stores-grid" : "store-pills"}>
        {STORE_KEYS.map((key) => {
          const deal = snapshot.stores[key],
            shop = ITAD_SHOPS[key];
          const price = deal ? formatPrice(deal.amount, deal.currency) : null;
          return (
            <a
              key={key}
              className={
                detailed
                  ? `details-store-card${deal ? "" : " is-unavailable"}`
                  : `store-pill${snapshot.bestStore === key ? " store-pill-best" : ""}${deal ? "" : " store-pill-empty"}`
              }
              href={safeStoreUrl(deal?.url) || links[key]}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${shop.label}: ${price || "search store"}`}
            >
              <span className="store-name">{shop.shortLabel}</span>
              <strong className="store-price">{price || "—"}</strong>
              {deal && deal.cut > 0 && (
                <span className="store-cut">-{deal.cut}%</span>
              )}
            </a>
          );
        })}
      </div>
      {toggle}
      {message && (
        <span className="price-status" role="status">
          {message}
        </span>
      )}
      {detailed && (
        <p className="details-stores-note">
          {snapshot.historyLow && (
            <>
              All-time low:{" "}
              <strong>
                {formatPrice(
                  snapshot.historyLow.amount,
                  snapshot.historyLow.currency,
                )}
              </strong>{" "}
              ·{" "}
            </>
          )}
          Prices for {country === "BR" ? "Brazil" : "the United States"} via{" "}
          <a
            href="https://isthereanydeal.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            IsThereAnyDeal
          </a>
          . Prices and availability may change.
        </p>
      )}
    </>
  );
}
