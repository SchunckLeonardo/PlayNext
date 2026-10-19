import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { MEMORY_AUTH_OPTIONS } from './account.js';

const status = document.querySelector('#callback-status');
if (!new URL(location.href).searchParams.has('waiting')) {
  const sdk = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: MEMORY_AUTH_OPTIONS });
  const { data, error } = await sdk.auth.getSession();
  // Auth tokens and provider errors never remain in the browser address/history.
  window.history.replaceState(null, '', location.pathname);
  if (!window.opener || window.opener.closed) {
    status.textContent = 'Abra o PlayNext e clique em Entrar com Google para continuar.';
  } else {
    const session = data.session;
    window.opener.postMessage(error || !session
      ? { type: 'playnext:oauth-result', error: 'oauth_cancelled' }
      : { type: 'playnext:oauth-result', access_token: session.access_token, refresh_token: session.refresh_token }, location.origin);
    status.textContent = error || !session ? 'A entrada não foi concluída. Volte ao PlayNext para tentar novamente.' : 'Login recebido. Você pode voltar ao PlayNext.';
  }
  await sdk.auth.stopAutoRefresh();
}
