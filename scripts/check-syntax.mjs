import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
let count = 0;
for (const directory of ['dist', 'local', 'scripts', 'tests']) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isFile() && /\.m?js$/.test(entry.name)) {
      execFileSync(process.execPath, ['--check', resolve(directory, entry.name)], { stdio: 'pipe' }); count++;
    }
  }
}
console.log(`Syntax checked: ${count} JavaScript modules.`);
