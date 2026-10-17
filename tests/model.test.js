import test from 'node:test';
import assert from 'node:assert/strict';
import { PLATFORMS, GENRES, HISTORY_KEY, FILTERS_KEY, shuffle, matchesFilters, unseenGames, decide, readHistory, readFilters, normalizeGame, safeImage } from '../dist/model.js';
import { DEMO_GAMES } from '../dist/demo.js';

const game = { id: 1, slug: 'a-game', name: 'A game', platforms: ['pc', 'playstation5'], genres: ['action'] };
const storage = value => ({ getItem: () => value });

test('all ten unique platforms requested, DS and NDS share one choice', () => {
  assert.equal(PLATFORMS.length, 10);
  assert.equal(new Set(PLATFORMS.map(p => p.slug)).size, 10);
  assert.equal(PLATFORMS.find(p => p.slug === 'nintendo-ds').label, 'DS / NDS');
});
test('general filter matches every game; multi-platform uses OR and genre uses AND', () => {
  assert.equal(matchesFilters(game), true);
  assert.equal(matchesFilters(game, ['pc', 'nintendo-switch'], 'action'), true);
  assert.equal(matchesFilters(game, ['nintendo-switch'], 'action'), false);
  assert.equal(matchesFilters(game, ['pc'], 'puzzle'), false);
});
test('every decision excludes a game from future suggestions, and incoming duplicates are removed', () => {
  const history = [1, 2, 3].map((id, i) => ({ game: { ...game, id }, status: ['yes', 'no', 'played'][i] }));
  assert.deepEqual(unseenGames([game, { ...game, id: 2 }, { ...game, id: 3 }, { ...game, id: 4 }, { ...game, id: 4 }], history).map(g => g.id), [4]);
});
test('changing a decision moves a game, preserving one record and immutable previous state for undo', () => {
  const before = decide([], game, 'yes', '2026-10-17');
  const after = decide(before, game, 'played', '2026-10-18');
  assert.equal(before[0].status, 'yes');
  assert.equal(after.length, 1);
  assert.equal(after[0].status, 'played');
  assert.throws(() => decide(before, game, 'unknown'));
});
test('history survives serialization and recovers from malformed storage', () => {
  const history = decide([], game, 'no');
  assert.deepEqual(readHistory(storage(JSON.stringify(history))), history);
  assert.deepEqual(readHistory(storage('{broken')), []);
  assert.deepEqual(readHistory(storage('{}')), []);
  assert.deepEqual(readHistory(storage('[null,{}, {"status":"yes"}]')), []);
  assert.deepEqual(readHistory({ getItem() { throw Error('blocked'); } }), []);
  assert.equal(HISTORY_KEY, 'playnext.history.v1');
});
test('saved platform preferences reject unsupported platforms', () => {
  assert.deepEqual(readFilters(storage('{"platforms":["pc","made-up"],"genre":"action"}')), { platforms: ['pc'], genre: 'action' });
  assert.deepEqual(readFilters(storage(null)), { platforms: [], genre: '' });
  assert.ok(FILTERS_KEY);
});
test('shuffle keeps all items, leaves original unchanged and uses supplied randomness', () => {
  const list = [1, 2, 3, 4];
  const shuffled = shuffle(list, () => 0);
  assert.deepEqual(list, [1, 2, 3, 4]);
  assert.deepEqual(shuffled.toSorted(), list);
  assert.notDeepEqual(shuffled, list);
});
test('API game normalization handles missing fields and rejects invalid identity and images', () => {
  assert.equal(normalizeGame({ name: 'missing id' }), null);
  const raw = normalizeGame({ id: 4, slug: 'test', name: '<script>text</script>', platforms: [{ platform: { slug: 'pc' } }], genres: [{ slug: 'action' }], background_image: 'javascript:alert(1)' });
  assert.equal(raw.name, '<script>text</script>');
  assert.deepEqual(raw.platforms, ['pc']);
  assert.equal(raw.image, '');
  assert.equal(raw.rating, null);
  assert.equal(safeImage('http://insecure.example/image.jpg'), '');
  assert.equal(safeImage('https://media.rawg.io/image.jpg'), 'https://media.rawg.io/image.jpg');
  assert.ok(GENRES.some(g => g.slug === 'role-playing-games-rpg'));
  const malformed = normalizeGame({ id: 5, name: 'Malformed', slug: 'malformed', genres: {}, platforms: {}, released: 2020, rating: NaN });
  assert.deepEqual(malformed.genres, []);
  assert.equal(malformed.released, null);
  assert.equal(malformed.rating, null);
});
test('demo has verified identities, images, supported genre slugs and coverage of every requested platform', () => {
  assert.equal(DEMO_GAMES.length, 12);
  assert.equal(new Set(DEMO_GAMES.map(g => g.id)).size, 12);
  assert.ok(DEMO_GAMES.every(g => g.image.startsWith('https://media.rawg.io/') && g.genres.every(slug => GENRES.some(known => known.slug === slug))));
  assert.ok(PLATFORMS.every(p => DEMO_GAMES.some(g => g.platforms.includes(p.slug))));
});
