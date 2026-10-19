import { SUPABASE_URL } from './config.js';

export const GOOGLE_CALLBACK_PATH = '/auth-callback.html';
const failure = code => Object.assign(new Error(code), { code });

// A popup keeps guest choices and the RAWG key in memory while Google handles login.
export async function signInWithGoogle(client, browser = window) {
  const origin = browser.location.origin;
  const redirectTo = origin + GOOGLE_CALLBACK_PATH;
  const popup = browser.open(redirectTo + '?waiting=1', '_blank', 'popup,width=520,height=700');
  if (!popup) throw failure('popup_blocked');
  let url;
  try {
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    url = new URL(data.url);
    if (url.origin !== new URL(SUPABASE_URL).origin || url.pathname !== '/auth/v1/authorize'
      || url.searchParams.get('provider') !== 'google') throw failure('invalid_oauth_destination');
  } catch (error) { popup.close(); throw error; }

  return new Promise((resolve, reject) => {
    let processing = false;
    const finish = (error, session) => {
      browser.clearInterval(closed); browser.clearTimeout(timeout);
      browser.removeEventListener('message', receive); popup.close();
      error ? reject(error) : resolve(session);
    };
    const receive = async event => {
      if (event.origin !== origin || event.source !== popup || processing || event.data?.type !== 'playnext:oauth-result') return;
      processing = true;
      const { access_token, refresh_token, error } = event.data;
      if (error || typeof access_token !== 'string' || typeof refresh_token !== 'string'
        || access_token.length > 16384 || refresh_token.length > 4096) { finish(failure('oauth_cancelled')); return; }
      try {
        // setSession validates the Supabase session with Auth before private RPCs run.
        const result = await client.auth.setSession({ access_token, refresh_token });
        if (result.error) throw result.error;
        if (!result.data.session) throw failure('oauth_invalid_session');
        finish(null, result.data.session);
      } catch (err) { finish(err); }
    };
    const closed = browser.setInterval(() => { if (popup.closed && !processing) finish(failure('oauth_cancelled')); }, 500);
    const timeout = browser.setTimeout(() => finish(failure('oauth_timeout')), 300000);
    browser.addEventListener('message', receive);
    popup.location.href = url.href;
  });
}
