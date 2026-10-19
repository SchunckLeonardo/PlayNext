export const PLATFORMS = [
  { slug: 'pc', label: 'PC', family: 'PC' },
  { slug: 'playstation1', label: 'PS1', family: 'PlayStation' },
  { slug: 'playstation2', label: 'PS2', family: 'PlayStation' },
  { slug: 'playstation3', label: 'PS3', family: 'PlayStation' },
  { slug: 'playstation4', label: 'PS4', family: 'PlayStation' },
  { slug: 'playstation5', label: 'PS5', family: 'PlayStation' },
  { slug: 'nintendo-ds', label: 'DS / NDS', family: 'Nintendo' },
  { slug: 'nintendo-3ds', label: '3DS', family: 'Nintendo' },
  { slug: 'nintendo-switch', label: 'Switch', family: 'Nintendo' },
  { slug: 'xbox360', label: 'Xbox 360', family: 'Xbox' },
];
export const GENRES = [
  { slug: 'action', name: 'Action' }, { slug: 'adventure', name: 'Adventure' },
  { slug: 'role-playing-games-rpg', name: 'RPG' }, { slug: 'indie', name: 'Indie' },
  { slug: 'strategy', name: 'Strategy' }, { slug: 'shooter', name: 'Shooter' },
  { slug: 'casual', name: 'Casual' }, { slug: 'simulation', name: 'Simulation' },
  { slug: 'puzzle', name: 'Puzzle' }, { slug: 'arcade', name: 'Arcade' },
  { slug: 'platformer', name: 'Platformer' }, { slug: 'racing', name: 'Racing' },
  { slug: 'sports', name: 'Sports' }, { slug: 'fighting', name: 'Fighting' },
  { slug: 'family', name: 'Family' }, { slug: 'board-games', name: 'Board games' },
  { slug: 'educational', name: 'Educational' }, { slug: 'card', name: 'Card' },
  { slug: 'massively-multiplayer', name: 'Massively multiplayer' },
];
export const STATUSES = {
  yes: { label: 'Want to play', icon: 'heart', color: 'green' },
  no: { label: 'Not interested', icon: 'x', color: 'red' },
  played: { label: 'Played', icon: 'check', color: 'blue' },
};
export const HISTORY_KEY = 'playnext.history.v1';
export const FILTERS_KEY = 'playnext.filters.v1';
export const API_KEY = 'playnext.rawg.session';

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function matchesFilters(game, platforms = [], genre = '') {
  return (!platforms.length || game.platforms.some(slug => platforms.includes(slug))) && (!genre || game.genres.includes(genre));
}
export function unseenGames(games, history) {
  const seen = new Set(history.map(entry => entry.game.id));
  const unique = new Set();
  return games.filter(game => !seen.has(game.id) && !unique.has(game.id) && unique.add(game.id));
}
export function decide(history, game, status, now = new Date().toISOString()) {
  if (!STATUSES[status]) throw new Error('Invalid choice.');
  return [{ game, status, decidedAt: now }, ...history.filter(entry => entry.game.id !== game.id)];
}
export function readHistory(storage) {
  try {
    const value = JSON.parse(storage.getItem(HISTORY_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter(entry => STATUSES[entry?.status] && Number.isSafeInteger(entry?.game?.id) && typeof entry.game.name === 'string' && typeof entry.game.slug === 'string' && Array.isArray(entry.game.genres) && Array.isArray(entry.game.platforms));
  } catch { return []; }
}
export function readFilters(storage) {
  try {
    const filters = JSON.parse(storage.getItem(FILTERS_KEY));
    return { platforms: Array.isArray(filters?.platforms) ? filters.platforms.filter(slug => PLATFORMS.some(p => p.slug === slug)) : [], genre: typeof filters?.genre === 'string' ? filters.genre : '' };
  } catch { return { platforms: [], genre: '' }; }
}
export function safeImage(value) {
  if (typeof value !== 'string') return '';
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}
export function normalizeGame(raw) {
  if (!Number.isSafeInteger(raw?.id) || typeof raw.name !== 'string' || typeof raw.slug !== 'string') return null;
  return {
    id: raw.id, slug: raw.slug, name: raw.name,
    image: safeImage(raw.background_image),
    genres: (Array.isArray(raw.genres) ? raw.genres : []).map(g => g?.slug).filter(slug => typeof slug === 'string'),
    platforms: (Array.isArray(raw.platforms) ? raw.platforms : []).map(p => p?.platform?.slug).filter(slug => typeof slug === 'string'),
    released: typeof raw.released === 'string' ? raw.released : null,
    rating: Number.isFinite(raw.rating) ? raw.rating : null,
    metacritic: Number.isFinite(raw.metacritic) ? raw.metacritic : null,
    description: typeof raw.description_raw === 'string' ? raw.description_raw : '',
  };
}
