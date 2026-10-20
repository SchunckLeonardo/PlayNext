"use client";
import { usePreferences, LanguageSelector } from "./preferences";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AccountState,
  ChoiceStatus,
  ClientConfig,
  Filters,
  Game,
} from "@/lib/types";
import { errorMessage } from "@/lib/types";
import {
  PLATFORMS,
  GENRES,
  STATUSES,
  shuffle,
  matchesFilters,
  unseenGames,
  decide,
  safeImage,
} from "@/lib/model";
import { emptyState } from "@/lib/account";
import { RawgClient } from "@/lib/api";
import { DEMO_GAMES } from "@/lib/demo";
import { Icon } from "./icon";
import { Dialog } from "./dialog";
import { StorePrices } from "./store-prices";
import { AccountPanel } from "./account-panel";
import { PrivacyContent, TutorialContent } from "./info-content";
import { useAccount } from "./use-account";

interface Catalog {
  client: RawgClient;
  platforms: { id: number; slug: string }[];
  genres: { slug: string; name: string }[];
}
type Modal = "api" | "account" | "privacy" | "tutorial" | null;
const keyChoices: Record<string, ChoiceStatus | undefined> = {
  ArrowLeft: "no",
  ArrowDown: "played",
  ArrowRight: "yes",
};
const statusKeys: ChoiceStatus[] = ["yes", "played", "no"];
const platformNames = (game: Game) =>
  game.platforms
    .map((slug) => PLATFORMS.find((p) => p.slug === slug)?.label)
    .filter(Boolean)
    .join(" · ");
