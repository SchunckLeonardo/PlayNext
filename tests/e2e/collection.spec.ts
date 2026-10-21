import { test, expect } from "@playwright/test";

test("collection roulette chooses only wanted games, filters them, avoids repeats and excludes completed games", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("link", { name: /My collection/ }).click();
  await expect(
    page.getByRole("button", { name: "Spin my collection" }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Discover", exact: true }).click();
  for (let i = 0; i < 2; i++) {
    await page
      .getByRole("button", { name: "I want to play this game" })
      .click();
    await expect(page.locator(".nav-count")).toHaveText(String(i + 1));
  }
  await page.getByRole("button", { name: "I’ve played this game" }).click();
  await expect(page.locator(".nav-count")).toHaveText("3");
  await page
    .getByRole("button", { name: "Not interested in this game" })
    .click();
  await expect(page.locator(".nav-count")).toHaveText("4");
  await page.getByRole("link", { name: /My collection/ }).click();
  const roulette = page.locator(".collection-roulette");
  await expect(roulette).toContainText("2 games ready to play");
  await page.getByRole("button", { name: "Spin my collection" }).click();
  await expect(page.getByRole("button", { name: "Spin again" })).toBeEnabled();
  const first = await roulette.locator("h3").innerText();
  expect(["Elden Ring", "Hollow Knight"]).toContain(first);
  await page.getByRole("button", { name: "Spin again" }).click();
  await expect(roulette.locator("h3")).not.toHaveText(first);
  await expect(page.locator(".nav-count")).toHaveText("4");
  await page
    .getByLabel("Roulette genre")
    .selectOption("role-playing-games-rpg");
  await page.getByRole("button", { name: "Spin my collection" }).click();
  await expect(roulette.locator("h3")).toHaveText("Elden Ring");
  await page.getByLabel("Roulette platform").selectOption("playstation1");
  await expect(
    page.getByRole("button", { name: "Spin my collection" }),
  ).toBeDisabled();
  await expect(roulette.locator("h3")).toHaveCount(0);
  await page.getByLabel("Roulette platform").selectOption("");
  await page.getByLabel("Roulette genre").selectOption("");
  await page
    .getByLabel("Change choice for Elden Ring")
    .selectOption("completed");
  await expect(roulette).toContainText("1 game ready to play");
  await page.getByRole("button", { name: "Spin my collection" }).click();
  await expect(roulette.locator("h3")).toHaveText("Hollow Knight");
  await page.getByRole("button", { name: /^Completed 1$/ }).click();
  await expect(page.locator(".collection-card h3")).toHaveText("Elden Ring");
  await expect(
    page.getByRole("button", { name: "Review Elden Ring", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^All games 4$/ }).click();
  await page
    .getByRole("button", { name: "Remove Hollow Knight from your collection" })
    .click();
  await expect(roulette).toContainText("0 games ready to play");
  await expect(roulette.locator("h3")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Spin my collection" }),
  ).toBeDisabled();
});

test("roulette provides normal-motion feedback and Portuguese layouts fit desktop and narrow phones", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "I want to play this game" }).click();
  await expect(page.locator(".nav-count")).toHaveText("1");
  await page.getByRole("link", { name: /My collection/ }).click();
  await page.getByRole("button", { name: "Spin my collection" }).click();
  await expect(page.getByRole("button", { name: "Choosing…" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Spin again" })).toBeEnabled();
  await page.getByRole("combobox", { name: "Language" }).selectOption("pt-BR");
  await expect(
    page.getByRole("heading", { name: "O que vamos jogar hoje?" }),
  ).toBeVisible();
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
              ".collection-roulette,.collection-tabs,.collection-card",
            ),
          ].every((element) => element.scrollWidth <= element.clientWidth + 1),
        ),
      )
      .toBe(true);
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: `reports/roulette-${width}.png`,
        fullPage: true,
      });
  }
  await page.getByRole("button", { name: "Ver detalhes", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Marcar como zerado" }).click();
  await expect(dialog.getByLabel("Minha escolha")).toHaveValue("completed");
  await dialog
    .getByRole("button", { name: "Avaliações dos jogadores", exact: true })
    .click();
  await expect(dialog).toContainText(
    "Avaliações, notas e nomes de exibição são públicos",
  );
  await expect(
    dialog.getByRole("button", { name: "Entrar", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Publicar avaliação" }),
  ).toHaveCount(0);
});
