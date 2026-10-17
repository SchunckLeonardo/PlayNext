const ENDPOINTS = /^(?:platforms|genres|games|games\/[1-9]\d*)$/;
const PARAMS = new Set(['page', 'page_size', 'platforms', 'genres', 'ordering', 'dates']);
const MAX_BODY_BYTES = 8192;
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

export async function handleRawgProxy(request, upstreamFetch = (...args) => globalThis.fetch(...args)) {
  if (request.method !== 'POST') return json({ error: 'Use POST para consultar a RAWG.' }, 405);
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'Origem não permitida.' }, 403);
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') return json({ error: 'Envie JSON.' }, 415);
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) return json({ error: 'Requisição muito grande.' }, 413);
  let input;
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'Requisição vazia.' }, 400);
    const chunks = []; let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) { await reader.cancel(); return json({ error: 'Requisição muito grande.' }, 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    input = JSON.parse(new TextDecoder().decode(bytes));
  } catch { return json({ error: 'Requisição inválida.' }, 400); }
  if (!input || typeof input.key !== 'string' || !input.key.trim() || input.key.length > 256 || typeof input.path !== 'string' || !ENDPOINTS.test(input.path)) return json({ error: 'Chave ou consulta inválida.' }, 400);
  const params = input.params ?? {};
  if (!params || typeof params !== 'object' || Array.isArray(params) || Object.entries(params).some(([key, value]) => !PARAMS.has(key) || !['string', 'number'].includes(typeof value) || String(value).length > 300)) return json({ error: 'Filtros inválidos.' }, 400);
  const key = input.key.trim();
  const target = new URL(input.path, 'https://api.rawg.io/api/');
  target.search = new URLSearchParams({ ...params, key });
  try {
    const upstream = await upstreamFetch(target.href, { headers: { Accept: 'application/json' }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!upstream.ok) {
      const status = [400, 401, 403, 404, 429].includes(upstream.status) ? upstream.status : 502;
      return json({ error: status === 401 || status === 403 ? 'A RAWG não aceitou esta chave.' : status === 429 ? 'Limite da RAWG atingido.' : 'A RAWG não conseguiu concluir a consulta.' }, status);
    }
    const data = await upstream.json();
    // RAWG pagination URLs contain the key; the client only needs page availability.
    if (data && typeof data === 'object') for (const field of ['next', 'previous']) if (typeof data[field] === 'string') data[field] = Boolean(data[field]);
    // The key is request-scoped: never store, cache, log or echo it.
    const body = JSON.stringify(data, (_field, value) => typeof value === 'string' ? value.replaceAll(key, '[redacted]') : value);
    return new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    const message = String(error?.message || '');
    const code = /Illegal invocation/i.test(message) ? 'RAWG_FETCH_CONTEXT' : /AbortSignal|not a function/i.test(message) ? 'RAWG_RUNTIME_COMPATIBILITY' : /not allowed|blocked|policy|permission/i.test(message) ? 'RAWG_UPSTREAM_POLICY' : 'RAWG_UPSTREAM_CONNECTION';
    return json({ error: error?.name === 'TimeoutError' ? 'A RAWG demorou para responder.' : 'Não foi possível acessar a RAWG neste momento.', code }, error?.name === 'TimeoutError' ? 504 : 502);
  }
}
