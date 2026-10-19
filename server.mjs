import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ItadPriceService, handlePriceApiRequest } from './dist/prices.js';

const root = resolve('dist');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png' };

export function createAppServer({ directory = root, priceService = new ItadPriceService() } = {}) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      if (pathname === '/api/prices') {
        await handlePriceApiRequest(req, res, priceService);
        return;
      }
      if (req.method !== 'GET') {
        res.writeHead(405, { Allow: 'GET', 'Cache-Control': 'no-store' }).end();
        return;
      }
      const path = resolve(directory, '.' + pathname);
      if (path !== directory && !path.startsWith(directory + sep)) { res.writeHead(403).end(); return; }
      const file = path === directory ? resolve(directory, 'index.html') : path;
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).end(body);
    } catch { res.writeHead(404).end('Not found'); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = createAppServer();
  server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log(`PlayNext: http://127.0.0.1:${server.address().port}`));
}

