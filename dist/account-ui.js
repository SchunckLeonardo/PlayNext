import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, PUBLIC_EMAIL_READY } from './config.js';
import { PrivateAccount, MEMORY_AUTH_OPTIONS, emptyState, cleanState, legacyChoices, removeLegacyChoices, accountMessage } from './account.js';

const $ = s => document.querySelector(s);
export function initAccountUI({ getState, replaceState, toast }) {
  const sdk = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: MEMORY_AUTH_OPTIONS,
    global: { headers: { 'X-Client-Info': 'playnext-web/2' } },
  });
  const account = new PrivateAccount(sdk);
  let mode = 'login', busy = false, recovery = false, restoring = false;
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
  function authMode(next) {
    mode = next;
    const reset = next === 'reset', change = next === 'password';
    $('#auth-email').disabled = change;
    $('#password-field').hidden = reset;
    $('#auth-password').required = !reset;
    $('#auth-password').autocomplete = next === 'signup' || change ? 'new-password' : 'current-password';
    $('#auth-password').minLength = next === 'login' ? 1 : 8;
    $('#auth-password').value = '';
    $('#auth-password').type = 'password';
    $('#toggle-password').setAttribute('aria-label','Mostrar senha');
    $('#auth-submit').textContent = reset ? 'Enviar recuperação por e-mail' : change ? 'Salvar nova senha' : next === 'signup' ? 'Criar minha conta' : 'Entrar e continuar';
    $('#email-setup-note').hidden = PUBLIC_EMAIL_READY || (!reset && next !== 'signup');
    $('#auth-submit').disabled = !PUBLIC_EMAIL_READY && (reset || next === 'signup');
    $('#auth-help').textContent = reset ? 'Enviaremos um link para você abrir no navegador e escolher uma nova senha.' : next === 'signup' ? 'Use pelo menos 8 caracteres. Confirme o e-mail enviado pelo Supabase para ativar sua conta.' : change ? 'Escolha uma nova senha com pelo menos 8 caracteres.' : 'Sua sessão fica apenas nesta aba. Ao recarregar, entre novamente.';
    $('#auth-error').hidden = true; $('#auth-success').hidden = true;
    document.querySelectorAll('[data-auth-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.authMode === next)));
    $('#auth-email').focus();
  }
  function open() {
    $('#auth-panel').hidden = !!account.user && !recovery;
    $('#profile-panel').hidden = !account.user || recovery;
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
      $('#auth-password').value = '';
      $('#auth-panel').hidden = true; $('#profile-panel').hidden = false;
      $('#profile-email').textContent = session.user.email || 'Sua conta';
      $('#auth-email').value = session.user.email || '';
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
    account.reset(); guestState = null; recovery = false;
    await replaceState(emptyState());
    $('#profile-email').textContent = ''; $('#auth-email').value = ''; $('#auth-password').value = '';
    $('#delete-confirm').value = ''; $('#profile-error').hidden = true;
    $('#auth-panel').hidden = false; $('#profile-panel').hidden = true;
    authMode('login'); syncStatus();
  }
  document.addEventListener('click', event => {
    const modeButton = event.target.closest('[data-auth-mode]');
    if (modeButton && !busy) authMode(modeButton.dataset.authMode);
    if (event.target.closest('[data-action="account"]')) open();
  });
  $('#auth-form').addEventListener('submit', async event => {
    event.preventDefault(); if (busy || restoring || (!PUBLIC_EMAIL_READY && ['signup','reset'].includes(mode))) return;
    busy = true; $('#auth-submit').disabled = true; $('#auth-error').hidden = true; $('#auth-success').hidden = true;
    const email = $('#auth-email').value.trim(), password = $('#auth-password').value;
    const redirectTo = location.origin + location.pathname;
    try {
      if (mode === 'login') {
        const { data, error } = await sdk.auth.signInWithPassword({ email, password });
        if (error) throw error; await hydrate(data.session);
      } else if (mode === 'signup') {
        const { data, error } = await sdk.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        if (data.session) await hydrate(data.session);
        else { $('#auth-success').textContent = 'Confira seu e-mail para confirmar o cadastro. Depois, volte aqui e entre com sua senha. Se já tem conta, use Entrar.'; $('#auth-success').hidden = false; }
      } else if (mode === 'reset') {
        const { error } = await sdk.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        $('#auth-success').textContent = 'Se existir uma conta com este e-mail, você receberá as instruções de recuperação.'; $('#auth-success').hidden = false;
      } else {
        const { error } = await sdk.auth.updateUser({ password }); if (error) throw error;
        recovery = false; open(); toast('Senha atualizada.', 'lock');
      }
    } catch(error) { showError('#auth-error', error); }
    finally { $('#auth-password').value = ''; busy = false; $('#auth-submit').disabled = false; syncStatus(); }
  });
  $('#toggle-password').addEventListener('click', () => {
    const input = $('#auth-password'); input.type = input.type === 'password' ? 'text' : 'password';
    $('#toggle-password').setAttribute('aria-label', input.type === 'password' ? 'Mostrar senha' : 'Ocultar senha');
  });
  $('#account-dialog').addEventListener('close', () => { $('#auth-password').value = ''; $('#delete-confirm').value = ''; });
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
    if ($('#delete-confirm').value !== 'EXCLUIR') { showError('#profile-error','Digite EXCLUIR para confirmar a exclusão da sua conta e dos seus dados.'); return; }
    busy = true; $('#delete-account').disabled = true;
    try {
      await account.tail;
      const {error}=await sdk.rpc('playnext_delete_account'); if(error) throw error;
      await sdk.auth.signOut({scope:'local'}); await clearSession(); $('#account-dialog').close();
      toast('Conta e dados removidos do banco ativo.', 'trash');
    } catch(error) { showError('#profile-error', error); }
    finally { busy = false; $('#delete-account').disabled = false; syncStatus(); }
  });
  sdk.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      recovery = true;
      setTimeout(async()=> { await hydrate(session); authMode('password'); open(); }, 0);
    }
    if (event === 'SIGNED_OUT' && account.user && !busy) setTimeout(clearSession,0);
  });
  window.addEventListener('beforeunload', event => {
    if (account.pending || account.error) { event.preventDefault(); event.returnValue = ''; }
  });
  sdk.auth.getSession().then(async ({data,error}) => {
    if(error) { showError('#auth-error',error); return; }
    if(data.session && !recovery) await hydrate(data.session);
  });
  syncStatus();
  return { save, open, get signedIn() { return !!account.user; } };
}
