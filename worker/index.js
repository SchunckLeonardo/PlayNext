import { handleRawgProxy } from './rawg-proxy.js';

export default {
  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/rawg') return handleRawgProxy(request);
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Método não permitido', { status: 405 });
    const path = pathname === '/' ? '/index.html' : pathname;
    if (!Object.hasOwn(STATIC_FILES, path)) return new Response('Não encontrado', { status: 404 });
    const file = STATIC_FILES[path];
    return new Response(request.method === 'HEAD' ? null : file.body, { headers: { 'Content-Type': file.type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  },
};
