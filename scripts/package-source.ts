import { readdir, readFile, writeFile } from 'node:fs/promises';
import { zipSync } from 'fflate';
const files: Record<string, Uint8Array> = {};
async function collect(dir: string) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (item.isSymbolicLink()) throw Error('Source bundle refuses symbolic links');
    const name = dir + '/' + item.name;
    if (item.isDirectory()) await collect(name);
    else files[name] = new Uint8Array(await readFile(name));
  }
}
for (const dir of ['client', 'server', 'shared', 'scripts', 'tests', 'examples', 'docs'])
  await collect(dir);
for (const name of [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.config.ts',
  'vitest.config.ts',
  'playwright.config.ts',
  'index.html',
  'README.md',
  '.env.example',
  '.gitignore',
  '.replit',
  '.prettierrc.json',
  '.prettierignore',
])
  files[name] = new Uint8Array(await readFile(name));
if (
  Object.keys(files).some(
    (n) =>
      (n.startsWith('.env') && n !== '.env.example') ||
      n.startsWith('.data/') ||
      n.includes('node_modules/'),
  )
)
  throw Error('Unsafe bundle path');
const bytes = zipSync(files, { level: 6 });
await writeFile('rasd-source.zip', bytes);
console.log(
  JSON.stringify({
    archive: 'rasd-source.zip',
    files: Object.keys(files).length,
    bytes: bytes.length,
    privateRuntimeFilesIncluded: false,
  }),
);
