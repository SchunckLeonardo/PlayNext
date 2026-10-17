import { createServer } from 'node:http';
import worker from './dist/server/index.js';

const server = createServer(async (req, res) => {
  try {
    const request = new Request(new URL(req.url, `http://${req.headers.host}`), {
      method: req.method, headers: req.headers,
      ...(!['GET', 'HEAD'].includes(req.method) ? { body: req, duplex: 'half' } : {}),
    });
    const response = await worker.fetch(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500, { 'Cache-Control': 'no-store' }).end('Não foi possível concluir a consulta.'); }
});
server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log(`PlayNext: http://127.0.0.1:${server.address().port}`));
