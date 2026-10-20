import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localStatus, fixture } from "../../scripts/local.mjs";
import { PLATFORMS } from "../../src/lib/model";
import { emptyState } from "../../src/lib/account";
import type { AccountState } from "../../src/lib/types";

test("guest choices, undo, platform and genre filters, collection editing and store regions work", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/prices?**", async (route) => {
    const country =
      new URL(route.request().url()).searchParams.get("country") || "US";
    const currency = country === "BR" ? "BRL" : "USD";
    await route.fulfill({
      json: {
        found: true,
        status: "available",
        source: "itad",
        country,
        currency,
        itadId: "synthetic-e2e",
        bestStore: "steam",
        stores: {
          steam: {
            amount: country === "BR" ? 149.9 : 49.99,
            regular: country === "BR" ? 299.9 : 59.99,
            cut: 20,
            currency,
            url: "https://store.steampowered.com/app/1245620/",
          },
          gog: null,
          epic: null,
        },
        historyLow: null,
        fetchedAt: new Date().toISOString(),
        expiresAt: Date.now() + 60000,
      },
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Elden Ring", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Steam: $49.99" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Currency" })).toHaveCount(0);
  await page.getByRole("button", { name: "View details", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Currency" }).selectOption("BR");
  await expect(
    dialog.getByRole("link", { name: /Steam: R\$.*149\.90/ }),
  ).toBeVisible();
  await expect(dialog).toContainText("Brazil");
  await expect(dialog).not.toContainText("All-time low:");
  await page.getByRole("button", { name: "Close Elden Ring details" }).click();
  await expect(page.getByRole("combobox", { name: "Currency" })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Steam: R\$.*149\.90/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "I want to play this game" }).click();
  await expect(page.locator(".nav-count")).toHaveText("1");
  await page.getByRole("button", { name: "Undo last choice" }).click();
  await expect(
    page.getByRole("heading", { name: "Elden Ring", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".nav-count")).toHaveText("0");
  await page.getByRole("button", { name: "PC", exact: true }).click();
  await page.getByLabel("WHAT’S THE VIBE?").selectOption("puzzle");
  await expect(
    page.getByRole("heading", { name: "Portal 2", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "I’ve played this game" }).click();
  await page.getByRole("link", { name: /My collection/ }).click();
  const status = page.getByLabel("Change choice for Portal 2");
  await expect(status).toHaveValue("played");
  await status.selectOption("no");
  await expect(status).toHaveValue("no");
  await page.getByRole("button", { name: /Remove Portal 2/ }).click();
  await expect(page.locator(".nav-count")).toHaveText("0");
  expect(errors).toEqual([]);
});
test("a pointer swipe records a choice and the mobile layout stays inside the viewport", async ({
  page,
}) => {
  await page.goto("/");
  const card = page.locator("#game-card"),
    box = await card.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + 130);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 140, box!.y + 135, {
    steps: 10,
  });
  await page.mouse.up();
  await expect(page.locator(".nav-count")).toHaveText("1");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: /Less browsing/ }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({ path: "reports/nextjs-mobile.png", fullPage: true });
});

test("RAWG connection stays in the browser and undo survives the last-card refresh", async ({
  page,
}) => {
  let samples = 0;
  await page.route("https://api.rawg.io/api/**", async (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get("key")).toBe("synthetic-test-key");
    if (url.pathname.endsWith("/platforms"))
      return route.fulfill({
        json: {
          results: PLATFORMS.map((p, id) => ({ ...p, id: id + 1 })),
          next: null,
        },
      });
    if (url.pathname.endsWith("/genres"))
      return route.fulfill({
        json: { results: [{ slug: "action", name: "Action" }], next: null },
      });
    if (url.pathname.endsWith("/stores"))
      return route.fulfill({
        json: {
          results: [{ url: "https://store.steampowered.com/app/264710/" }],
        },
      });
    samples++;
    return route.fulfill({
      json: {
        count: 1,
        results: [
          {
            id: 900000 + samples,
            name: `Synthetic Game ${samples}`,
            slug: `synthetic-game-${samples}`,
            genres: [{ slug: "action" }],
            platforms: [{ platform: { slug: "pc" } }],
            released: "2018-01-23",
            rating: 4,
          },
        ],
      },
    });
  });
  await page.route("**/api/prices?**", async (route) => {
    expect(new URL(route.request().url()).searchParams.has("key")).toBe(false);
    await route.fulfill({ status: 503, json: { status: "unconfigured" } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Connect RAWG", exact: true }).click();
  await page.getByLabel("Your RAWG API key").fill("synthetic-test-key");
  await page.getByRole("button", { name: "Connect and discover" }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetic Game 1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "I want to play this game" }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetic Game 2", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Undo last choice" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Undo last choice" }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetic Game 1", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".nav-count")).toHaveText("0");
});

test.describe("encrypted account compatibility against isolated local Supabase", () => {
  let adminTestClient: ReturnType<typeof createClient>, original: AccountState;
  test.beforeAll(async () => {
    const status = await localStatus(),
      user = await fixture();
    adminTestClient = createClient(
      status.API_URL,
      status.PUBLISHABLE_KEY || status.ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const login = await adminTestClient.auth.signInWithPassword(user);
    expect(login.error).toBeNull();
    const loaded = await adminTestClient.rpc("playnext_load");
    expect(loaded.error).toBeNull();
    original = loaded.data.data;
    const saved = await adminTestClient.rpc("playnext_save", {
      p_state: emptyState(),
      p_revision: loaded.data.revision,
    });
    expect(saved.error).toBeNull();
  });
  test.afterAll(async () => {
    if (adminTestClient && original) {
      const current = await adminTestClient.rpc("playnext_load");
      const restored = await adminTestClient.rpc("playnext_save", {
        p_state: original,
        p_revision: current.data.revision,
      });
      expect(restored.error).toBeNull();
      await adminTestClient.auth.signOut({ scope: "local" });
    }
  });
  test("sign in, save a choice, reload without signing in again, and sign out", async ({
    page,
    browser,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByRole("button", { name: "Sign in with local test account" })
      .click();
    await expect(page.getByRole("dialog")).toContainText("qa@playnext.test");
    await page.getByRole("button", { name: "Close account" }).click();
    const chosenName = await page.locator(".game-title").innerText();
    await page
      .getByRole("button", { name: "I want to play this game" })
      .click();
    await expect(page.locator(".nav-count")).toHaveText("1");
    await expect(page.locator(".local-note")).toContainText("Collection saved");
    await page.reload();
    await expect(
      page.getByRole("button", { name: "My account", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: /My collection/ }).click();
    await expect(
      page.getByRole("heading", { name: chosenName, exact: true }),
    ).toBeVisible();
    const freshContext = await browser.newContext({
      baseURL: "http://127.0.0.1:4173",
      locale: "en-US",
    });
    try {
      const secondPage = await freshContext.newPage();
      await secondPage.goto("/");
      await secondPage
        .getByRole("button", { name: "Sign in", exact: true })
        .click();
      await secondPage
        .getByRole("button", { name: "Sign in with local test account" })
        .click();
      await expect(secondPage.getByRole("dialog")).toContainText(
        "qa@playnext.test",
      );
      await secondPage.getByRole("button", { name: "Close account" }).click();
      await secondPage.getByRole("link", { name: /My collection/ }).click();
      await expect(
        secondPage.getByRole("heading", { name: chosenName, exact: true }),
      ).toBeVisible();
    } finally {
      await freshContext.close();
    }
    const keys = await page.evaluate(() => [
      ...Object.keys(localStorage),
      ...Object.keys(sessionStorage),
    ]);
    expect(keys.some((key) => /auth-token|rawg/i.test(key))).toBe(false);
    await page.getByRole("button", { name: "My account", exact: true }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText(
      "Sign in with local test account",
    );
    await page.getByRole("button", { name: "Close account" }).click();
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();
  });
});
