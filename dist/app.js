import { PLATFORMS, GENRES, STATUSES, shuffle, matchesFilters, unseenGames, decide, safeImage } from './model.js';
import { RawgClient } from './api.js';
import { DEMO_GAMES } from './demo.js';
import { icon } from './icons.js';
import { removeLegacyKeys } from './account.js';
import { initAccountUI } from './account-ui.js';
import { PriceClient, ITAD_SHOPS, safeStoreUrl } from './prices.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const labelGenre = slug => GENRES.find(g => g.slug === slug)?.name || genres.find(g => g.slug === slug)?.name || slug;
const platformNames = game => game.platforms.map(slug => PLATFORMS.find(p => p.slug === slug)?.label).filter(Boolean).join(' · ');
const image = (game, className = '', loading = 'lazy') => safeImage(game.image) ? `<img class="${className}" src="${escape(safeImage(game.image))}" alt="Artwork for ${escape(game.name)}" loading="${loading}" draggable="false">` : '';
for (const storage of ['localStorage', 'sessionStorage']) {
  try { removeLegacyKeys(window[storage]); } catch {}
}
let history = [];
let filters = { platforms: [], genre: '' };
let rawgKey = null;
let accountUI;
let stateGeneration = 0;
let genres = [...GENRES];
let client = null;
let catalogPlatforms = [];
let queue = [];
let loading = false;
let deciding = false;
let loadError = '';
let requestController;
let detailsController;
let priceController;
let priceTimer;
let undoEntry = null;
let collectionStatus = 'all';
let toastTimer;
let filterTimer;
let detailsGameId = null;
let drag = null;
let connectionController;
const priceClient = new PriceClient({ country: /^pt/i.test(navigator.language || '') ? 'BR' : 'US' });
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function renderCardStoresMarkup(snapshot) {
  const countryToggle = `<button type="button" class="store-currency" data-action="toggle-currency" aria-label="Switch store currency (${priceClient.country === 'BR' ? 'BRL to USD' : 'USD to BRL'})">${priceClient.country === 'BR' ? 'BRL' : 'USD'}</button>`;
  if (!snapshot) {
    return `<span class="store-pill store-pill-loading">${icon('tag')}<span>Checking Steam · GOG · Epic…</span></span>${countryToggle}`;
  }
  if (snapshot.consoleOnly) {
    return `<span class="store-pill store-pill-muted">${icon('tag')}<span>Console release · No PC store listing</span></span>`;
  }
  const pills = ['steam', 'gog', 'epic'].map(key => {
    const shop = ITAD_SHOPS[key];
    const deal = snapshot.stores?.[key];
    if (deal && typeof deal.price === 'number') {
      const href = safeStoreUrl(deal.url) || snapshot.searchLinks?.[key] || '#';
      const isBest = snapshot.bestStore === key;
      return `<a class="store-pill${isBest ? ' store-pill-best' : ''}" href="${escape(href)}" target="_blank" rel="noopener noreferrer" aria-label="${escape(shop.label)}: ${escape(deal.formattedPrice)}${deal.cut > 0 ? `, ${deal.cut}% off` : ''}${isBest ? ', lowest price' : ''}"><span class="store-name">${escape(shop.shortLabel)}</span><strong class="store-price">${escape(deal.formattedPrice)}</strong>${deal.cut > 0 ? `<span class="store-cut">-${deal.cut}%</span>` : ''}</a>`;
    }
    const searchHref = snapshot.searchLinks?.[key] || '#';
    return `<a class="store-pill store-pill-empty" href="${escape(searchHref)}" target="_blank" rel="noopener noreferrer" aria-label="${escape(shop.label)}: no active offer listed, search on store"><span class="store-name">${escape(shop.shortLabel)}</span><span class="store-na">—</span></a>`;
  }).join('');
  return `${pills}${countryToggle}`;
}

