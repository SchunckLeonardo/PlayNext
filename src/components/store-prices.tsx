"use client";
import { useEffect, useState } from "react";
import type { Game, PriceSnapshot } from "@/lib/types";
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
import { CurrencySelector, usePreferences } from "./preferences";

const client = new PriceClient();
export function StorePrices({
  game,
  rawg,
  detailed = false,
}: {
  game: Game;
  rawg: RawgClient | null;
  detailed?: boolean;
}) {
  const { country, locale, t } = usePreferences();
  const [result, setResult] = useState<{
    gameId: number;
    snapshot: PriceSnapshot;
  } | null>(null);
  // A new game or currency must never display the previous request's amount.
  const snapshot =
    result?.gameId === game.id && result.snapshot.country === country
      ? result.snapshot
      : null;
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
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
          const snapshot = await client.forGame(
            identity,
            country,
            controller.signal,
          );
          if (!controller.signal.aborted)
            setResult({ gameId: game.id, snapshot });
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
  const links = fallbackStoreLinks(game.name);
  const message = !snapshot
    ? ""
    : snapshot.status === "unconfigured"
      ? t("Live prices are not configured on this server.")
      : snapshot.status === "unavailable"
        ? t("Live prices are temporarily unavailable.")
        : snapshot.status === "rate-limited"
          ? t("Price requests are paused. Try again shortly.")
          : snapshot.status === "not-found"
            ? t("No verified offer found for this game and region.")
            : "";
  return (
    <div
      className={`store-comparison ${detailed ? "store-comparison-detailed" : "store-comparison-compact"}`}
    >
      <div className="details-stores-head">
        <h3 className="details-stores-title">
          <Icon name="tag" />
          {detailed ? t("Compare PC stores") : t("PC stores")}
        </h3>
        <CurrencySelector />
      </div>
      {!snapshot ? (
        <div className="price-loading" role="status">
          <span className="spinner" />
          {t("Checking Steam · GOG · Epic…")}
        </div>
      ) : snapshot.status === "console-only" ? (
        <p className="price-status" role="status">
          {t("Console release · No PC store listing")}
        </p>
      ) : (
        <>
          <div className={detailed ? "details-stores-grid" : "store-pills"}>
            {STORE_KEYS.map((key) => {
              const deal = snapshot.stores[key],
                shop = ITAD_SHOPS[key];
              const price = deal
                ? formatPrice(deal.amount, deal.currency, locale)
                : null;
              const best = snapshot.bestStore === key;
              return (
                <a
                  key={key}
                  className={
                    detailed
                      ? `details-store-card${best ? " is-best" : ""}${deal ? "" : " is-unavailable"}`
                      : `store-pill${best ? " store-pill-best" : ""}${deal ? "" : " store-pill-empty"}`
                  }
                  href={safeStoreUrl(deal?.url) || links[key]}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${shop.label}: ${price || t("Search store")}`}
                >
                  {detailed ? (
                    <>
                      <div className="details-store-top">
                        <span className="details-store-name">{shop.label}</span>
                        {deal && deal.cut > 0 && (
                          <span className="details-store-cut">
                            -{deal.cut}%
                          </span>
                        )}
                      </div>
                      <div className="details-store-pricing">
                        {price ? (
                          <strong className="details-store-price">
                            {price}
                          </strong>
                        ) : (
                          <span className="details-store-na">
                            {t("No live offer")}
                          </span>
                        )}
                        {deal && deal.regular > deal.amount && (
                          <span className="details-store-regular">
                            {formatPrice(deal.regular, deal.currency, locale)}
                          </span>
                        )}
                      </div>
                      <span className="details-store-cta">
                        {deal ? t("Visit store") : t("Search store")}
                        <Icon name="external" />
                      </span>
                      {best && (
                        <span className="details-store-badge">
                          {t("Best current price")}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="store-name">{shop.shortLabel}</span>
                      <strong className="store-price">
                        {price || t("Search")}
                      </strong>
                    </>
                  )}
                </a>
              );
            })}
          </div>
          {message && (
            <p className="price-status" role="status">
              {message}
            </p>
          )}
          {detailed && (
            <p className="details-stores-note">
              {snapshot.historyLow && (
                <>
                  {t("All-time low")}:{" "}
                  <strong>
                    {formatPrice(
                      snapshot.historyLow.amount,
                      snapshot.historyLow.currency,
                      locale,
                    )}
                  </strong>
                  <br />
                </>
              )}
              {t("Prices for {country} via", {
                country: country === "BR" ? t("Brazil") : t("United States"),
              })}{" "}
              <a
                href="https://isthereanydeal.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                IsThereAnyDeal
              </a>
              . {t("Prices and availability may change.")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
