import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localSettings } from './config.mjs';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
export function createLocalServer(settings, directory = resolve('dist')) {
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const host = new URL('http://' + req.headers.host);
      if (!['127.0.0.1', 'localhost'].includes(host.hostname)) { res.writeHead(403).end(); return; }
      if (req.method !== 'GET') { res.writeHead(405).end(); return; }
      const path = decodeURIComponent(new URL(req.url, host).pathname);
      if (path === '/__local/health') { res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ local: true, api: settings.api })); return; }
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
        body = body.toString().replace('<body>', '<body><aside style="position:sticky;top:0;z-index:99;background:#ffd166;color:#171717;padding:10px;text-align:center;font:600 13px sans-serif" role="note">AMBIENTE LOCAL · Conta sintética de teste · Dados isolados da produção</aside>')
          .replace('Use sua conta Google para levar a coleção com você.', 'Use a conta sintética registrada para testar sua coleção local.')
          .replace('ao recarregar, entre com Google novamente.', 'ao recarregar, entre novamente com a conta de teste.')
          .replace('Entrar com Google</span>', 'Entrar com conta de teste local</span>')
          .replace('O Google confirma sua identidade. O PlayNext recebe seu e-mail e perfil básico.', 'Este teste usa uma conta sintética no Supabase local. O login Google de produção não é exercitado por essa conta.');
      }
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(body);
    } catch { res.writeHead(404).end('Não encontrado'); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = createLocalServer(localSettings(process.env));
  server.listen(4173, '0.0.0.0', () => console.log('PlayNext local: http://127.0.0.1:4173 (conta sintética)'));
}
