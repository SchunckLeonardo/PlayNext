import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { PrivateAccount, MEMORY_AUTH_OPTIONS, emptyState, cleanState, legacyChoices, removeLegacyChoices, accountMessage } from './account.js';

import { signInWithGoogle } from './oauth.js';

const $ = s => document.querySelector(s);
export function initAccountUI({ getState, replaceState, toast }) {
  const sdk = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: MEMORY_AUTH_OPTIONS,
    global: { headers: { 'X-Client-Info': 'playnext-web/2' } },
  });
  const account = new PrivateAccount(sdk);
  let busy = false, restoring = false;
  let legacy = { history: [], filters: { platforms: [], genre: '' } };
  try { legacy = cleanState(legacyChoices(localStorage)); } catch {}
  let guestState = null;
  const showError = (selector, error) => { $(selector).textContent = typeof error === 'string' ? error : accountMessage(error); $(selector).hidden = false; };
  function syncStatus() {
    const signedIn = !!account.user;
    const text = !signedIn ? 'Guest: choices stay in this tab only.' : account.error ? 'You have unsaved changes. Open My Account.' : account.pending ? 'Saving with encryption…' : 'Collection saved with encryption to your account.';
    $('#sync-note').textContent = text;
    $('#profile-sync').textContent = text;
    $('#account-label').textContent = signedIn ? 'My account' : 'Sign in';
    $('#sync-action').textContent = signedIn ? account.error ? 'View sync error' : 'Manage my account' : 'Sign in and save choices';
    $('#collection-storage-note').textContent = text;
    $('#key-storage-note').textContent = signedIn ? 'Used with RAWG and stored encrypted in your account’s Vault.' : 'As a guest, your key stays in this tab’s memory. Sign in to store it encrypted.';
    $('#retry-sync').hidden = !account.error || account.error.code === '40001';
    $('#sign-out-discard').hidden = !account.error;
    $('#sign-out').disabled = busy || account.pending > 0;
  }
  function importStatus() {
    const count = legacy.history.length + (guestState?.history.length || 0);
    $('#import-panel').hidden = !count;
    $('#legacy-visitor-note').hidden = !legacy.history.length;
    $('#import-description').textContent = `${count} previous choices are available to import. Your guest key is not imported; connect it again in this account.`;
  }
  function open() {
    $('#auth-panel').hidden = !!account.user;
    $('#profile-panel').hidden = !account.user;
    if (account.user) $('#profile-email').textContent = account.user.email || 'Your account';
    importStatus(); syncStatus();
    if (!$('#account-dialog').open) $('#account-dialog').showModal();
  }
  async function hydrate(session) {
    if (!session || restoring || account.user?.id === session.user.id) return;
    restoring = true;
    try {
      const prior = getState();
      const state = await account.open(session.user);
      guestState = prior.history.length ? { history: prior.history, filters: prior.filters } : null;
      await replaceState(state);
      $('#auth-panel').hidden = true; $('#profile-panel').hidden = false;
      $('#profile-email').textContent = session.user.email || 'Your account';
      importStatus(); syncStatus();
      toast('You’re signed in. Your collection is ready.', 'lock');
    } catch (error) {
      account.reset(); await sdk.auth.signOut({ scope: 'local' });
      showError('#auth-error', error);
    } finally { restoring = false; }
  }
  async function save() {
    if (!account.user) { syncStatus(); return; }
    const task = account.save(getState()); syncStatus();
    try { await task; $('#profile-error').hidden = true; }
    catch(error) {
      if (error.message !== 'SESSION_CHANGED') {
        showError('#profile-error', error);
        toast('You have unsaved choices. Open My Account to resolve them.', 'info');
      }
    }
    syncStatus();
  }
  async function clearSession() {
    account.reset(); guestState = null;
    await replaceState(emptyState());
    $('#profile-email').textContent = '';
    $('#delete-confirm').value = ''; $('#profile-error').hidden = true;
    $('#auth-panel').hidden = false; $('#profile-panel').hidden = true;
    syncStatus();
  }
  document.addEventListener('click', event => {
    if (event.target.closest('[data-action="account"]')) open();
  });
  $('#google-sign-in').addEventListener('click', async () => {
    if (busy || restoring) return;
    busy = true; $('#google-sign-in').disabled = true; $('#auth-error').hidden = true;
    $('#google-status').textContent = 'Complete sign-in in the Google window.';
    try { await hydrate(await signInWithGoogle(sdk)); }
    catch(error) { showError('#auth-error', error); }
    finally {
      busy = false; $('#google-sign-in').disabled = false;
      $('#google-status').textContent = 'Your choices in this tab stay here while you sign in.';
      syncStatus();
    }
  });
  $('#account-dialog').addEventListener('close', () => { $('#delete-confirm').value = ''; });
  $('#retry-sync').addEventListener('click', async () => {
    $('#retry-sync').disabled = true;
    try { await account.retry(getState()); $('#profile-error').hidden = true; }
    catch(error) { showError('#profile-error', error); }
    finally { $('#retry-sync').disabled = false; syncStatus(); }
  });
  $('#import-choices').addEventListener('click', async () => {
    if (!account.user || busy) return;
    busy = true; $('#import-choices').disabled = true;
    try {
      await account.flush();
      const state = getState(), ids = new Set(state.history.map(e=>e.game.id));
      for (const entry of [...(guestState?.history || []), ...legacy.history]) if (!ids.has(entry.game.id)) { state.history.push(entry); ids.add(entry.game.id); }
      await account.save(state);
      await replaceState(state);
      // Preserve the legacy source unless the encrypted save has succeeded.
      try { removeLegacyChoices(localStorage); } catch {}
      legacy = { history: [], filters: { platforms: [], genre: '' } }; guestState = null;
      importStatus(); toast('Choices imported and saved with encryption.', 'lock');
    } catch(error) { showError('#profile-error', error); }
    finally { busy = false; $('#import-choices').disabled = false; syncStatus(); }
  });
  $('#export-data').addEventListener('click', () => {
    const state = getState();
    // Export intentionally excludes API keys, passwords and auth tokens.
    const data = { exportedAt: new Date().toISOString(), email: account.user?.email, history: state.history, filters: state.filters };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)], {type:'application/json'}));
    const anchor = document.createElement('a'); anchor.href=url; anchor.download='playnext-my-data.json'; anchor.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('Export excludes keys and passwords.', 'lock');
  });
  $('#sign-out').addEventListener('click', async () => {
    if (busy) return; busy = true; $('#sign-out').disabled = true;
    try {
      await account.flush();
      const {error}=await sdk.auth.signOut({scope:'local'}); if(error) throw error;
      await clearSession(); $('#account-dialog').close(); toast('You signed out. This account’s data was cleared from memory.', 'lock');
    } catch(error) { showError('#profile-error', error); }
    finally { busy = false; syncStatus(); }
  });
  $('#sign-out-discard').addEventListener('click', async () => {
    if (busy || !account.error) return;
    busy = true; $('#sign-out-discard').disabled = true;
    try {
      await account.tail;
      const {error}=await sdk.auth.signOut({scope:'local'}); if(error) throw error;
      await clearSession(); $('#account-dialog').close(); toast('You signed out. Unsaved changes were discarded.', 'lock');
    } catch(error) { showError('#profile-error', error); }
    finally { busy = false; $('#sign-out-discard').disabled = false; syncStatus(); }
  });
  $('#delete-account').addEventListener('click', async () => {
    if (busy) return;
    if ($('#delete-confirm').value !== 'DELETE') { showError('#profile-error','Type DELETE to confirm deletion of your PlayNext data.'); return; }
    busy = true; $('#delete-account').disabled = true;
    try {
      await account.tail;
      const {error}=await sdk.rpc('playnext_delete_account'); if(error) throw error;
      await sdk.auth.signOut({scope:'local'}); await clearSession(); $('#account-dialog').close();
      toast('PlayNext data removed from the active database.', 'trash');
    } catch(error) { showError('#profile-error', error); }
    finally { busy = false; $('#delete-account').disabled = false; syncStatus(); }
  });
  sdk.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' && account.user && !busy) setTimeout(clearSession,0);
  });
  window.addEventListener('beforeunload', event => {
    if (account.pending || account.error) { event.preventDefault(); event.returnValue = ''; }
  });
  sdk.auth.getSession().then(async ({data,error}) => {
    if(error) { showError('#auth-error',error); return; }
    if(data.session) await hydrate(data.session);
  });
  syncStatus();
  return { save, open, get signedIn() { return !!account.user; } };
}
