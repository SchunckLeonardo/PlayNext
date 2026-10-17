import { normalizeGame, shuffle, unseenGames } from './model.js';

export class RawgError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
}
export class RawgClient {
  constructor(key, request = (...args) => globalThis.fetch(...args), random = Math.random) {
    this.key = key.trim(); this.request = request; this.random = random;
  }
  async get(path, params = {}, signal) {
    let response;
    try {
      response = await this.request('/api/rawg', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, params, key: this.key }),
        cache: 'no-store', credentials: 'same-origin',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
        referrerPolicy: 'no-referrer',
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new RawgError('Não foi possível conectar ao PlayNext. Confira sua conexão e tente novamente.');
    }
    if (!response.ok) {
      if ([401, 403].includes(response.status)) throw new RawgError('A RAWG não aceitou esta chave. Confira sua API key e tente novamente.', response.status);
      if (response.status === 429) throw new RawgError('Limite de consultas da RAWG atingido. Aguarde um pouco e tente novamente.', 429);
      if (response.status === 504) throw new RawgError('A RAWG demorou para responder. Tente novamente em instantes.', 504);
      throw new RawgError('A RAWG está indisponível no momento. Tente novamente em instantes.', response.status);
    }
    let data;
    try { data = await response.json(); } catch { throw new RawgError('A RAWG retornou uma resposta inesperada. Tente novamente.'); }
    return data;
  }
  async catalog(path, signal) {
    const results = [];
    for (let page = 1; page <= 10; page++) {
      const data = await this.get(path, { page_size: 40, page }, signal);
      if (!Array.isArray(data.results)) throw new RawgError('Não foi possível carregar os filtros da RAWG.');
      results.push(...data.results);
      if (!data.next) break;
    }
    return results;
  }
  async connect(signal) {
    const [platforms, genres] = await Promise.all([this.catalog('platforms', signal), this.catalog('genres', signal)]);
    return { platforms, genres };
  }
  async sample({ platforms, genre = '', history = [], signal }) {
    if (!platforms.length) throw new RawgError('Esta plataforma não está disponível no catálogo da RAWG.');
    const params = { page_size: 40, platforms: platforms.join(','), ordering: '-added', dates: `1970-01-01,${new Date().toISOString().slice(0, 10)}` };
    if (genre) params.genres = genre;
    const first = await this.get('games', params, signal);
    if (!Array.isArray(first.results) || !Number.isFinite(first.count)) throw new RawgError('A RAWG retornou uma lista inesperada.');
    const count = Math.max(0, first.count);
    if (!count) return { games: [], count: 0 };
    const pages = Math.ceil(count / 40);
    const used = new Set();
    let candidates = [];
    // Try fresh random pages before falling back to the first page, without unbounded requests.
    for (let attempt = 0; attempt < 4 && used.size < pages; attempt++) {
      const page = 1 + Math.floor(this.random() * pages);
      if (used.has(page)) continue;
      used.add(page);
      let data;
      try { data = page === 1 ? first : await this.get('games', { ...params, page }, signal); }
      catch (error) { if (error.status === 404) continue; throw error; }
      candidates = unseenGames((data.results || []).map(normalizeGame).filter(Boolean), history);
      if (candidates.length) break;
    }
    if (!candidates.length) candidates = unseenGames(first.results.map(normalizeGame).filter(Boolean), history);
    return { games: shuffle(candidates, this.random), count };
  }
  async details(id, signal) {
    const raw = await this.get(`games/${encodeURIComponent(id)}`, {}, signal);
    return normalizeGame(raw);
  }
}
