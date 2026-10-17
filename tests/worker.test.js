import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import worker from '../dist/server/index.js';

test('Worker preserves every existing HTML, stylesheet, module and icon without stale caching', async () => {
  const files = await readdir(new URL('../public/', import.meta.url), { recursive: true });
  for (const path of files.filter(path => /\.(?:html|css|js|svg)$/.test(path))) {
    const response = await worker.fetch(new Request(`https://playnext.example/${path}`));
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(await response.text(), await readFile(new URL('../public/' + path, import.meta.url), 'utf8'));
  }
  assert.match(await (await worker.fetch(new Request('https://playnext.example/'))).text(), /PlayNext/);
  assert.equal((await worker.fetch(new Request('https://playnext.example/missing'))).status, 404);
  assert.equal((await worker.fetch(new Request('https://playnext.example/', { method: 'POST' }))).status, 405);
  assert.equal(await (await worker.fetch(new Request('https://playnext.example/', { method: 'HEAD' }))).text(), '');
});