function renderDetailsStoresMarkup(snapshot, game) {
  const currencyControls = `<div class="currency-switch" role="group" aria-label="Store price currency"><button type="button" class="currency-chip" data-price-country="US" aria-pressed="${priceClient.country === 'US'}">USD ($)</button><button type="button" class="currency-chip" data-price-country="BR" aria-pressed="${priceClient.country === 'BR'}">BRL (R$)</button></div>`;
  if (!snapshot) {
    return `<div class="details-stores-head"><span class="details-stores-title">${icon('tag')} Compare PC Stores</span>${currencyControls}</div><p class="details-stores-loading">Checking Steam, GOG, and Epic Games via IsThereAnyDeal…</p>`;
  }
  if (snapshot.consoleOnly) {
    return `<div class="details-stores-head"><span class="details-stores-title">${icon('tag')} PC Store Prices</span></div><p class="details-stores-note">This title is a console release (${escape(platformNames(game))}) and has no Steam, GOG, or Epic Games listing.</p>`;
  }
  const cards = ['steam', 'gog', 'epic'].map(key => {
    const shop = ITAD_SHOPS[key];
    const deal = snapshot.stores?.[key];
    if (deal && typeof deal.price === 'number') {
      const href = safeStoreUrl(deal.url) || snapshot.searchLinks?.[key] || '#';
      const isBest = snapshot.bestStore === key;
      return `<a class="details-store-card${isBest ? ' is-best' : ''}" href="${escape(href)}" target="_blank" rel="noopener noreferrer"><div class="details-store-top"><span class="details-store-name">${escape(shop.label)}</span>${isBest ? '<span class="details-store-badge">Lowest</span>' : deal.cut > 0 ? `<span class="details-store-cut">-${deal.cut}%</span>` : ''}</div><div class="details-store-pricing"><strong class="details-store-price">${escape(deal.formattedPrice)}</strong>${deal.cut > 0 && deal.formattedRegular ? `<span class="details-store-regular">${escape(deal.formattedRegular)}</span>` : ''}</div><span class="details-store-cta">${deal.cut > 0 ? `Save ${deal.cut}%` : 'Open store'} ${icon('external')}</span></a>`;
    }
    const href = snapshot.searchLinks?.[key] || '#';
    return `<a class="details-store-card is-unavailable" href="${escape(href)}" target="_blank" rel="noopener noreferrer"><div class="details-store-top"><span class="details-store-name">${escape(shop.label)}</span></div><div class="details-store-pricing"><span class="details-store-na">Not listed</span></div><span class="details-store-cta">Search store ${icon('external')}</span></a>`;
  }).join('');
  const historyNote = snapshot.historyLow?.formattedAmount ? `All-time low: <strong>${escape(snapshot.historyLow.formattedAmount)}</strong> · ` : '';
  return `<div class="details-stores-head"><span class="details-stores-title">${icon('tag')} Compare PC Stores</span>${currencyControls}</div><div class="details-stores-grid">${cards}</div><p class="details-stores-note">${historyNote}Prices via <a href="https://isthereanydeal.com/" target="_blank" rel="noopener noreferrer">IsThereAnyDeal</a> (Steam · GOG · Epic Games).</p>`;
}

function scheduleCardPriceLoad(game, immediate = false) {
  clearTimeout(priceTimer);
  priceController?.abort();
  if (!game) return;
  const runLookup = async () => {
    const controller = new AbortController();
    priceController = controller;
    try {
      const snapshot = await priceClient.forGame(game, controller.signal);
      if (controller.signal.aborted || queue[0]?.id !== game.id || loading || loadError) return;
      const node = $('#game-stores');
      if (node) node.innerHTML = renderCardStoresMarkup(snapshot);
    } catch {}
  };
  if (immediate) runLookup();
  else priceTimer = setTimeout(runLookup, 220);
}

