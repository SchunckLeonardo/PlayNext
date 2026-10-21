import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { localStatus, fixture, publicClient } from "../../scripts/local.mjs";
import { emptyState } from "../../src/lib/account";
import type { AccountState } from "../../src/lib/types";

test.describe("public reviews in isolated local Supabase", () => {
  let client: SupabaseClient, admin: SupabaseClient, userId: string;
  let original: AccountState | null = null;
  let originalReviews: Record<string, unknown>[] = [];
  test.beforeAll(async () => {
    const status = await localStatus();
    client = publicClient(status);
    const signed = await client.auth.signInWithPassword(await fixture());
    expect(signed.error).toBeNull();
    userId = signed.data.user!.id;
    admin = createClient(
      status.API_URL,
      status.SECRET_KEY || status.SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const loaded = await client.rpc("playnext_load");
    expect(loaded.error).toBeNull();
    original = loaded.data.data;
    const reset = await client.rpc("playnext_save", {
      p_state: emptyState(),
      p_revision: loaded.data.revision,
    });
    expect(reset.error).toBeNull();
    const previous = await client
      .from("playnext_reviews")
      .select("*")
      .eq("user_id", userId);
    expect(previous.error).toBeNull();
    originalReviews = previous.data || [];
    const removed = await client
      .from("playnext_reviews")
      .delete()
      .eq("user_id", userId);
    expect(removed.error).toBeNull();
  });
  test.afterAll(async () => {
    if (!client) return;
    const current = await client.rpc("playnext_load");
    const saved = await client.rpc("playnext_save", {
      p_state: original || emptyState(),
      p_revision: current.data.revision,
    });
    expect(saved.error).toBeNull();
    const removed = await client
      .from("playnext_reviews")
      .delete()
      .eq("user_id", userId);
    expect(removed.error).toBeNull();
    if (originalReviews.length)
      expect(
        (await admin.from("playnext_reviews").insert(originalReviews)).error,
      ).toBeNull();
    await client.auth.signOut({ scope: "local" });
  });

  test("a wanted game becomes completed; its author publishes, shares anonymously, edits and deletes a review", async ({
    page,
    browser,
    context,
  }) => {
    test.setTimeout(60000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByRole("button", { name: "Sign in with local test account" })
      .click();
    await expect(page.getByRole("dialog")).toContainText("qa@playnext.test");
    await page.getByRole("button", { name: "Close account" }).click();
    const name = await page.locator(".game-title").innerText();
    await page
      .getByRole("button", { name: "I want to play this game" })
      .click();
    await expect(page.locator(".nav-count")).toHaveText("1");
    await page.getByRole("link", { name: /My collection/ }).click();
    await page
      .getByLabel(`Change choice for ${name}`)
      .selectOption("completed");
    await expect(page.locator(".collection-status")).toHaveText("Completed");
    await page.reload();
    await expect(page.getByLabel(`Change choice for ${name}`)).toHaveValue(
      "completed",
    );
    await page
      .getByRole("button", { name: `Review ${name}`, exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(
      "Reviews, ratings and display names are public",
    );
    await dialog
      .getByLabel("Public display name", { exact: true })
      .fill("PlayNext local QA");
    await dialog.getByLabel("Your rating", { exact: true }).selectOption("5");
    const body =
      'Local QA review: exploration rewards curiosity. <script>alert("test")</script> is plain text.';
    await dialog.getByLabel("Your review", { exact: true }).fill(body);
    for (const [width, height] of [
      [320, 900],
      [390, 844],
      [844, 390],
      [1440, 1000],
    ]) {
      await page.setViewportSize({ width, height });
      await expect
        .poll(() =>
          page.evaluate(() =>
            [
              document.documentElement,
              ...document.querySelectorAll<HTMLElement>(
                ".details-body,.review-editor,.public-review",
              ),
            ].every(
              (element) => element.scrollWidth <= element.clientWidth + 1,
            ),
          ),
        )
        .toBe(true);
      if (width === 390 || width === 1440)
        await page.screenshot({
          path: `reports/public-review-editor-${width}.png`,
        });
    }
    let failPublish = true;
    await page.route("**/rest/v1/playnext_reviews*", async (route) => {
      if (failPublish && route.request().method() === "POST") {
        failPublish = false;
        await route.fulfill({
          status: 503,
          json: { message: "Synthetic publication outage" },
        });
      } else await route.continue();
    });
    await dialog
      .getByRole("button", { name: "Publish review", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText(
      "Your draft is still here",
    );
    await expect(dialog.getByLabel("Your review", { exact: true })).toHaveValue(
      body,
    );
    await dialog
      .getByRole("button", { name: "Publish review", exact: true })
      .click();
    await expect(
      dialog.getByText("Your review is public. Share its link with anyone.", {
        exact: true,
      }),
    ).toBeVisible();
    const review = dialog.locator(".public-review");
    await expect(review.locator(".review-body")).toHaveText(body);
    await expect(review.locator(".review-body script")).toHaveCount(0);
    await review.getByRole("button", { name: "Copy review link" }).click();
    await expect(
      review.getByRole("button", { name: "Link copied" }),
    ).toBeVisible();
    const shareUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(shareUrl).toMatch(
      /^http:\/\/127\.0\.0\.1:4173\/reviews\/[0-9a-f-]{36}$/,
    );
    const anonymous = await browser.newContext({
      baseURL: "http://127.0.0.1:4173",
      locale: "en-US",
      viewport: { width: 390, height: 844 },
    });
    try {
      const shared = await anonymous.newPage();
      await shared.goto(shareUrl);
      await expect(
        shared.getByRole("heading", { name, exact: true }),
      ).toBeVisible();
      await expect(shared.locator(".review-body")).toHaveText(body);
      await expect(
        shared.getByText("PlayNext local QA", { exact: true }),
      ).toBeVisible();
      await expect(shared.getByLabel("Rated 5 out of 5")).toBeVisible();
      await expect(shared.locator("body")).not.toContainText(
        "qa@playnext.test",
      );
      await expect(
        shared.getByRole("button", { name: "Edit your review" }),
      ).toHaveCount(0);
      await shared
        .getByRole("combobox", { name: "Language" })
        .selectOption("pt-BR");
      await expect(
        shared.getByText("Compartilhada no PlayNext", { exact: true }),
      ).toBeVisible();
      await expect(
        shared.getByRole("button", { name: "Copiar link da avaliação" }),
      ).toBeVisible();
      await expect
        .poll(() =>
          shared.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      await shared.screenshot({
        path: "reports/public-review-shared-390.png",
        fullPage: true,
      });
      await dialog.getByText("Edit your review", { exact: true }).click();
      await dialog
        .getByLabel("Your review", { exact: true })
        .fill("Updated local QA review: a rewarding adventure.");
      await dialog.getByLabel("Your rating", { exact: true }).selectOption("4");
      await dialog.getByRole("button", { name: "Save public changes" }).click();
      await expect(review.locator(".review-body")).toHaveText(
        "Updated local QA review: a rewarding adventure.",
      );
      await shared.reload();
      await expect(shared.locator(".review-body")).toHaveText(
        "Updated local QA review: a rewarding adventure.",
      );
      await expect(shared.getByLabel("Nota 4 de 5")).toBeVisible();
      await dialog.getByText("Edit your review", { exact: true }).click();
      page.once("dialog", (confirmation) => confirmation.accept());
      await dialog
        .getByRole("button", { name: "Delete review", exact: true })
        .click();
      await expect(
        dialog.getByText("Public review deleted.", { exact: true }),
      ).toBeVisible();
      await shared.reload();
      await expect(
        shared.getByRole("heading", {
          name: "Esta avaliação não está mais disponível.",
        }),
      ).toBeVisible();
    } finally {
      await anonymous.close();
    }
  });

  test("a played game can receive a review without being marked completed", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByRole("button", { name: "Sign in with local test account" })
      .click();
    await expect(page.getByRole("dialog")).toContainText("qa@playnext.test");
    await page.getByRole("button", { name: "Close account" }).click();
    const name = await page.locator(".game-title").innerText();
    await page.getByRole("button", { name: "I’ve played this game" }).click();
    await expect(page.locator(".nav-count")).toHaveText("2");
    await page.getByRole("link", { name: /My collection/ }).click();
    await expect(page.getByLabel(`Change choice for ${name}`)).toHaveValue(
      "played",
    );
    await page
      .getByRole("button", { name: `Review ${name}`, exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Public display name", { exact: true })
      .fill("PlayNext local QA");
    await dialog.getByLabel("Your rating", { exact: true }).selectOption("3");
    await dialog
      .getByLabel("Your review", { exact: true })
      .fill("Local QA: played, with a public review and no completion claim.");
    await dialog
      .getByRole("button", { name: "Publish review", exact: true })
      .click();
    await expect(dialog.locator(".public-review .review-body")).toHaveText(
      "Local QA: played, with a public review and no completion claim.",
    );
    await expect(dialog.getByLabel("My choice")).toHaveValue("played");
  });

  test("review read failures can retry and malformed shared links have a clear empty state", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: "View details", exact: true })
      .click();
    await page.route("**/rest/v1/playnext_reviews*", (route) =>
      route.fulfill({
        status: 400,
        json: { message: "Synthetic read outage" },
      }),
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Player reviews", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "temporarily unavailable",
    );
    await page.unroute("**/rest/v1/playnext_reviews*");
    await page.getByRole("button", { name: "Retry reviews" }).click();
    await expect(page.getByRole("dialog")).toContainText(
      "No public reviews yet",
    );
    await page.goto("/reviews/invalid-review-id");
    await expect(
      page.getByRole("heading", {
        name: "This review is no longer available.",
      }),
    ).toBeVisible();
  });
});
