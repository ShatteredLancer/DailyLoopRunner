import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (await readFile(path.join(root, 'src', 'userscript-entry.js'), 'utf8')).replace(/^\uFEFF/, '');
const rootBuild = await readFile(path.join(root, 'DailyLoopRunner.user.js'), 'utf8');
const built = await readFile(path.join(root, 'dist', 'DailyLoopRunner.user.js'), 'utf8');
const metadataPattern = /^(\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==)/;
const sourceMetadata = source.match(metadataPattern)?.[1];
const builtMetadata = built.match(metadataPattern)?.[1];

if (!sourceMetadata || !builtMetadata) throw new Error('Userscript metadata block missing from source or dist');
if (sourceMetadata !== builtMetadata) throw new Error('dist userscript metadata differs from source');
if (rootBuild !== built) throw new Error('root compatibility userscript differs from dist output');

const sourceVersion = sourceMetadata.match(/^\/\/ @version\s+(.+)$/m)?.[1]?.trim();
const builtVersion = builtMetadata.match(/^\/\/ @version\s+(.+)$/m)?.[1]?.trim();
if (!sourceVersion || sourceVersion !== builtVersion) throw new Error('dist userscript version differs from source');

console.log(`Verified root/dist userscript equality, metadata, and version ${builtVersion}`);
