import { HISTORY_KEY, FILTERS_KEY, API_KEY, readHistory, readFilters, safeImage } from './model.js';

export const emptyState = () => ({ v: 1, rawg_key: null, history: [], filters: { platforms: [], genre: '' } });
export const MEMORY_AUTH_OPTIONS = Object.freeze({ persistSession: false, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' });

// Remove the legacy secret without reading it. New sessions never persist tokens or keys.
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
  if (code === '40001' || error?.message?.includes('REVISION_CONFLICT')) return 'Sua conta mudou em outra aba. Exporte as escolhas desta aba e entre novamente para carregar a versão mais recente.';
  if (code === 'popup_blocked') return 'Permita a janela de login do Google neste site e tente novamente. Suas escolhas continuam nesta aba.';
  if (code === 'oauth_cancelled') return 'A entrada com Google foi cancelada. Você pode tentar novamente quando quiser.';
  if (code === 'oauth_timeout') return 'O login com Google demorou demais. Tente novamente.';
  if (code === 'provider_disabled') return 'O login Google ainda não foi ativado neste projeto. Tente novamente em instantes.';
  if (code === '22023') return 'Sua coleção excedeu o limite de 5.000 jogos ou contém dados inválidos. Exporte seus dados antes de continuar.';
  return 'Não foi possível acessar sua conta. Confira a conexão e tente novamente.';
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
