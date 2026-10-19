export const LOCAL_PROJECT = 'playnext-local';
export const SUPABASE_CLI_VERSION = '2.121.0';
export const TEST_EMAIL = 'qa@playnext.test';

export function assertLoopback(value, port) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)
    || (port && url.port !== String(port)) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Only the isolated loopback development service is allowed.');
  }
  return url.origin;
}

export function localSettings(env) {
  const api = assertLoopback(env.LOCAL_API_URL, 54321);
  if (env.LOCAL_TEST_EMAIL !== TEST_EMAIL || !env.LOCAL_TEST_PASSWORD || !env.LOCAL_PUBLISHABLE_KEY) {
    throw new Error('Run npm run local:up to prepare the local test account.');
  }
  return { api, key: env.LOCAL_PUBLISHABLE_KEY, email: TEST_EMAIL, password: env.LOCAL_TEST_PASSWORD };
}
