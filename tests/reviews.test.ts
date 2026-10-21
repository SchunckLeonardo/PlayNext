import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeReview,
  validReviewDraft,
  isReviewId,
  PUBLIC_REVIEW_COLUMNS,
} from "../src/lib/reviews";

const review = {
  id: "00000000-0000-4000-8000-000000000001",
  game_id: 1,
  game_slug: "a-game",
  game_name: "A game",
  game_image: "https://media.rawg.io/test.jpg",
  author_name: "Player",
  rating: 5,
  body: "A thoughtful review.",
  created_at: "2026-10-21T12:00:00.000Z",
  updated_at: "2026-10-21T12:00:00.000Z",
};
test("public review normalization keeps only shareable fields and treats user content as text", () => {
  const body = '<script>alert("test")</script>\nStill plain text.';
  const normalized = normalizeReview({
    ...review,
    body,
    user_id: "private-id",
    email: "private@example.invalid",
    rawg_key: "synthetic-private",
  });
  assert.deepEqual(normalized, { ...review, body });
  assert.ok(!/user_id|email|rawg_key/.test(PUBLIC_REVIEW_COLUMNS));
  assert.equal(
    normalizeReview({ ...review, game_image: "javascript:alert(1)" })
      ?.game_image,
    "",
  );
  assert.equal(
    normalizeReview({
      ...review,
      game_image: "https://tracker.example/pixel.jpg",
    })?.game_image,
    "",
  );
});
test("public review boundaries reject malformed IDs, ratings, timestamps and excessive content", () => {
  for (const patch of [
    { id: "../private" },
    { game_id: -1 },
    { game_slug: "<script>" },
    { game_name: " " },
    { rating: "5" },
    { rating: 0 },
    { rating: 6 },
    { rating: 2.5 },
    { body: " " },
    { body: "a".repeat(3001) },
    { author_name: "a".repeat(61) },
    { created_at: "bad" },
    { updated_at: null },
  ])
    assert.equal(normalizeReview({ ...review, ...patch }), null);
  assert.equal(isReviewId(review.id), true);
  assert.equal(isReviewId("foo?key=secret"), false);
});
test("a public draft needs an intentional name, a 1–5 rating and a nonempty bounded review", () => {
  assert.equal(
    validReviewDraft({ author_name: " Player ", rating: 1, body: " Great. " }),
    true,
  );
  assert.equal(
    validReviewDraft({
      author_name: "Player",
      rating: 5,
      body: "a".repeat(3000),
    }),
    true,
  );
  for (const patch of [
    { author_name: " " },
    { rating: NaN },
    { rating: 1.5 },
    { body: "\n " },
  ])
    assert.equal(
      validReviewDraft({
        author_name: "Player",
        rating: 4,
        body: "Good game.",
        ...patch,
      }),
      false,
    );
});
