import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { assertLoopback } from "../local/config.mjs";
import { DEMO_GAMES } from "../src/lib/demo.ts";
import {
  PUBLIC_REVIEW_COLUMNS,
  deleteReview,
  loadOwnReview,
  loadSharedReview,
  publishReview,
} from "../src/lib/reviews.ts";

export async function testPublicReviews(status) {
  const url = assertLoopback(status.API_URL, 54321);
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const key = status.PUBLISHABLE_KEY || status.ANON_KEY;
  const admin = createClient(
    url,
    status.SECRET_KEY || status.SERVICE_ROLE_KEY,
    options,
  );
  const anonymous = createClient(url, key, options);
  const users = [];
  const clients = [];
  try {
    for (let i = 0; i < 2; i++) {
      const credentials = {
        email: `review-fixture-${randomUUID()}@playnext.test`,
        password: randomBytes(24).toString("base64url"),
      };
      const created = await admin.auth.admin.createUser({
        ...credentials,
        email_confirm: true,
      });
      assert.equal(created.error, null);
      users.push(created.data.user.id);
      const client = createClient(url, key, options);
      assert.equal(
        (await client.auth.signInWithPassword(credentials)).error,
        null,
      );
      clients.push(client);
    }
    const game = DEMO_GAMES[0];
    const draft = {
      author_name: "Synthetic review tester",
      rating: 4,
      body: "<script>synthetic text only</script>\nA real local database round trip.",
    };
    const owner = clients[0],
      other = clients[1];
    const saved = await publishReview(owner, users[0], game, draft);
    const publicRow = await loadSharedReview(anonymous, saved.id);
    assert.equal(
      publicRow.body,
      draft.body,
      "Visitors can read a shared review without signing in.",
    );
    assert.deepEqual(
      Object.keys(publicRow).sort(),
      PUBLIC_REVIEW_COLUMNS.split(",").sort(),
    );
    assert.ok(
      (
        await anonymous
          .from("playnext_reviews")
          .select("user_id")
          .eq("id", saved.id)
      ).error,
      "Anonymous readers cannot select account IDs.",
    );
    assert.ok(
      (
        await anonymous
          .from("playnext_reviews")
          .insert({ user_id: users[0], game_id: game.id })
      ).error,
      "Anonymous publication is denied.",
    );
    assert.ok(
      (
        await other
          .from("playnext_reviews")
          .insert({
            user_id: users[0],
            game_id: DEMO_GAMES[1].id,
            game_slug: "other",
            game_name: "Other",
            ...draft,
          })
      ).error,
      "A second account cannot impersonate the owner.",
    );
    const foreignUpdate = await other
      .from("playnext_reviews")
      .update({ body: "Tampered" })
      .eq("id", saved.id)
      .select("id");
    assert.equal(foreignUpdate.error, null);
    assert.equal(
      foreignUpdate.data.length,
      0,
      "A second account cannot edit another review.",
    );
    const foreignDelete = await other
      .from("playnext_reviews")
      .delete()
      .eq("id", saved.id)
      .select("id");
    assert.equal(foreignDelete.error, null);
    assert.equal(
      foreignDelete.data.length,
      0,
      "A second account cannot delete another review.",
    );
    assert.ok(
      (
        await owner
          .from("playnext_reviews")
          .update({ user_id: users[1] })
          .eq("id", saved.id)
      ).error,
      "Ownership cannot be reassigned.",
    );
    assert.ok(
      (
        await owner
          .from("playnext_reviews")
          .update({ game_id: DEMO_GAMES[1].id })
          .eq("id", saved.id)
      ).error,
      "A published review cannot be moved to another game.",
    );
    for (const patch of [
      { rating: 0 },
      { rating: 6 },
      { body: " " },
      { body: "a".repeat(3001) },
      { author_name: " " },
    ])
      assert.ok(
        (await owner.from("playnext_reviews").update(patch).eq("id", saved.id))
          .error,
        "Database validates review boundaries.",
      );
    assert.ok(
      (
        await owner
          .from("playnext_reviews")
          .insert({
            user_id: users[0],
            game_id: game.id,
            game_slug: game.slug,
            game_name: game.name,
            ...draft,
          })
      ).error,
      "One review per account/game.",
    );
    const updated = await publishReview(
      owner,
      users[0],
      game,
      { ...draft, body: "Edited public review.", rating: 5 },
      saved.id,
    );
    assert.equal(updated.id, saved.id);
    assert.equal(updated.rating, 5);
    assert.equal(
      (await loadOwnReview(owner, users[0], game.id)).body,
      "Edited public review.",
    );
    assert.equal(
      (await loadSharedReview(anonymous, saved.id)).body,
      "Edited public review.",
    );
    await deleteReview(owner, users[0], saved.id);
    assert.equal(
      await loadSharedReview(anonymous, saved.id),
      null,
      "Deleted reviews disappear from shared links.",
    );
    const cascade = await publishReview(other, users[1], game, draft);
    assert.equal((await admin.auth.admin.deleteUser(users[1])).error, null);
    users.pop();
    assert.equal(
      await loadSharedReview(anonymous, cascade.id),
      null,
      "Account deletion removes public reviews.",
    );
    console.log(
      "PASS: public review read/share, owner-only publish/edit/delete, anonymous identity privacy, validation, uniqueness and account-deletion cascade in isolated Supabase.",
    );
  } finally {
    for (const client of clients) await client.auth.signOut({ scope: "local" });
    for (const id of users)
      assert.equal((await admin.auth.admin.deleteUser(id)).error, null);
  }
}
