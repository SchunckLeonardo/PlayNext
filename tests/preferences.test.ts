import test from "node:test";
import assert from "node:assert/strict";
import { readPreferences } from "../src/lib/preferences";
import { PORTUGUESE, translate } from "../src/lib/messages";
import { formatPrice } from "../src/lib/prices";

test("preferences validate saved values and retain only locale and region", () => {
  assert.deepEqual(readPreferences(null, "pt-BR"), {
    locale: "en",
    country: "BR",
  });
  assert.deepEqual(readPreferences("broken", "en-US"), {
    locale: "en",
    country: "US",
  });
  assert.deepEqual(readPreferences('{"locale":"fr","country":"XX"}'), {
    locale: "en",
    country: "US",
  });
  assert.deepEqual(
    readPreferences(
      '{"locale":"pt-BR","country":"US","rawg_key":"synthetic-secret","history":[1]}',
    ),
    { locale: "pt-BR", country: "US" },
  );
  assert.deepEqual(readPreferences("null"), { locale: "en", country: "US" });
});

test("translations preserve interpolation, names and original third-party content", () => {
  assert.equal(
    translate("pt-BR", "View details for {name}", { name: "Metro 2033" }),
    "Ver detalhes de Metro 2033",
  );
  assert.equal(
    translate("en", "Demo · {count} games to explore", { count: 12 }),
    "Demo · 12 games to explore",
  );
  assert.equal(
    translate("pt-BR", "A description provided by RAWG."),
    "A description provided by RAWG.",
  );
  for (const [english, portuguese] of Object.entries(PORTUGUESE)) {
    const placeholders = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    assert.deepEqual(
      placeholders(portuguese),
      placeholders(english),
      `Placeholders changed for ${english}`,
    );
    assert.ok(portuguese.trim(), `Empty translation for ${english}`);
  }
});

test("money formatting follows the selected language independently from currency", () => {
  assert.match(formatPrice(149.9, "BRL", "en"), /149\.90/);
  assert.match(formatPrice(149.9, "BRL", "pt-BR"), /149,90/);
  assert.match(formatPrice(49.99, "USD", "pt-BR"), /US\$.*49,99/);
  assert.equal(formatPrice(0, "USD", "pt-BR"), "Grátis");
  assert.equal(formatPrice(0, "BRL", "en"), "Free");
});
