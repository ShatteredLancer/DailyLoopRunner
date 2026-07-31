import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (await readFile(path.join(root, 'src', 'userscript-entry.js'), 'utf8')).replace(/^\uFEFF/, '');
const rootBuild = await readFile(path.join(root, 'DailyLoopRunner.user.js'), 'utf8');
const built = await readFile(path.join(root, 'dist', 'DailyLoopRunner.user.js'), 'utf8');
const meta = await readFile(path.join(root, 'dist', 'DailyLoopRunner.meta.js'), 'utf8');
const packageInfo = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const packageLock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
const metadataPattern = /^(\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==)/;
const sourceMetadata = source.match(metadataPattern)?.[1];
const builtMetadata = built.match(metadataPattern)?.[1];

if (!sourceMetadata || !builtMetadata) throw new Error('Userscript metadata block missing from source or dist');
const packageVersion = String(packageInfo.version || '').trim();
const expectedMetadata = sourceMetadata.replace(
  /^\/\/ @version\s+__DLR_VERSION__$/m,
  `// @version      ${packageVersion}`,
);
if (expectedMetadata !== builtMetadata) throw new Error('dist userscript metadata differs from the versioned source template');
if (rootBuild !== built) throw new Error('root compatibility userscript differs from dist output');
if (meta !== `${builtMetadata}\n`) throw new Error('dist userscript meta file differs from the full userscript metadata');

const builtVersion = builtMetadata.match(/^\/\/ @version\s+(.+)$/m)?.[1]?.trim();
if (!builtVersion || builtVersion !== packageVersion) throw new Error('dist userscript version differs from package.json');
if (packageLock.version !== packageVersion || packageLock.packages?.['']?.version !== packageVersion) {
  throw new Error('package-lock.json root version differs from package.json');
}

function metadataValue(key) {
  return builtMetadata.match(new RegExp(`^// @${key}\\s+(.+)$`, 'm'))?.[1]?.trim() || '';
}

const expectedFields = {
  name: 'FC26 Daily Loop Runner',
  namespace: 'https://github.com/ShatteredLancer/DailyLoopRunner',
  homepageURL: 'https://github.com/ShatteredLancer/DailyLoopRunner',
  supportURL: 'https://github.com/ShatteredLancer/DailyLoopRunner/issues',
  updateURL: 'https://github.com/ShatteredLancer/DailyLoopRunner/releases/latest/download/DailyLoopRunner.meta.js',
  downloadURL: 'https://github.com/ShatteredLancer/DailyLoopRunner/releases/latest/download/DailyLoopRunner.user.js',
  license: 'MIT',
};
for (const [key, expected] of Object.entries(expectedFields)) {
  if (metadataValue(key) !== expected) throw new Error(`userscript metadata @${key} is not production-ready`);
}
for (const host of ['127.0.0.1', 'localhost']) {
  if (builtMetadata.includes(`// @connect      ${host}`)) throw new Error(`production userscript must not connect to ${host}`);
}

console.log(`Verified root/dist userscript equality, metadata, and version ${builtVersion}`);
