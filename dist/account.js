import { HISTORY_KEY, FILTERS_KEY, API_KEY, readHistory, readFilters, safeImage } from './model.js';

export const emptyState = () => ({ v: 1, rawg_key: null, history: [], filters: { platforms: [], genre: '' } });
export const MEMORY_AUTH_OPTIONS = Object.freeze({ persistSession: false, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' });
// The main app keeps the session on this device through the encrypted IndexedDB adapter
// (dist/session-store.js); the OAuth popup keeps using MEMORY_AUTH_OPTIONS.
export const persistentAuthOptions = storage => Object.freeze({ ...MEMORY_AUTH_OPTIONS, persistSession: true, detectSessionInUrl: false, storage });

// Remove the legacy secret without reading it. Tokens are never written to localStorage/sessionStorage.
export function removeLegacyKeys(...storages) {
  for (const storage of storages) {
    for (const key of [API_KEY, 'playnext.rawg.key']) {
      try { storage?.removeItem(key); } catch { /* Storage may be blocked. */ }
    }
  }
}
export function legacyChoices(storage) {
  return { history: readHistory(storage), filters: readFilters(storage) };
}
export function removeLegacyChoices(storage) {
  storage.removeItem(HISTORY_KEY); storage.removeItem(FILTERS_KEY);
}
export function cleanState(value) {
  const state = emptyState();
  if (!value || typeof value !== 'object') return state;
  state.history = readHistory({ getItem: () => JSON.stringify(value.history) }).map(entry => ({
    status: entry.status, decidedAt: typeof entry.decidedAt === 'string' ? entry.decidedAt : '',
    game: { ...entry.game, rating: Number.isFinite(entry.game.rating) ? entry.game.rating : null,
      metacritic: Number.isFinite(entry.game.metacritic) ? entry.game.metacritic : null,
      image: safeImage(entry.game.image), description: typeof entry.game.description === 'string' ? entry.game.description : '',
      released: typeof entry.game.released === 'string' ? entry.game.released : null,
      genres: entry.game.genres.filter(s=>typeof s === 'string'), platforms: entry.game.platforms.filter(s=>typeof s === 'string') },
  }));
  state.filters = readFilters({ getItem: () => JSON.stringify(value.filters) });
  state.rawg_key = typeof value.rawg_key === 'string' ? value.rawg_key.slice(0, 256) : null;
  return state;
}
export function accountMessage(error) {
  const code = error?.code;
  if (code === '40001' || error?.message?.includes('REVISION_CONFLICT')) return 'Your account changed in another tab. Export this tab’s choices and sign in again to load the latest version.';
  if (code === 'popup_blocked') return 'Allow pop-ups for this site and try again. Your choices will remain in this tab.';
  if (code === 'oauth_cancelled') return 'Google sign-in was canceled. You can try again whenever you like.';
  if (code === 'oauth_timeout') return 'Google sign-in timed out. Try again.';
  if (code === 'provider_disabled') return 'Google sign-in is not enabled for this project yet. Try again in a moment.';
  if (code === '22023') return 'Your collection exceeds the 5,000-game limit or contains invalid data. Export your data before continuing.';
  return 'Could not access your account. Check your connection and try again.';
}
// A restored device session is discarded only when Auth/PostgREST rejects it; network or
// server hiccups keep it so the next attempt (or reconnect) can continue without Google.
export function isAuthFailure(error) {
  const status = Number(error?.status);
  return status === 401 || status === 403 || ['PGRST301', 'PGRST302', '42501', 'refresh_token_not_found', 'session_not_found', 'bad_jwt'].includes(error?.code)
    || /jwt|not authenticated|AUTH_REQUIRED/i.test(String(error?.message || ''));
}

// Serializes saves and refuses writes after a conflict. The caller keeps unsaved data in memory.
export class PrivateAccount {
  constructor(supabase) { this.client = supabase; this.reset(); }
  reset() { this.generation = (this.generation || 0) + 1; this.revision = 0; this.user = null; this.error = null; this.pending = 0; this.tail = Promise.resolve(); }
  async open(user) {
    this.reset(); const generation = this.generation;
    const { data, error } = await this.client.rpc('playnext_load');
    if (error) throw error;
    if (generation !== this.generation) throw new Error('SESSION_CHANGED');
    this.user = user; this.revision = data.revision;
    return cleanState(data.data);
  }
  save(state) {
    if (!this.user) return Promise.resolve();
    const snapshot = structuredClone(state), generation = this.generation;
    this.pending++;
    const task = this.tail.then(async () => {
      if (generation !== this.generation) throw new Error('SESSION_CHANGED');
      if (this.error) throw this.error;
      const { data, error } = await this.client.rpc('playnext_save', { p_state: snapshot, p_revision: this.revision });
      if (generation !== this.generation) throw new Error('SESSION_CHANGED');
      if (error) { this.error = error; throw error; }
      this.revision = data;
    }).finally(() => { if (generation === this.generation) this.pending--; });
    // Keep a handled tail while returning the actual outcome to the UI.
    this.tail = task.catch(() => {});
    return task;
  }
  async flush() { await this.tail; if (this.error) throw this.error; }
  async retry(state) {
    if (this.error?.code === '40001') throw this.error;
    await this.tail; this.error = null; return this.save(state);
  }
}
