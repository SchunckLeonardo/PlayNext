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
    const text = !signedIn ? 'Visitante: escolhas apenas nesta aba.' : account.error ? 'Há alterações não salvas. Abra Minha conta.' : account.pending ? 'Salvando com criptografia…' : 'Coleção salva com criptografia na sua conta.';
    $('#sync-note').textContent = text;
    $('#profile-sync').textContent = text;
    $('#account-label').textContent = signedIn ? 'Minha conta' : 'Entrar';
    $('#sync-action').textContent = signedIn ? account.error ? 'Ver erro de sincronização' : 'Gerenciar minha conta' : 'Entrar e salvar escolhas';
    $('#collection-storage-note').textContent = text;
    $('#key-storage-note').textContent = signedIn ? 'Usada com a RAWG e guardada criptografada no Vault da sua conta.' : 'Como visitante, sua chave fica só na memória desta aba. Entre para guardá-la criptografada.';
    $('#retry-sync').hidden = !account.error || account.error.code === '40001';
    $('#sign-out-discard').hidden = !account.error;
    $('#sign-out').disabled = busy || account.pending > 0;
  }
  function importStatus() {
    const count = legacy.history.length + (guestState?.history.length || 0);
    $('#import-panel').hidden = !count;
    $('#legacy-visitor-note').hidden = !legacy.history.length;
    $('#import-description').textContent = `${count} escolhas anteriores disponíveis para importar. Sua chave de visitante não é importada; conecte-a novamente nesta conta.`;
  }
  function open() {
    $('#auth-panel').hidden = !!account.user;
    $('#profile-panel').hidden = !account.user;
    if (account.user) $('#profile-email').textContent = account.user.email || 'Sua conta';
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
      $('#profile-email').textContent = session.user.email || 'Sua conta';
      importStatus(); syncStatus();
      toast('Você entrou. Sua coleção está pronta.', 'lock');
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
        toast('Há escolhas não salvas. Abra Minha conta para resolver.', 'info');
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
    $('#google-status').textContent = 'Conclua a entrada na janela do Google.';
    try { await hydrate(await signInWithGoogle(sdk)); }
    catch(error) { showError('#auth-error', error); }
    finally {
      busy = false; $('#google-sign-in').disabled = false;
      $('#google-status').textContent = 'Suas escolhas desta aba continuam aqui durante a entrada.';
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
      importStatus(); toast('Escolhas importadas e salvas com criptografia.', 'lock');
    } catch(error) { showError('#profile-error', error); }
    finally { busy = false; $('#import-choices').disabled = false; syncStatus(); }
  });
  $('#export-data').addEventListener('click', () => {
    const state = getState();
    // Export intentionally excludes API keys, passwords and auth tokens.
    const data = { exportedAt: new Date().toISOString(), email: account.user?.email, history: state.history, filters: state.filters };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)], {type:'application/json'}));
    const anchor = document.createElement('a'); anchor.href=url; anchor.download='playnext-meus-dados.json'; anchor.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('Exportação sem chaves ou senhas.', 'lock');
  });
  $('#sign-out').addEventListener('click', async () => {
    if (busy) return; busy = true; $('#sign-out').disabled = true;
    try {
      await account.flush();
      const {error}=await sdk.auth.signOut({scope:'local'}); if(error) throw error;
      await clearSession(); $('#account-dialog').close(); toast('Você saiu. Dados desta conta removidos da memória.', 'lock');
    } catch(error) { showError('#profile-error', error); }
    finally { busy = false; syncStatus(); }
  });
  $('#sign-out-discard').addEventListener('click', async () => {
    if (busy || !account.error) return;
    busy = true; $('#sign-out-discard').disabled = true;
    try {
      await account.tail;
      const {error}=await sdk.auth.signOut({scope:'local'}); if(error) throw error;
      await clearSession(); $('#account-dialog').close(); toast('Você saiu. Alterações não salvas foram descartadas.', 'lock');
    } catch(error) { showError('#profile-error', error); }
    finally { busy = false; $('#sign-out-discard').disabled = false; syncStatus(); }
  });
  $('#delete-account').addEventListener('click', async () => {
    if (busy) return;
    if ($('#delete-confirm').value !== 'EXCLUIR') { showError('#profile-error','Digite EXCLUIR para confirmar a exclusão dos seus dados do PlayNext.'); return; }
    busy = true; $('#delete-account').disabled = true;
    try {
      await account.tail;
      const {error}=await sdk.rpc('playnext_delete_account'); if(error) throw error;
      await sdk.auth.signOut({scope:'local'}); await clearSession(); $('#account-dialog').close();
      toast('Dados do PlayNext removidos do banco ativo.', 'trash');
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
