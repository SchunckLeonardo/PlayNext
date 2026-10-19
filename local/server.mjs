import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localSettings } from './config.mjs';
import { ItadPriceService, handlePriceApiRequest } from '../dist/prices.js';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
export function createLocalServer(settings, directory = resolve('dist'), priceService = new ItadPriceService({ apiKey: settings?.itadApiKey })) {
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const host = new URL('http://' + req.headers.host);
      if (!['127.0.0.1', 'localhost'].includes(host.hostname)) { res.writeHead(403).end(); return; }
      const path = decodeURIComponent(new URL(req.url, host).pathname);
      if (path === '/api/prices') { await handlePriceApiRequest(req, res, priceService); return; }
      if (req.method !== 'GET') { res.writeHead(405).end(); return; }
      if (path === '/__local/health') { res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ local: true, api: settings.api, prices: priceService.status() })); return; }
      if (path === '/__local/test-user') {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ email: settings.email, password: settings.password })); return;
      }
      if (path === '/config.js') {
        res.writeHead(200, { 'Content-Type': types['.js'] }).end(`export const SUPABASE_URL=${JSON.stringify(settings.api)};\nexport const SUPABASE_PUBLISHABLE_KEY=${JSON.stringify(settings.key)};\n`); return;
      }
      if (path === '/oauth.js') {
        res.writeHead(200, { 'Content-Type': types['.js'] }).end(await readFile(new URL('./oauth.js', import.meta.url))); return;
      }
      const file = path === '/' ? resolve(directory, 'index.html') : resolve(directory, '.' + path);
      if (!file.startsWith(directory + sep)) { res.writeHead(403).end(); return; }
      let body = await readFile(file);
      if (file === resolve(directory, 'index.html')) {
        body = body.toString().replace('<body>', '<body><aside style="position:sticky;top:0;z-index:99;background:#ffd166;color:#171717;padding:10px;text-align:center;font:600 13px sans-serif" role="note">LOCAL ENVIRONMENT · Synthetic test account · Data isolated from production</aside>')
          .replace('Use your Google account to take your collection with you.', 'Use the registered synthetic account to test your local collection.')
          .replace('sign in with Google again after reloading.', 'sign in again with the test account after reloading.')
          .replace('Sign in with Google</span>', 'Sign in with local test account</span>')
          .replace('Google verifies your identity. PlayNext receives your email and basic profile.', 'This test uses a synthetic account in local Supabase. It does not exercise production Google sign-in.');
      }
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(body);
    } catch { res.writeHead(404).end('Not found'); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = createLocalServer(localSettings(process.env));
  server.listen(4173, '0.0.0.0', () => console.log('PlayNext local: http://127.0.0.1:4173 (synthetic account)'));
}
