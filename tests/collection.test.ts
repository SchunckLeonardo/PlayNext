import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_GAMES } from "../src/lib/demo";
import {
  choiceStatus,
  decide,
  rouletteCandidates,
  pickCollectionGame,
  unseenGames,
} from "../src/lib/model";
import { cleanState, emptyState } from "../src/lib/account";

test("completion moves a wanted game to played without changing the encrypted v1 document contract", () => {
  const original = decide([], DEMO_GAMES[0], "yes");
  const completed = decide(original, DEMO_GAMES[0], "completed");
  assert.equal(original[0].status, "yes");
  assert.equal(completed.length, 1);
  assert.equal(completed[0].status, "played");
  assert.equal(choiceStatus(completed[0]), "completed");
  assert.equal(unseenGames([DEMO_GAMES[0]], completed).length, 0);
  assert.deepEqual(
    cleanState({ ...emptyState(), history: completed }).history,
    completed,
  );
  assert.equal(choiceStatus(decide(completed, DEMO_GAMES[0], "yes")[0]), "yes");
  assert.equal(
    decide(completed, DEMO_GAMES[0], "played")[0].completed,
    undefined,
  );
});
test("old collections remain valid and untrusted completion markers are ignored", () => {
  const played = decide([], DEMO_GAMES[0], "played");
  assert.deepEqual(
    cleanState({ ...emptyState(), history: played }).history,
    played,
  );
  const malformed = cleanState({
    ...emptyState(),
    history: [
      { ...played[0], completed: "true" },
      { ...decide([], DEMO_GAMES[1], "yes")[0], completed: true },
    ],
  });
  assert.ok(malformed.history.every((entry) => entry.completed === undefined));
  assert.throws(() => decide([], DEMO_GAMES[0], "constructor" as never));
});
test("roulette uses only unique wanted games, respects platform/genre, and never changes choices", () => {
  let history = decide([], DEMO_GAMES[0], "yes");
  history = decide(history, DEMO_GAMES[1], "played");
  history = decide(history, DEMO_GAMES[2], "completed");
  history = decide(history, DEMO_GAMES[3], "no");
  history = decide(history, DEMO_GAMES[5], "yes");
  const before = structuredClone(history);
  assert.equal(rouletteCandidates([...history, history[0]]).length, 2);
  assert.deepEqual(
    rouletteCandidates(history, ["pc"], "puzzle").map((game) => game.id),
    [DEMO_GAMES[5].id],
  );
  assert.equal(rouletteCandidates(history, ["playstation1"]).length, 0);
  assert.deepEqual(history, before);
});
test("roulette handles zero/one candidates and excludes the previous winner when alternatives exist", () => {
  assert.equal(pickCollectionGame([]), null);
  assert.equal(
    pickCollectionGame([DEMO_GAMES[0]], DEMO_GAMES[0].id)?.id,
    DEMO_GAMES[0].id,
  );
  const games = DEMO_GAMES.slice(0, 3);
  assert.equal(
    pickCollectionGame(games, games[0].id, () => 0)?.id,
    games[1].id,
  );
  assert.equal(
    pickCollectionGame(games, games[0].id, () => 0.999)?.id,
    games[2].id,
  );
});
