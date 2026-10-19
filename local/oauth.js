// Development-only adapter, served by local/server.mjs; never copied to dist/.
export async function signInWithGoogle(client, browser = window) {
  if (!['127.0.0.1', 'localhost'].includes(browser.location.hostname) || browser.location.protocol !== 'http:') {
    throw new Error('The synthetic account is restricted to local development.');
  }
  document.querySelector('#google-status').textContent = 'Connecting to the local test account…';
  const response = await fetch('/__local/test-user', { cache: 'no-store' });
  if (!response.ok) throw new Error('Local test account unavailable.');
  const credentials = await response.json();
  const { data, error } = await client.auth.signInWithPassword(credentials);
  if (error) throw error;
  return data.session;
}
