import { test, expect, type Page } from "@playwright/test";
import { emptySnapshot } from "../../src/lib/prices";
import type { Country } from "../../src/lib/types";

async function priceFixture(page: Page, available = true) {
  await page.route("**/api/prices?**", async (route) => {
    const country = new URL(route.request().url()).searchParams.get(
      "country",
    ) as Country;
    const snapshot = emptySnapshot(
      country,
      available ? "available" : "not-found",
    );
    if (available) {
      snapshot.found = true;
      snapshot.bestStore = "steam";
      snapshot.stores.steam = {
        amount: country === "BR" ? 149.9 : 49.99,
        regular: country === "BR" ? 299.9 : 59.99,
        cut: 20,
        currency: snapshot.currency,
        url: "https://store.steampowered.com/app/1245620/",
      };
    }
    await route.fulfill({ json: snapshot });
  });
}

test("language and currency are independent, synchronize with details, and survive reload without storing account data", async ({
  page,
}) => {
  await priceFixture(page);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Steam: $49.99" })).toBeVisible();
  const name = await page.locator(".game-title").innerText();
  await page.getByRole("combobox", { name: "Language" }).selectOption("pt-BR");
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  await expect(
    page.getByRole("heading", { name: /Menos busca/ }),
  ).toBeVisible();
  await expect(page.locator(".game-title")).toHaveText(name);
  await expect(page.getByRole("combobox", { name: "Moeda" })).toHaveValue("US");
  await expect(
    page.getByRole("link", { name: /Steam: US\$.*49,99/ }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Moeda" }).selectOption("BR");
  await expect(
    page.getByRole("link", { name: /Steam: R\$.*149,90/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ver detalhes", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("combobox", { name: "Moeda" })).toHaveValue(
    "BR",
  );
  await expect(dialog).toContainText("Menor preço atual");
  await expect(dialog).toContainText("Sem oferta ao vivo");
  await expect(dialog).toContainText("Brasil");
  await expect(dialog).not.toContainText("Menor preço histórico");
  await dialog.getByRole("combobox", { name: "Moeda" }).selectOption("US");
  await expect(
    dialog.getByRole("link", { name: /Steam: US\$.*49,99/ }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Fechar Detalhes de Elden Ring" })
    .click();
  await expect(page.getByRole("combobox", { name: "Moeda" })).toHaveValue("US");
  await page.screenshot({
    path: "reports/preferences-discovery-portuguese.png",
  });
  await page.getByRole("button", { name: "Quero jogar este jogo" }).click();
  await expect(page.locator(".nav-count")).toHaveText("1");
  await page.getByRole("combobox", { name: "Idioma" }).selectOption("en");
  await expect(page.locator(".nav-count")).toHaveText("1");
  await page.getByRole("link", { name: /My collection/ }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Language" }).selectOption("pt-BR");
  await expect(page.getByLabel(`Alterar escolha para ${name}`)).toHaveValue(
    "yes",
  );
  await page.getByRole("link", { name: "Descobrir", exact: true }).click();
  await page.getByRole("combobox", { name: "Moeda" }).selectOption("BR");
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("playnext.preferences.v1") || "{}"),
  );
  expect(stored).toEqual({ locale: "pt-BR", country: "BR" });
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Idioma" })).toHaveValue(
    "pt-BR",
  );
  await expect(page.getByRole("combobox", { name: "Moeda" })).toHaveValue("BR");
  await expect(
    page.getByRole("button", { name: "Conectar RAWG", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Sua coleção vai com você",
    { ignoreCase: true },
  );
  await page.getByRole("button", { name: "Fechar conta", exact: true }).click();
  await page
    .getByRole("button", { name: "Como obter uma chave", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Sua chave RAWG, passo a passo",
  );
});

for (const [width, height] of [
  [320, 900],
  [375, 812],
  [390, 844],
  [844, 390],
  [1440, 1000],
]) {
  test(`empty price offers and translated details fit a ${width}px viewport`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await priceFixture(page, false);
    await page.goto("/");
    await page
      .getByRole("combobox", { name: "Language" })
      .selectOption("pt-BR");
    await expect(page.locator(".game-title")).toBeVisible();
    await page
      .getByRole("button", { name: "Ver detalhes", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Comparar lojas de PC" }),
    ).toBeVisible();
    await expect(dialog.getByRole("combobox", { name: "Moeda" })).toBeVisible();
    await expect(
      dialog.getByText("Sem oferta ao vivo", { exact: true }),
    ).toHaveCount(3);
    await expect(dialog).toContainText("Nenhuma oferta verificada");
    await expect
      .poll(() =>
        page.evaluate(() => {
          const elements = [
            document.documentElement,
            ...document.querySelectorAll<HTMLElement>(
              ".details-stores,.details-store-card,.topbar",
            ),
          ];
          return elements.every(
            (element) => element.scrollWidth <= element.clientWidth + 1,
          );
        }),
      )
      .toBe(true);
    const priceSection = await dialog.locator(".details-stores").boundingBox();
    const selector = await dialog
      .getByRole("combobox", { name: "Moeda" })
      .boundingBox();
    expect(selector!.x).toBeGreaterThanOrEqual(priceSection!.x);
    expect(selector!.x + selector!.width).toBeLessThanOrEqual(
      priceSection!.x + priceSection!.width + 1,
    );
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: `reports/preferences-details-${width}.png`,
        fullPage: false,
      });
  });
}

test("a delayed regional response never exposes the previous currency's offer", async ({
  page,
}) => {
  await page.route("**/api/prices?**", async (route) => {
    const country = new URL(route.request().url()).searchParams.get(
      "country",
    ) as Country;
    if (country === "BR")
      await new Promise((resolve) => setTimeout(resolve, 500));
    const snapshot = emptySnapshot(country, "available");
    snapshot.found = true;
    snapshot.bestStore = "steam";
    snapshot.stores.steam = {
      amount: country === "BR" ? 149.9 : 49.99,
      regular: 299.9,
      cut: 0,
      currency: snapshot.currency,
      url: "https://store.steampowered.com/app/1245620/",
    };
    await route.fulfill({ json: snapshot });
  });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Steam: $49.99" })).toBeVisible();
  await page.getByRole("combobox", { name: "Currency" }).selectOption("BR");
  await expect(page.getByRole("link", { name: "Steam: $49.99" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("link", { name: /Steam: R\$.*149\.90/ }),
  ).toBeVisible();
});