function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icon(node.dataset.icon); });
}
function toast(message, name = 'check') {
  clearTimeout(toastTimer);
  $('#toast').innerHTML = icon(name) + `<span>${escape(message)}</span>`;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3700);
}
function saveHistory() { accountUI?.save(); return true; }
function saveFilters() { accountUI?.save(); }
function renderFilters() {
  const groups = ['PC', 'PlayStation', 'Nintendo', 'Xbox'];
  $('#platform-options').innerHTML = groups.map(family => `<div class="platform-family"><div class="family-label">${family}</div><div class="platform-chips">${PLATFORMS.filter(p => p.family === family).map(p => `<button class="platform-chip" data-platform="${p.slug}" aria-pressed="${filters.platforms.includes(p.slug)}"${client && !catalogPlatforms.some(cp => cp.slug === p.slug) ? ' disabled' : ''}>${p.label}</button>`).join('')}</div></div>`).join('');
  $('#all-platforms').classList.toggle('selected', !filters.platforms.length);
  $('#all-platforms').setAttribute('aria-pressed', String(!filters.platforms.length));
  $('#genre').innerHTML = '<option value="">All genres</option>' + genres.map(g => `<option value="${escape(g.slug)}">${escape(labelGenre(g.slug))}</option>`).join('');
  if (filters.genre && !genres.some(g => g.slug === filters.genre)) filters.genre = '';
  $('#genre').value = filters.genre;
}
function updateConnection() {
  $('#connection-status').classList.toggle('connected', !!client);
  $('#connection-status').innerHTML = `<i></i>${client ? 'RAWG connected' : 'Demo mode'}`;
  $('#key-button-label').textContent = rawgKey ? 'My key' : 'Connect RAWG';
  $('#demo-banner').hidden = !!client;
  $('#disconnect').hidden = !rawgKey;
}
function renderCard(immediatePrice = false) {
  clearTimeout(priceTimer);
  priceController?.abort();
  const card = $('#game-card');
  card.style.transform = '';
  card.style.opacity = '';
  card.classList.remove('is-empty');
  const game = queue[0];
  $$('[data-choice]').forEach(b => { b.disabled = loading || !game || deciding; });
  $('#undo').disabled = !undoEntry || deciding;
  $$('[data-action="shuffle"]').forEach(b => { b.disabled = loading || deciding; });
  if (loading) {
    card.setAttribute('aria-busy', 'true');
    card.innerHTML = '<div class="skeleton"></div><div class="loading-label"><span class="spinner"></span>Finding your next adventure…</div>';
    $('#deck-summary').innerHTML = '<span class="live-dot"></span> Exploring the RAWG catalog';
    return;
  }
  card.removeAttribute('aria-busy');
  $('#deck-summary').innerHTML = `<span class="live-dot"></span>${client ? 'Discovering the RAWG catalog' : `Demo · ${queue.length} ${queue.length === 1 ? 'game' : 'games'} to explore`}`;
  if (!game || loadError) {
    card.classList.add('is-empty');
    const hasFilters = filters.platforms.length || filters.genre;
    let title = 'You’ve explored this selection!';
    let text = client ? 'Find another random selection or adjust the filters to continue your journey.' : 'Your choices are in your collection. Connect RAWG to discover more games or review your filters.';
    if (hasFilters && !loadError) { title = 'Want to broaden your search?'; text = client ? 'No new games in this selection. Try another round or broaden your filters.' : 'The demo selection is small. Broaden your filters or connect RAWG to explore more.'; }
    if (loadError) { title = 'A pause in the adventure.'; text = loadError; }
    card.innerHTML = `<div class="empty-card">${icon(loadError ? 'info' : 'shuffle')}<h2>${title}</h2><p>${escape(text)}</p><button class="button primary-button" data-action="${client ? 'shuffle' : hasFilters ? 'reset-filters' : 'api'}">${loadError ? 'Try again' : client ? 'Find another selection' : hasFilters ? 'Clear filters' : 'Connect RAWG'}${icon('arrow')}</button>${!client && hasFilters ? '<button class="text-button" data-action="api">Discover more with RAWG</button>' : ''}</div>`;
    $('#card-announcement').textContent = title;
    return;
  }
  const supported = platformNames(game);
  const year = /^\d{4}/.test(game.released || '') ? game.released.slice(0, 4) : 'Release year unknown';
  const cachedPrice = priceClient.peek(game);
  card.innerHTML = `${image(game, 'game-image', 'eager')}<div class="game-scrim"></div><div class="game-card-top"><span class="game-category">${icon('shuffle')} ${client ? 'YOUR NEXT DISCOVERY' : 'DEMO SELECTION'}</span>${game.rating ? `<span class="game-rating">${icon('star')} ${game.rating.toFixed(1)} <span class="rating-max">/ 5</span></span>` : ''}</div><span class="swipe-stamp" id="swipe-stamp"></span><div class="game-copy"><div class="game-genres">${game.genres.slice(0, 3).map(slug => `<span>${escape(labelGenre(slug))}</span>`).join('')}</div><h2 class="game-title">${escape(game.name)}</h2>${game.description ? `<p class="game-description">${escape(game.description)}</p>` : ''}<div class="game-stores" id="game-stores" aria-label="PC store prices">${renderCardStoresMarkup(cachedPrice)}</div><div class="game-meta"><div class="game-meta-left"><span>${year}</span><span class="meta-divider"></span><span class="game-platforms" title="${escape(supported)}">${escape(supported || 'View platforms on RAWG')}</span></div><button class="details-link" data-details="${game.id}">View details ${icon('external')}</button></div></div>`;
  $('#card-announcement').textContent = `Suggested: ${game.name}. ${game.genres.map(labelGenre).join(', ')}. Use the arrow keys to choose.`;
  if (!cachedPrice) scheduleCardPriceLoad(game, immediatePrice);
  // Preload only the next cover to keep the next swipe immediate.
  if (queue[1]?.image) { const next = new Image(); next.src = safeImage(queue[1].image); }
}
function renderStats() {
  $('#nav-count').textContent = history.length;
  $('#recent-count').textContent = history.length;
  for (const status of Object.keys(STATUSES)) {
    const count = history.filter(e => e.status === status).length;
    $(`#count-${status}`).textContent = String(count).padStart(2, '0');
    $(`#tab-count-${status}`).textContent = count;
  }
  $('#tab-count-all').textContent = history.length;
  $('#recent-list').innerHTML = history.length ? history.slice(0, 3).map(({ game, status }) => `<button class="recent-item" data-details="${game.id}">${image(game) || '<span class="recent-fallback"></span>'}<div><h4>${escape(game.name)}</h4><p class="${STATUSES[status].color}">${icon(STATUSES[status].icon)}${STATUSES[status].label}</p></div></button>`).join('') : `<div class="recent-empty">${icon('collection')}<strong>A collection that feels like you.</strong>Your first choices<br>will show up here.</div>`;
  if (!$('#collection-view').hidden) renderCollection();
}
function demoQueue(initial = false) {
  const games = unseenGames(DEMO_GAMES.filter(game => matchesFilters(game, filters.platforms, filters.genre)), history);
  queue = initial && !filters.platforms.length && !filters.genre && games[0]?.slug === 'elden-ring' ? [games[0], ...shuffle(games.slice(1))] : shuffle(games);
}
async function loadGames(initial = false) {
  requestController?.abort();
  clearTimeout(filterTimer);
  const controller = new AbortController();
  requestController = controller;
  loadError = '';
  if (!client) {
    loading = false; demoQueue(initial); renderCard(initial); return;
  }
  loading = true;
  queue = [];
  renderCard();
  try {
    const selected = filters.platforms.length ? filters.platforms : PLATFORMS.map(p => p.slug);
    const ids = catalogPlatforms.filter(p => selected.includes(p.slug)).map(p => p.id);
    const result = await client.sample({ platforms: ids, genre: filters.genre, history, signal: controller.signal });
    if (controller.signal.aborted) return;
    queue = unseenGames(result.games, history);
  } catch (error) {
    if (controller.signal.aborted) return;
    loadError = error.message;
  } finally {
    if (!controller.signal.aborted) { loading = false; renderCard(true); }
  }
}
function applyFilters() {
  renderFilters(); saveFilters(); undoEntry = null;
  requestController?.abort();
  if (client) {
    loading = true; queue = []; renderCard();
    clearTimeout(filterTimer); filterTimer = setTimeout(() => loadGames(), 280);
  } else loadGames();
}
async function choose(status) {
  const generation = stateGeneration;
  const game = queue[0];
  if (!game || loading || deciding || !STATUSES[status]) return;
  deciding = true;
  $$('[data-choice]').forEach(b => { b.disabled = true; });
  $('#undo').disabled = true;
  $$('[data-action="shuffle"]').forEach(b => { b.disabled = true; });
  const card = $('#game-card');
  const stamp = $('#swipe-stamp');
  if (stamp) { stamp.textContent = STATUSES[status].label.toUpperCase(); stamp.style.color = `var(--${STATUSES[status].color})`; stamp.style.opacity = 1; }
  if (!reducedMotion.matches) {
    card.style.transform = status === 'played' ? 'translateY(35px) scale(.96)' : `translateX(${status === 'yes' ? 90 : -90}px) rotate(${status === 'yes' ? 8 : -8}deg)`;
    card.style.opacity = '0';
    await new Promise(resolve => setTimeout(resolve, 210));
  }
  if (generation !== stateGeneration) return;
  undoEntry = { history, game, filters: JSON.stringify(filters) };
  history = decide(history, game, status);
  queue = queue.filter(g => g.id !== game.id);
  const saved = saveHistory();
  deciding = false;
  renderStats(); renderCard();
  if (saved) toast(`${game.name} · ${STATUSES[status].label}`, STATUSES[status].icon);
  if (!queue.length && client) loadGames();
}
function undo() {
  if (!undoEntry || deciding) return;
  requestController?.abort();
  loading = false;
  history = undoEntry.history;
  if (JSON.stringify(filters) === undoEntry.filters) queue = [undoEntry.game, ...queue.filter(g => g.id !== undoEntry.game.id)];
  undoEntry = null;
  const saved = saveHistory();
  renderStats(); renderCard();
  if (saved) toast('Last choice undone.', 'undo');
}
function renderCollection() {
  $$('[data-tab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === collectionStatus)));
  const search = $('#collection-search').value.trim().toLocaleLowerCase('en-US');
  const records = history.filter(e => (collectionStatus === 'all' || e.status === collectionStatus) && e.game.name.toLocaleLowerCase('en-US').includes(search));
  $('#collection-grid').innerHTML = records.length ? records.map(({ game, status }) => `<article class="collection-card"><button class="collection-art" data-details="${game.id}" aria-label="View details for ${escape(game.name)}">${image(game)}<span class="status-badge ${STATUSES[status].color}">${icon(STATUSES[status].icon)}${STATUSES[status].label}</span></button><div class="collection-card-body"><h2>${escape(game.name)}</h2><p class="collection-platforms">${escape(platformNames(game))}</p><div class="collection-card-controls"><label class="sr-only" for="status-${game.id}">Change choice for ${escape(game.name)}</label><select id="status-${game.id}" data-change-status="${game.id}">${Object.entries(STATUSES).map(([key, value]) => `<option value="${key}"${key === status ? ' selected' : ''}>${value.label}</option>`).join('')}</select><button class="icon-button" data-remove="${game.id}" aria-label="Remove ${escape(game.name)} from your collection">${icon('trash')}</button></div></div></article>`).join('') : `<div class="collection-empty">${icon(search ? 'search' : collectionStatus === 'all' ? 'collection' : STATUSES[collectionStatus].icon)}<h2>${search ? 'This game is not here yet.' : collectionStatus === 'all' ? 'Every adventure starts somewhere.' : 'Your next choice is up next.'}</h2><p>${search ? 'Try another name or check the other collection lists.' : 'Swipe through games in Discover. Your choices are organized here, ready for your next play.'}</p>${search ? '<button class="button primary-button" data-action="clear-search">Clear search</button>' : `<a href="#discover" class="button primary-button">Discover games ${icon('arrow')}</a>`}</div>`;
}
function route() {
  const collection = location.hash.startsWith('#collection');
  $('#discover-view').hidden = collection;
  $('#collection-view').hidden = !collection;
  $$('[data-nav]').forEach(link => {
    const active = link.dataset.nav === (collection ? 'collection' : 'discover');
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  if (collection) renderCollection();
}
function openApi() {
  $('#api-error').hidden = true;
  $('#api-key').type = 'password';
  $('#toggle-key').setAttribute('aria-label', 'Show API key');
  if (!$('#api-dialog').open) $('#api-dialog').showModal();
  $('#api-key').focus();
}
async function connect(key, automatic = false) {
  connectionController?.abort();
  const controller = new AbortController();
  connectionController = controller;
  const candidate = new RawgClient(key);
  $('#connect-button').disabled = true;
  $('#connect-button').innerHTML = '<span class="spinner"></span> Connecting to RAWG…';
  $('#api-error').hidden = true;
  try {
    const catalog = await candidate.connect(controller.signal);
    if (controller.signal.aborted) return;
    if (!catalog.platforms.some(p => PLATFORMS.some(known => known.slug === p.slug))) throw new Error('RAWG did not return the expected platforms. Try again.');
    requestController?.abort();
    client = candidate;
    catalogPlatforms = catalog.platforms;
    genres = catalog.genres.map(g => ({ slug: g.slug, name: g.name })).filter(g => typeof g.slug === 'string' && typeof g.name === 'string');
    rawgKey = key.trim();
    if (!automatic) accountUI?.save();
    $('#api-key').value = '';
    undoEntry = null;
    renderFilters(); updateConnection();
    $('#api-dialog').close();
    if (!automatic) toast('RAWG connected. Let’s find your next game!', 'key');
    await loadGames();
  } catch (error) {
    if (controller.signal.aborted) return;
    $('#api-error').textContent = error.message;
    $('#api-error').hidden = false;
    if (automatic) toast('Could not reconnect to RAWG. Open My Key to try again.', 'info');
  } finally {
    if (!controller.signal.aborted) { $('#connect-button').disabled = false; $('#connect-button').innerHTML = `Connect and discover ${icon('arrow')}`; }
  }
}
function disconnect() {
  connectionController?.abort(); requestController?.abort();
  client = null; genres = [...GENRES]; undoEntry = null;
  rawgKey = null; accountUI?.save();
  $('#api-key').value = '';
  $('#api-dialog').close();
  renderFilters(); updateConnection(); loadGames();
  toast('RAWG key removed. Your collection was kept.', 'key');
}
async function refreshDetailsPrices(game, signal) {
  if (!game) return;
  try {
    const snapshot = await priceClient.forGame(game, signal);
    if (signal?.aborted || detailsGameId !== game.id) return;
    const container = $('#details-stores');
    if (container) container.innerHTML = renderDetailsStoresMarkup(snapshot, game);
  } catch {}
}
async function openDetails(id) {
  const game = queue.find(g => g.id === id) || history.find(e => e.game.id === id)?.game;
  if (!game) return;
  detailsController?.abort();
  const controller = new AbortController();
  detailsController = controller;
  detailsGameId = id;
  const cachedPrice = priceClient.peek(game);
  $('#details-content').innerHTML = `<div class="details-art">${image(game, '', 'eager')}<button class="icon-button" data-close="details-dialog" aria-label="Close details">${icon('x')}</button></div><div class="details-body"><div class="game-genres">${game.genres.map(g => `<span>${escape(labelGenre(g))}</span>`).join('')}</div><h2>${escape(game.name)}</h2><div class="details-meta"><span>${escape(platformNames(game))}</span>${game.metacritic ? `<span>Metacritic: ${game.metacritic}</span>` : ''}</div><section class="details-stores" id="details-stores" aria-label="PC store prices">${renderDetailsStoresMarkup(cachedPrice, game)}</section><p class="details-description" id="details-description">${client ? 'Loading RAWG details…' : escape(game.description || 'See more information on RAWG.')}</p><a class="button primary-button" href="https://rawg.io/games/${encodeURIComponent(game.slug)}" target="_blank" rel="noopener noreferrer">View on RAWG ${icon('external')}</a><p class="details-source">${client ? 'Original description provided by RAWG; it may be in English.' : 'Demo with English editorial copy. Covers and ratings: RAWG.'}</p></div>`;
  $('#details-dialog').showModal();
  if (!cachedPrice) refreshDetailsPrices(game, controller.signal);
  if (client) {
    try {
      const details = await client.details(id, controller.signal);
      if (controller.signal.aborted || detailsGameId !== id) return;
      $('#details-description').textContent = details?.description || 'RAWG did not provide a description for this game.';
    } catch (error) {
      if (!controller.signal.aborted && detailsGameId === id) $('#details-description').textContent = error.message;
    }
  }
}
function applyCurrencyCountry(nextCountry) {
  priceClient.setCountry(nextCountry);
  const currentGame = queue[0];
  if (currentGame && $('#game-stores')) {
    const cached = priceClient.peek(currentGame);
    $('#game-stores').innerHTML = renderCardStoresMarkup(cached);
    if (!cached) scheduleCardPriceLoad(currentGame, true);
  }
  if (detailsGameId !== null && $('#details-dialog').open) {
    const detailsGame = queue.find(g => g.id === detailsGameId) || history.find(e => e.game.id === detailsGameId)?.game;
    if (detailsGame && $('#details-stores')) {
      const cached = priceClient.peek(detailsGame);
      $('#details-stores').innerHTML = renderDetailsStoresMarkup(cached, detailsGame);
      if (!cached) refreshDetailsPrices(detailsGame, detailsController?.signal);
    }
  }
}

document.addEventListener('click', event => {
  const priceCountry = event.target.closest('[data-price-country]');
  if (priceCountry) {
    applyCurrencyCountry(priceCountry.dataset.priceCountry);
    return;
  }
  const platform = event.target.closest('[data-platform]');
  if (platform && !deciding) {
    const slug = platform.dataset.platform;
    filters.platforms = filters.platforms.includes(slug) ? filters.platforms.filter(p => p !== slug) : [...filters.platforms, slug];
    applyFilters(); return;
  }
  const choice = event.target.closest('[data-choice]');
  if (choice) { choose(choice.dataset.choice); return; }
  const close = event.target.closest('[data-close]');
  if (close) { document.getElementById(close.dataset.close).close(); return; }
  const details = event.target.closest('[data-details]');
  if (details) { openDetails(Number(details.dataset.details)); return; }
  const tab = event.target.closest('[data-tab]');
  if (tab) { collectionStatus = tab.dataset.tab; renderCollection(); return; }
  const remove = event.target.closest('[data-remove]');
  if (remove) {
    const id = Number(remove.dataset.remove);
    const entry = history.find(e => e.game.id === id);
    history = history.filter(e => e.game.id !== id); undoEntry = null;
    if (entry && matchesFilters(entry.game, filters.platforms, filters.genre) && !queue.some(g => g.id === id)) queue.push(entry.game);
    if (saveHistory()) toast('Game removed. It may appear in Discover again.', 'undo');
    renderStats(); renderCard();
    const target = $('#collection-grid select') || $('[data-tab="all"]'); target?.focus({ preventScroll: true });
    return;
  }
  const action = event.target.closest('[data-action]');
  if (!action) return;
  switch (action.dataset.action) {
    case 'api': openApi(); break;
    case 'tutorial': $('#api-dialog').close(); $('#tutorial-dialog').showModal(); break;
    case 'tutorial-connect': $('#tutorial-dialog').close(); openApi(); break;
    case 'privacy': $('#privacy-dialog').showModal(); break;
    case 'disconnect': disconnect(); break;
    case 'reset-filters': if (!deciding) { filters = { platforms: [], genre: '' }; applyFilters(); } break;
    case 'all-platforms': if (!deciding) { filters.platforms = []; applyFilters(); } break;
    case 'shuffle': if (!deciding && !loading) { loadGames(); } break;
    case 'undo': undo(); break;
    case 'collection': collectionStatus = action.dataset.status; location.hash = 'collection'; renderCollection(); break;
    case 'clear-search': $('#collection-search').value = ''; renderCollection(); $('#collection-search').focus(); break;
    case 'toggle-currency': applyCurrencyCountry(priceClient.country === 'BR' ? 'US' : 'BR'); break;
  }
});
$('#genre').addEventListener('change', event => { if (!deciding) { filters.genre = event.target.value; applyFilters(); } });
$('#collection-search').addEventListener('input', renderCollection);
document.addEventListener('change', event => {
  const select = event.target.closest('[data-change-status]');
  if (!select) return;
  const entry = history.find(e => e.game.id === Number(select.dataset.changeStatus));
  if (!entry) return;
  history = decide(history, entry.game, select.value); undoEntry = null;
  if (saveHistory()) toast(`${entry.game.name} · ${STATUSES[select.value].label}`, STATUSES[select.value].icon);
  renderStats(); renderCard();
  const target = document.getElementById(`status-${entry.game.id}`) || $('[data-tab="all"]'); target?.focus({ preventScroll: true });
});
$('#api-form').addEventListener('submit', event => { event.preventDefault(); const key = $('#api-key').value.trim(); if (key) connect(key); });
$('#toggle-key').addEventListener('click', () => {
  const input = $('#api-key'); input.type = input.type === 'password' ? 'text' : 'password';
  $('#toggle-key').setAttribute('aria-label', input.type === 'password' ? 'Show API key' : 'Hide API key');
});
$('#api-dialog').addEventListener('close', () => {
  connectionController?.abort(); $('#api-key').value = '';
  $('#connect-button').disabled = false; $('#connect-button').innerHTML = `Connect and discover ${icon('arrow')}`;
});
$('#details-dialog').addEventListener('close', () => { detailsController?.abort(); detailsGameId = null; });
for (const dialog of $$('dialog')) dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
});
document.addEventListener('keydown', event => {
  if ($('dialog[open]') || $('#discover-view').hidden || event.target.closest('input, select, textarea, button, a, [contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey) return;
  const choice = { ArrowLeft: 'no', ArrowDown: 'played', ArrowRight: 'yes' }[event.key];
  if (choice) { event.preventDefault(); choose(choice); }
  if (event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); }
});
const card = $('#game-card');
card.addEventListener('pointerdown', event => {
  if (event.button !== 0 || loading || deciding || !queue[0] || event.target.closest('button,a')) return;
  drag = { x: event.clientX, y: event.clientY, id: event.pointerId, moved: false };
  card.setPointerCapture(event.pointerId);
});
card.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.id) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  if (Math.abs(dy) > Math.abs(dx) && !drag.moved) return;
  if (Math.abs(dx) < 7 && !drag.moved) return;
  drag.moved = true;
  card.style.transition = 'none';
  card.style.transform = `translateX(${dx * .7}px) rotate(${dx / 22}deg)`;
  const stamp = $('#swipe-stamp');
  if (stamp) { stamp.textContent = STATUSES[dx > 0 ? 'yes' : 'no'].label.toUpperCase(); stamp.style.color = dx > 0 ? 'var(--green)' : 'var(--red)'; stamp.style.opacity = Math.min(Math.abs(dx) / 100, 1); }
});
function endDrag(event, cancelled = false) {
  if (!drag || event.pointerId !== drag.id) return;
  const dx = event.clientX - drag.x;
  const moved = drag.moved;
  drag = null;
  card.style.transition = '';
  if (card.hasPointerCapture(event.pointerId)) card.releasePointerCapture(event.pointerId);
  if (!cancelled && moved && Math.abs(dx) > 75) choose(dx > 0 ? 'yes' : 'no');
  else { card.style.transform = ''; const stamp = $('#swipe-stamp'); if (stamp) stamp.style.opacity = 0; }
}
card.addEventListener('pointerup', event => endDrag(event));
card.addEventListener('pointercancel', event => endDrag(event, true));
document.addEventListener('error', event => { if (event.target instanceof HTMLImageElement) { event.target.style.visibility = 'hidden'; } }, true);
window.addEventListener('hashchange', () => { route(); window.scrollTo({ top: 0, behavior: 'instant' }); $('#main').focus({ preventScroll: true }); });
async function replaceAccountState(state) {
  stateGeneration++; deciding = false;
  connectionController?.abort(); requestController?.abort(); detailsController?.abort(); priceController?.abort();
  clearTimeout(filterTimer); clearTimeout(priceTimer); drag = null;
  client = null; genres = [...GENRES]; catalogPlatforms = []; undoEntry = null;
  history = state.history; filters = state.filters; rawgKey = state.rawg_key;
  $('#api-key').value = ''; $('#collection-search').value = '';
  if ($('#details-dialog').open) $('#details-dialog').close();
  renderFilters(); updateConnection(); renderStats(); loadGames(true);
  // A failed RAWG reconnect does not discard a valid encrypted account state.
  if (rawgKey) await connect(rawgKey, true);
}

hydrateIcons(); renderFilters(); updateConnection(); renderStats(); route(); loadGames(true);
accountUI = initAccountUI({
  getState: () => ({ v: 1, rawg_key: rawgKey, history: structuredClone(history), filters: structuredClone(filters) }),
  replaceState: replaceAccountState, toast,
});
