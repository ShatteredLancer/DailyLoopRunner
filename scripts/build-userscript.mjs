import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'src', 'userscript-entry.js');
const outputPaths = [
  path.join(root, 'DailyLoopRunner.user.js'),
  path.join(root, 'dist', 'DailyLoopRunner.user.js'),
];
const source = (await readFile(sourcePath, 'utf8')).replace(/^\uFEFF/, '');
const metadataMatch = source.match(/^(\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==)\s*/);

if (!metadataMatch) throw new Error('Userscript metadata block not found');

const metadata = metadataMatch[1];
const body = source.slice(metadataMatch[0].length);
const version = metadata.match(/^\/\/ @version\s+(.+)$/m)?.[1]?.trim();

if (!version) throw new Error('Userscript @version not found');

const result = await build({
  stdin: {
    contents: body,
    resolveDir: path.dirname(sourcePath),
    sourcefile: 'userscript-entry.js',
    loader: 'js',
  },
  bundle: true,
  target: 'chrome120',
  format: 'iife',
  legalComments: 'none',
  sourcemap: false,
  minify: false,
  write: false,
});

const output = `${metadata}\n\n${result.outputFiles[0].text}`;
for (const outputPath of outputPaths) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output, 'utf8');
}
console.log(`Built DailyLoopRunner.user.js and dist/DailyLoopRunner.user.js v${version}`);