function Artwork({
  game,
  className = "",
  eager = false,
}: {
  game: Game;
  className?: string;
  eager?: boolean;
}) {
  const { t } = usePreferences();
  return safeImage(game.image) ? (
    <img
      className={className}
      src={safeImage(game.image)}
      alt={t("Artwork for {name}", { name: game.name })}
      loading={eager ? "eager" : "lazy"}
      draggable={false}
      onError={(e) => {
        e.currentTarget.style.visibility = "hidden";
      }}
    />
  ) : null;
}
export function PlayNext({ config }: { config: ClientConfig }) {
  const { locale, t, text } = usePreferences();
  const [state, setState] = useState<AccountState>(emptyState),
    stateRef = useRef(state);
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    catalogRef = useRef(catalog);
  const [queue, setQueue] = useState<Game[]>(DEMO_GAMES),
    [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState("");
  const [connecting, setConnecting] = useState(false),
    [connectError, setConnectError] = useState("");
  const [modal, setModal] = useState<Modal>(null),
    [details, setDetails] = useState<Game | null>(null);
  const [view, setView] = useState<"discover" | "collection">("discover"),
    [collectionStatus, setCollectionStatus] = useState<ChoiceStatus | "all">(
      "all",
    ),
    [search, setSearch] = useState("");
  const [rawgInput, setRawgInput] = useState(""),
    [showKey, setShowKey] = useState(false);
  const [reload, setReload] = useState(0),
    [toast, setToast] = useState(""),
    [deciding, setDeciding] = useState<ChoiceStatus | null>(null),
    [dragX, setDragX] = useState(0);
  const [undoState, setUndoState] = useState<{
    state: AccountState;
    game: Game;
  } | null>(null);
  const generation = useRef(0),
    connectionController = useRef<AbortController | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    id: number;
    moved: boolean;
  } | null>(null);
  const filters = state.filters;
  const available = unseenGames(queue, state.history),
    game = available[0];
  const notify = useCallback((message: string) => setToast(message), []);
  const replaceState = useCallback((next: AccountState) => {
    generation.current++;
    connectionController.current?.abort();
    stateRef.current = next;
    setState(next);
    setUndoState(null);
    setDetails(null);
    setDeciding(null);
    setSearch("");
    catalogRef.current = null;
    setCatalog(null);
    setReload((v) => v + 1);
  }, []);
  const account = useAccount(
    config,
    () => stateRef.current,
    replaceState,
    notify,
  );
  const persist = (next: AccountState) => {
    stateRef.current = next;
    setState(next);
    void account.save(next);
  };
  const closeModal = () => {
    if (modal === "api") {
      connectionController.current?.abort();
      setConnecting(false);
    }
    setModal(null);
    setRawgInput("");
    setShowKey(false);
  };
  const openAccount = () => {
    setModal("account");
    void account.restore();
  };
  const navigate = (
    next: "discover" | "collection",
    status: ChoiceStatus | "all" = "all",
  ) => {
    setView(next);
    setCollectionStatus(status);
    location.hash = next;
  };
  const labelGenre = (slug: string) =>
    text(
      GENRES.find((g) => g.slug === slug)?.name ||
        catalog?.genres.find((g) => g.slug === slug)?.name ||
        slug,
    );
  const connect = useCallback(
    async (key: string, automatic = false) => {
      connectionController.current?.abort();
      const controller = new AbortController();
      connectionController.current = controller;
      setConnecting(true);
      setConnectError("");
      const candidate = new RawgClient(key);
      try {
        const data = await candidate.connect(controller.signal);
        const platforms = data.platforms.filter(
          (p): p is { id: number; slug: string } =>
            typeof p.id === "number" && typeof p.slug === "string",
        );
        const genres = data.genres.filter(
          (g): g is { slug: string; name: string } =>
            typeof g.slug === "string" && typeof g.name === "string",
        );
        if (
          !platforms.some((p) =>
            PLATFORMS.some((known) => known.slug === p.slug),
          )
        )
          throw new Error(
            "RAWG did not return the expected platforms. Try again.",
          );
        if (controller.signal.aborted) return;
        const nextCatalog = { client: candidate, platforms, genres };
        catalogRef.current = nextCatalog;
        setCatalog(nextCatalog);
        setUndoState(null);
        setRawgInput("");
        setModal((current) => (current === "api" ? null : current));
        if (!automatic) {
          const next = { ...stateRef.current, rawg_key: key.trim() };
          stateRef.current = next;
          setState(next);
          void account.save(next);
          notify("RAWG connected. Let’s find your next game!");
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setConnectError(errorMessage(error));
          if (automatic)
            notify("Could not reconnect to RAWG. Open My key to try again.");
        }
      } finally {
        if (!controller.signal.aborted) setConnecting(false);
      }
    },
    [account.save, notify],
  );
  useEffect(() => {
    if (state.rawg_key && catalogRef.current?.client.key !== state.rawg_key)
      void connect(state.rawg_key, true);
  }, [state.rawg_key, reload, connect]);
  useEffect(() => {
    const controller = new AbortController();
    setLoadError("");
    if (!catalog) {
      const games = unseenGames(
        DEMO_GAMES.filter((g) =>
          matchesFilters(g, filters.platforms, filters.genre),
        ),
        stateRef.current.history,
      );
      setQueue(
        reload === 0 && !filters.platforms.length && !filters.genre
          ? games
          : shuffle(games),
      );
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);
    setQueue([]);
    const timer = setTimeout(() => {
      const selected = filters.platforms.length
        ? filters.platforms
        : PLATFORMS.map((p) => p.slug);
      void catalog.client
        .sample({
          platforms: catalog.platforms
            .filter((p) => selected.includes(p.slug))
            .map((p) => p.id),
          genre: filters.genre,
          history: stateRef.current.history,
          signal: controller.signal,
        })
        .then((result) => {
          if (!controller.signal.aborted) setQueue(result.games);
        })
        .catch((error) => {
          if (!controller.signal.aborted) setLoadError(errorMessage(error));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 280);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [catalog, filters, reload]);
  useEffect(() => {
    const route = () =>
      setView(
        location.hash.startsWith("#collection") ? "collection" : "discover",
      );
    route();
    window.addEventListener("hashchange", route);
    return () => window.removeEventListener("hashchange", route);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3700);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!details || !catalog) return;
    const controller = new AbortController();
    void catalog.client
      .details(details.id, controller.signal)
      .then((result) => {
        if (result && !controller.signal.aborted)
          setDetails((current) =>
            current?.id === result.id
              ? { ...current, description: result.description }
              : current,
          );
      })
      .catch(() => {});
    return () => controller.abort();
  }, [details?.id, catalog]);
  const choose = (status: ChoiceStatus) => {
    if (!game || loading || deciding) return;
    const currentGeneration = generation.current,
      prior = stateRef.current;
    setDeciding(status);
    setTimeout(
      () => {
        if (currentGeneration !== generation.current) return;
        setUndoState({ state: prior, game });
        persist({ ...prior, history: decide(prior.history, game, status) });
        setDeciding(null);
        setDragX(0);
        notify(`${game.name} · ${text(STATUSES[status].label)}`);
        if (available.length === 1 && catalog) setReload((v) => v + 1);
      },
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 210,
    );
  };
  const undo = () => {
    if (!undoState || deciding) return;
    persist(undoState.state);
    setQueue((current) => [
      undoState.game,
      ...current.filter((g) => g.id !== undoState.game.id),
    ]);
    setUndoState(null);
    notify("Last choice undone.");
  };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        modal ||
        details ||
        view !== "discover" ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (event.target instanceof Element &&
          event.target.closest(
            'input,select,textarea,button,a,[contenteditable="true"]',
          ))
      )
        return;
      const status = keyChoices[event.key];
      if (status) {
        event.preventDefault();
        choose(status);
      }
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  });
  const updateFilters = (next: Filters) => {
    setUndoState(null);
    generation.current++;
    setDeciding(null);
    persist({ ...stateRef.current, filters: next });
  };
  const syncNote = account.user
    ? account.error
      ? "You have unsaved choices. Open My account."
      : account.pending
        ? "Saving with encryption…"
        : "Collection saved with encryption to your account."
    : "Guest: choices stay in this tab only.";
  const collection = state.history.filter(
    (entry) =>
      (collectionStatus === "all" || entry.status === collectionStatus) &&
      entry.game.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <a className="skip-link" href="#main">
        {t("Skip to content")}
      </a>
      {config.local && (
        <div className="local-environment">
          {t("LOCAL ENVIRONMENT · isolated synthetic test account")}
        </div>
      )}
      <header className="topbar">
        <a href="#discover" className="brand" aria-label={t("PlayNext, home")}>
          <span className="brand-symbol">
            <Icon name="gamepad" />
          </span>
          <span>
            playnext<span className="brand-dot">.</span>
          </span>
        </a>
        <nav aria-label={t("Main navigation")} className="main-nav">
          <a
            href="#discover"
            className={`nav-link${view === "discover" ? " active" : ""}`}
            aria-current={view === "discover" ? "page" : undefined}
          >
            <Icon name="shuffle" /> {t("Discover")}
          </a>
          <a
            href="#collection"
            className={`nav-link${view === "collection" ? " active" : ""}`}
            aria-current={view === "collection" ? "page" : undefined}
          >
            <Icon name="collection" /> {t("My collection")}{" "}
            <span className="nav-count">{state.history.length}</span>
          </a>
        </nav>
        <div className="header-actions">
          <LanguageSelector />
          <span className={`connection-status${catalog ? " connected" : ""}`}>
            <i />
            {catalog ? t("RAWG connected") : t("Demo mode")}
          </span>
          <button className="button button-key" onClick={() => setModal("api")}>
            <Icon name="key" />
            <span>{state.rawg_key ? t("My key") : t("Connect RAWG")}</span>
          </button>
          <button className="button account-button" onClick={openAccount}>
            <Icon name="lock" />
            <span>{account.user ? t("My account") : t("Sign in")}</span>
          </button>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {view === "discover" ? (
          <section className="discover-layout" aria-label={t("Discover games")}>
            <aside
              className="filters-panel"
              aria-label={t("Discovery filters")}
            >
              <div className="panel-heading">
                <h2>
                  <Icon name="filters" /> {t("Your way")}
                </h2>
                <button
                  className="text-button"
                  onClick={() => updateFilters({ platforms: [], genre: "" })}
                >
                  {t("Clear")}
                </button>
              </div>
              <p className="filter-intro">
                {t("Chance has preferences, too.")}
              </p>
              <fieldset className="platform-fieldset">
                <legend>{t("WHERE YOU PLAY")}</legend>
                <button
                  className={`platform-all${filters.platforms.length ? "" : " selected"}`}
                  aria-pressed={!filters.platforms.length}
                  onClick={() => updateFilters({ ...filters, platforms: [] })}
                >
                  <Icon name="globe" /> {t("All platforms")}{" "}
                  <span className="selection-dot" />
                </button>
                {["PC", "PlayStation", "Nintendo", "Xbox"].map((family) => (
                  <div className="platform-family" key={family}>
                    <div className="family-label">{family}</div>
                    <div className="platform-chips">
                      {PLATFORMS.filter((p) => p.family === family).map((p) => (
                        <button
                          className="platform-chip"
                          key={p.slug}
                          aria-pressed={filters.platforms.includes(p.slug)}
                          disabled={
                            !!catalog &&
                            !catalog.platforms.some((cp) => cp.slug === p.slug)
                          }
                          onClick={() =>
                            updateFilters({
                              ...filters,
                              platforms: filters.platforms.includes(p.slug)
                                ? filters.platforms.filter((s) => s !== p.slug)
                                : [...filters.platforms, p.slug],
                            })
                          }
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </fieldset>
              <div className="genre-filter">
                <label htmlFor="genre">{t("WHAT’S THE VIBE?")}</label>
                <div className="select-wrap">
                  <select
                    id="genre"
                    value={filters.genre}
                    onChange={(e) =>
                      updateFilters({ ...filters, genre: e.target.value })
                    }
                  >
                    <option value="">{t("All genres")}</option>
                    {(catalog?.genres || GENRES).map((g) => (
                      <option key={g.slug} value={g.slug}>
                        {labelGenre(g.slug)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="filter-footnote">
                <Icon name="info" />
                <span>
                  {t("Choose one or more platforms.")}
                  <br />
                  {t("Or let the universe decide.")}
                </span>
              </div>
              <div className="sidebar-bottom">
                <span className="tiny-star">✳</span>
                <p>
                  {t("Your next great story")}
                  <br />
                  {t("starts with a")} <em>{t("play.")}</em>
                </p>
                <span className="mini-line" />
              </div>
            </aside>
            <section className="discovery" aria-labelledby="discovery-title">
              <div className="discovery-heading">
                <div>
                  <div className="eyebrow">
                    <span className="orange-dash" />{" "}
                    {t("STOP STARING AT YOUR LIBRARY")}
                  </div>
                  <h1 id="discovery-title">
                    {t("Less browsing.")}
                    <br />
                    {t("More")} <span>{t("playing.")}</span>
                  </h1>
                  <p>{t("One game at a time. Your next favorite is here.")}</p>
                </div>
                <span className="heading-doodle" aria-hidden="true">
                  ✳
                </span>
              </div>
              <div className="deck-toolbar">
                <span>
                  <span className="live-dot" />{" "}
                  {catalog
                    ? t("Discovering the RAWG catalog")
                    : t("Demo · {count} games to explore", {
                        count: available.length,
                      })}
                </span>
                <button
                  className="text-button shuffle-button"
                  disabled={loading || !!deciding}
                  onClick={() => setReload((v) => v + 1)}
                >
                  <Icon name="shuffle" /> {t("Shuffle")}
                </button>
              </div>
              <div className="deck-stage">
                <div className="stack-layer layer-two" />
                <div className="stack-layer layer-one" />
                <div
                  id="game-card"
                  className={`game-card${!game && !loading ? " is-empty" : ""}`}
                  role="group"
                  aria-label={t("Suggested game")}
                  aria-busy={loading}
                  style={{
                    transform: deciding
                      ? deciding === "played"
                        ? "translateY(35px) scale(.96)"
                        : `translateX(${deciding === "yes" ? 90 : -90}px) rotate(${deciding === "yes" ? 8 : -8}deg)`
                      : dragX
                        ? `translateX(${dragX * 0.7}px) rotate(${dragX / 22}deg)`
                        : undefined,
                    opacity: deciding ? 0 : 1,
                    transition: dragX ? "none" : undefined,
                  }}
                  onPointerDown={(event) => {
                    if (
                      event.button !== 0 ||
                      !game ||
                      loading ||
                      deciding ||
                      (event.target instanceof Element &&
                        event.target.closest(
                          "a,button,input,select,label,textarea",
                        ))
                    )
                      return;
                    drag.current = {
                      x: event.clientX,
                      y: event.clientY,
                      id: event.pointerId,
                      moved: false,
                    };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={(event) => {
                    const current = drag.current;
                    if (!current || current.id !== event.pointerId) return;
                    const dx = event.clientX - current.x,
                      dy = event.clientY - current.y;
                    if (
                      !current.moved &&
                      (Math.abs(dx) < 7 || Math.abs(dy) > Math.abs(dx))
                    )
                      return;
                    current.moved = true;
                    setDragX(dx);
                  }}
                  onPointerUp={(event) => {
                    const current = drag.current;
                    drag.current = null;
                    setDragX(0);
                    if (event.currentTarget.hasPointerCapture(event.pointerId))
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      );
                    if (
                      current?.moved &&
                      Math.abs(event.clientX - current.x) > 75
                    )
                      choose(event.clientX > current.x ? "yes" : "no");
                  }}
                  onPointerCancel={() => {
                    drag.current = null;
                    setDragX(0);
                  }}
                >
                  {loading ? (
                    <>
                      <div className="skeleton" />
                      <div className="loading-label">
                        <span className="spinner" />{" "}
                        {t("Finding your next adventure…")}
                      </div>
                    </>
                  ) : game && !loadError ? (
                    <>
                      <Artwork game={game} className="game-image" eager />
                      <div className="game-scrim" />
                      <div className="game-card-top">
                        <span className="game-category">
                          <Icon name="shuffle" />{" "}
                          {catalog
                            ? t("YOUR NEXT DISCOVERY")
                            : t("DEMO SELECTION")}
                        </span>
                        {game.rating !== null && game.rating > 0 && (
                          <span className="game-rating">
                            <Icon name="star" />{" "}
                            {new Intl.NumberFormat(locale, {
                              minimumFractionDigits: 1,
                              maximumFractionDigits: 1,
                            }).format(game.rating)}{" "}
                            <span className="rating-max">/ 5</span>
                          </span>
                        )}
                      </div>
                      <span
                        className="swipe-stamp"
                        aria-hidden="true"
                        style={{
                          opacity: Math.min(Math.abs(dragX) / 100, 1),
                          color: dragX > 0 ? "var(--green)" : "var(--red)",
                        }}
                      >
                        {text(
                          STATUSES[dragX > 0 ? "yes" : "no"].label,
                        ).toUpperCase()}
                      </span>
                      <div className="game-copy">
                        <div className="game-genres">
                          {game.genres.slice(0, 3).map((g) => (
                            <span key={g}>{labelGenre(g)}</span>
                          ))}
                        </div>
                        <h2 className="game-title">{game.name}</h2>
                        {game.description && (
                          <p className="game-description">
                            {text(game.description)}
                          </p>
                        )}
                        <div
                          className="game-stores"
                          aria-label={t("PC store prices")}
                        >
                          <StorePrices
                            game={game}
                            rawg={catalog?.client || null}
                          />
                        </div>
                        <div className="game-meta">
                          <div className="game-meta-left">
                            <span>
                              {game.released?.slice(0, 4) ||
                                t("Release year unknown")}
                            </span>
                            <span className="meta-divider" />
                            <span className="game-platforms">
                              {platformNames(game)}
                            </span>
                          </div>
                          <button
                            className="details-link"
                            onClick={() => setDetails(game)}
                          >
                            {t("View details")} <Icon name="external" />
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="empty-card">
                      <Icon name={loadError ? "info" : "shuffle"} />
                      <h2>
                        {loadError
                          ? t("A pause in the adventure.")
                          : t("You’ve explored this selection!")}
                      </h2>
                      <p>
                        {text(loadError) ||
                          t(
                            "Try another selection, broaden your filters, or connect RAWG to discover more games.",
                          )}
                      </p>
                      <button
                        className="button primary-button"
                        onClick={() =>
                          catalog ? setReload((v) => v + 1) : setModal("api")
                        }
                      >
                        {catalog
                          ? t("Find another selection")
                          : t("Connect RAWG")}
                        <Icon name="arrow" />
                      </button>
                      <button
                        className="text-button"
                        onClick={() =>
                          updateFilters({ platforms: [], genre: "" })
                        }
                      >
                        {t("Clear filters")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="decision-controls">
                {(["no", "played", "yes"] as ChoiceStatus[]).map((status) => (
                  <div className="decision-wrap" key={status}>
                    <button
                      className={`decision decision-${status}`}
                      disabled={!game || loading || !!deciding}
                      onClick={() => choose(status)}
                      aria-label={
                        status === "yes"
                          ? t("I want to play this game")
                          : status === "no"
                            ? t("Not interested in this game")
                            : t("I’ve played this game")
                      }
                    >
                      <Icon name={STATUSES[status].icon} />
                    </button>
                    <span>{text(STATUSES[status].label)}</span>
                    <kbd>
                      {status === "yes" ? "→" : status === "no" ? "←" : "↓"}
                    </kbd>
                  </div>
                ))}
              </div>
              <div className="deck-bottom">
                <button
                  className="undo-button"
                  disabled={!undoState || !!deciding}
                  onClick={undo}
                >
                  <Icon name="undo" /> {t("Undo last choice")}
                </button>
                <span className="swipe-hint">
                  {t("Swipe the card to choose ↔")}
                </span>
              </div>
              {!catalog && (
                <div className="demo-banner">
                  <span className="demo-icon">
                    <Icon name="gamepad" />
                  </span>
                  <p>
                    <strong>{t("Just trying it out?")}</strong>
                    <br />
                    {t("Connect your key to explore the RAWG catalog.")}
                  </p>
                  <button
                    className="text-button"
                    onClick={() => setModal("api")}
                  >
                    {t("Connect")} <Icon name="arrow" />
                  </button>
                </div>
              )}
            </section>
            <aside className="activity-panel" aria-label={t("Your activity")}>
              <div className="session-title">
                <span className="live-dot" /> {t("YOUR JOURNEY")}
              </div>
              <h2>
                {t("Good choices.")}
                <br />
                {t("New adventures.")}
              </h2>
              <p className="session-intro">
                {t("Find something that fits")}
                <br />
                {t("your next free moment.")}
              </p>
              <div className="stats-list">
                {statusKeys.map((status) => (
                  <button
                    key={status}
                    onClick={() => navigate("collection", status)}
                  >
                    <span className={`stat-icon ${STATUSES[status].color}`}>
                      <Icon name={STATUSES[status].icon} />
                    </span>
                    <span>{text(STATUSES[status].label)}</span>
                    <strong>
                      {String(
                        state.history.filter((e) => e.status === status).length,
                      ).padStart(2, "0")}
                    </strong>
                    <Icon name="chevron" />
                  </button>
                ))}
              </div>
              <div className="recent-heading">
                <h3>{t("Recent choices")}</h3>
                <span>{state.history.length}</span>
              </div>
              <div className="recent-list">
                {state.history.length ? (
                  state.history.slice(0, 3).map((entry) => (
                    <button
                      className="recent-item"
                      key={entry.game.id}
                      onClick={() => setDetails(entry.game)}
                    >
                      <Artwork game={entry.game} />
                      <div>
                        <h4>{entry.game.name}</h4>
                        <p className={STATUSES[entry.status].color}>
                          <Icon name={STATUSES[entry.status].icon} />
                          {text(STATUSES[entry.status].label)}
                        </p>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="recent-empty">
                    <Icon name="collection" />
                    <strong>{t("A collection that feels like you.")}</strong>
                    {t("Your first choices will show up here.")}
                  </div>
                )}
              </div>
              <div className="keyboard-note">
                <Icon name="monitor" />
                <div>
                  <strong>{t("Keyboard works, too.")}</strong>
                  <p>
                    {t("Use ← ↓ → arrow keys to choose.")}
                    <br />
                    <kbd>Z</kbd> {t("undoes your last choice.")}
                  </p>
                </div>
              </div>
              <div className="local-note">
                <Icon name="lock" />
                <p role="status">{text(syncNote)}</p>
              </div>
              <button className="text-button" onClick={openAccount}>
                {account.user
                  ? t("Manage my account")
                  : t("Sign in and save choices")}
              </button>
            </aside>
          </section>
        ) : (
          <section
            className="collection-view"
            aria-labelledby="collection-title"
          >
            <div className="collection-heading">
              <div>
                <div className="eyebrow">{t("YOUR NEXT ADVENTURES")}</div>
                <h1 id="collection-title">
                  {t("My collection")}
                  <span>.</span>
                </h1>
                <p>{text(syncNote)}</p>
              </div>
              <button
                className="button primary-button"
                onClick={() => navigate("discover")}
              >
                {t("Discover games")} <Icon name="arrow" />
              </button>
            </div>
            <div className="collection-toolbar">
              <div
                className="collection-tabs"
                aria-label={t("Filter collection")}
              >
                {(["all", ...statusKeys] as const).map((status) => (
                  <button
                    key={status}
                    className={collectionStatus === status ? "active" : ""}
                    aria-pressed={collectionStatus === status}
                    onClick={() => setCollectionStatus(status)}
                  >
                    {status === "all"
                      ? t("All games")
                      : text(STATUSES[status].label)}{" "}
                    <span>
                      {
                        state.history.filter(
                          (e) => status === "all" || e.status === status,
                        ).length
                      }
                    </span>
                  </button>
                ))}
              </div>
              <div className="collection-search">
                <Icon name="search" />
                <input
                  aria-label={t("Search collection")}
                  placeholder={t("Search your collection")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="collection-grid">
              {collection.length ? (
                collection.map((entry) => (
                  <article className="collection-card" key={entry.game.id}>
                    <button
                      className="collection-cover"
                      onClick={() => setDetails(entry.game)}
                      aria-label={t("View details for {name}", {
                        name: entry.game.name,
                      })}
                    >
                      <Artwork game={entry.game} />
                    </button>
                    <div className="collection-card-body">
                      <h3>{entry.game.name}</h3>
                      <p className="collection-platforms">
                        {platformNames(entry.game)}
                      </p>
                      <div className="collection-card-controls">
                        <label
                          className="sr-only"
                          htmlFor={`status-${entry.game.id}`}
                        >
                          {t("Change choice for {name}", {
                            name: entry.game.name,
                          })}
                        </label>
                        <select
                          id={`status-${entry.game.id}`}
                          value={entry.status}
                          onChange={(e) => {
                            setUndoState(null);
                            persist({
                              ...stateRef.current,
                              history: decide(
                                stateRef.current.history,
                                entry.game,
                                e.target.value as ChoiceStatus,
                              ),
                            });
                          }}
                        >
                          {statusKeys.map((s) => (
                            <option key={s} value={s}>
                              {text(STATUSES[s].label)}
                            </option>
                          ))}
                        </select>
                        <button
                          className="icon-button"
                          aria-label={t("Remove {name} from your collection", {
                            name: entry.game.name,
                          })}
                          onClick={() => {
                            setUndoState(null);
                            persist({
                              ...stateRef.current,
                              history: stateRef.current.history.filter(
                                (e) => e.game.id !== entry.game.id,
                              ),
                            });
                            notify(
                              "Game removed. It may appear in Discover again.",
                            );
                          }}
                        >
                          <Icon name="trash" />
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="collection-empty">
                  <Icon name="collection" />
                  <h2>
                    {search
                      ? t("This game is not here yet.")
                      : t("Every adventure starts somewhere.")}
                  </h2>
                  <p>
                    {t(
                      "Swipe through games in Discover. Your choices are organized here.",
                    )}
                  </p>
                  <button
                    className="button primary-button"
                    onClick={() => navigate("discover")}
                  >
                    {t("Discover games")}
                  </button>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
      <footer className="footer">
        <span>{t("Less indecision. More fun.")}</span>
        <button className="text-button" onClick={() => setModal("tutorial")}>
          {t("How to get a key")}
        </button>
        <button className="text-button" onClick={() => setModal("privacy")}>
          {t("Privacy")}
        </button>
        <span>{t("Made for people who love to play ✳")}</span>
        <a href="https://rawg.io" target="_blank" rel="noopener noreferrer">
          {t("Data and images by")} <strong>RAWG</strong>
          <Icon name="external" />
        </a>
      </footer>
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <Icon name="check" />
          {text(toast)}
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {game
          ? t("Suggested: {name}. Use the arrow keys to choose.", {
              name: game.name,
            })
          : t("No suggested game.")}
      </span>
      {modal && (
        <Dialog
          title={modal === "api" ? t("API settings") : t(modal)}
          className={
            modal === "api"
              ? "api-modal"
              : modal === "account"
                ? "account-modal"
                : "guide-modal"
          }
          close={closeModal}
        >
          {modal === "api" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (rawgInput.trim()) void connect(rawgInput.trim());
              }}
            >
              <div className="eyebrow">{t("YOUR KEY. YOUR NEXT GAME.")}</div>
              <h2>
                {t("A universe to discover")}
                <span>.</span>
              </h2>
              <p>
                {t(
                  "Connect your own RAWG key to find games on your favorite platforms.",
                )}
              </p>
              <label htmlFor="api-key">{t("Your RAWG API key")}</label>
              <div className="key-input-wrap">
                <input
                  id="api-key"
                  type={showKey ? "text" : "password"}
                  value={rawgInput}
                  onChange={(e) => setRawgInput(e.target.value)}
                  placeholder={t("Paste your API key here")}
                  maxLength={256}
                  required
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={showKey ? t("Hide API key") : t("Show API key")}
                  onClick={() => setShowKey((v) => !v)}
                >
                  <Icon name="eye" />
                </button>
              </div>
              <p className="input-help">
                <Icon name="lock" />{" "}
                {account.user
                  ? t(
                      "Used with RAWG and stored encrypted in your account’s Vault.",
                    )
                  : t(
                      "As a guest, your key stays in this tab’s memory. Sign in to store it encrypted.",
                    )}
              </p>
              {connectError && (
                <p className="form-error" role="alert">
                  {text(connectError)}
                </p>
              )}
              <button
                className="button primary-button connect-button"
                type="submit"
                disabled={connecting}
              >
                {connecting
                  ? t("Connecting to RAWG…")
                  : t("Connect and discover")}
                <Icon name="arrow" />
              </button>
              {state.rawg_key && (
                <button
                  type="button"
                  className="disconnect-button text-button"
                  onClick={() => {
                    generation.current++;
                    connectionController.current?.abort();
                    catalogRef.current = null;
                    setCatalog(null);
                    setConnecting(false);
                    persist({ ...stateRef.current, rawg_key: null });
                    closeModal();
                  }}
                >
                  {t("Remove key and use demo")}
                </button>
              )}
              <div className="get-key">
                {t("Don’t have a key yet?")}{" "}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setRawgInput("");
                    setModal("tutorial");
                  }}
                >
                  {t("See how to get one for free")} <Icon name="arrow" />
                </button>
              </div>
            </form>
          ) : modal === "account" ? (
            <AccountPanel
              account={account}
              local={config.local}
              privacy={() => setModal("privacy")}
            />
          ) : modal === "privacy" ? (
            <PrivacyContent />
          ) : (
            <TutorialContent connect={() => setModal("api")} />
          )}
        </Dialog>
      )}
      {details && (
        <Dialog
          title={t("{title} details", { title: details.name })}
          className="details-modal"
          close={() => setDetails(null)}
        >
          <div className="details-art">
            <Artwork game={details} eager />
          </div>
          <div className="details-body">
            <div className="game-genres">
              {details.genres.map((g) => (
                <span key={g}>{labelGenre(g)}</span>
              ))}
            </div>
            <h2>{details.name}</h2>
            <div className="details-meta">
              <span>{platformNames(details)}</span>
              {details.metacritic !== null && (
                <span>Metacritic: {details.metacritic}</span>
              )}
            </div>
            <section
              className="details-stores"
              aria-label={t("PC store prices")}
            >
              <StorePrices
                game={details}
                rawg={catalog?.client || null}
                detailed
              />
            </section>
            <p className="details-description">
              {text(details.description) ||
                t("No description is available for this game.")}
            </p>
            {catalog && details.description && (
              <p className="details-source">
                {t("Description supplied by RAWG in its original language.")}
              </p>
            )}
            <a
              className="button primary-button"
              href={`https://rawg.io/games/${encodeURIComponent(details.slug)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("View on RAWG")} <Icon name="external" />
            </a>
          </div>
        </Dialog>
      )}
    </>
  );
}
