import { readdir, readFile, mkdir, writeFile, rm, copyFile } from 'node:fs/promises';
import { resolve, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const publicRoot = resolve(root, 'public');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const files = {};
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else {
      const type = types[extname(entry.name)];
      if (!type) throw new Error(`Tipo de asset não suportado: ${entry.name}`);
      files['/' + relative(publicRoot, path).replaceAll('\\', '/')] = { type, body: await readFile(path, 'utf8') };
    }
  }
}
await collect(publicRoot);
const proxy = await readFile(resolve(root, 'worker/rawg-proxy.js'), 'utf8');
const worker = (await readFile(resolve(root, 'worker/index.js'), 'utf8')).replace(/^import .*;\n/m, '');
const source = `const STATIC_FILES = ${JSON.stringify(files)};\n${proxy}\n${worker}`;
// Retain all sources in public/ and replace only generated deployment output.
await rm(resolve(root, 'dist'), { recursive: true, force: true });
await mkdir(resolve(root, 'dist/server'), { recursive: true });
await mkdir(resolve(root, 'dist/.openai'), { recursive: true });
await writeFile(resolve(root, 'dist/server/index.js'), source);
await copyFile(resolve(root, '.openai/hosting.json'), resolve(root, 'dist/.openai/hosting.json'));
console.log(`Built Worker ESM: ${Object.keys(files).length} assets + RAWG transport`);
