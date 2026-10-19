import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function verifyVendor(root = resolve('.')) {
  const json = async name => JSON.parse(await readFile(resolve(root, name), 'utf8'));
  const [app, lock, installed] = await Promise.all([json('package.json'), json('package-lock.json'), json('node_modules/@supabase/supabase-js/package.json')]);
  const version = '2.118.0';
  const sha = 'ee3be8de192b97cb1d73d1e95d6b82bb1f6b658c0f97c4ef757fc331996ed3d3';
  if (app.dependencies?.['@supabase/supabase-js'] !== version || installed.version !== version || lock.packages?.['node_modules/@supabase/supabase-js']?.version !== version) {
    throw new Error('The declared, locked and bundled Supabase versions must match.');
  }
  for (const component of ['auth', 'functions', 'postgrest', 'realtime', 'storage']) {
    if (lock.packages?.[`node_modules/@supabase/${component}-js`]?.version !== version) throw new Error('Missing or divergent transitive SDK component: ' + component);
  }
  for (const name of ['dist/vendor/supabase-2.118.0.js', 'node_modules/@supabase/supabase-js/dist/umd/supabase.js']) {
    if (createHash('sha256').update(await readFile(resolve(root, name))).digest('hex') !== sha) throw new Error('Supabase bundle integrity mismatch: ' + name);
  }
  return 'Vendored SDK matches the locked npm package and its five Supabase components.';
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) console.log(await verifyVendor());
