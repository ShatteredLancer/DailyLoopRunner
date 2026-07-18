import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'src', 'userscript-entry.js'), 'utf8');
const rules = [
  { name: 'workflow Pack Adapter.open', regex: /\bpackAdapter\.open\s*\(/g, expected: 1 },
  { name: 'workflow direct pack model.open', regex: /\b(?:currentPack|selectedPack|pack)\.open\s*\(/g, expected: 0 },
  { name: 'workflow SBC.saveChallenge', regex: /\bW\.services\.SBC\.saveChallenge\s*\(/g, expected: 0 },
  { name: 'workflow SBC.submitChallenge', regex: /\bW\.services\.SBC\.submitChallenge\s*\(/g, expected: 0 },
];

let failed = false;
for (const rule of rules) {
  const count = source.match(rule.regex)?.length || 0;
  console.log(`${rule.name}: ${count} direct call site(s), baseline ${rule.expected}`);
  if (process.argv.includes('--check') && count !== rule.expected) failed = true;
}
const packAdapter = await readFile(path.join(root, 'src', 'adapters', 'ea', 'pack.js'), 'utf8');
const packAdapterOpenCount = packAdapter.match(/\bpack\.open\s*\(/g)?.length || 0;
console.log(`Pack Adapter pack.open: ${packAdapterOpenCount} direct call site(s), baseline 1`);
if (process.argv.includes('--check') && packAdapterOpenCount !== 1) failed = true;

const sbcAdapter = await readFile(path.join(root, 'src', 'adapters', 'ea', 'sbc.js'), 'utf8');
for (const [name, regex] of [
  ['SBC Adapter saveChallenge', /\bservice\.saveChallenge\s*\(/g],
  ['SBC Adapter submitChallenge', /\bservice\.submitChallenge\s*\(/g],
]) {
  const count = sbcAdapter.match(regex)?.length || 0;
  console.log(`${name}: ${count} direct call site(s), baseline 1`);
  if (process.argv.includes('--check') && count !== 1) failed = true;
}

const runFunctions = [...source.matchAll(/^\s*(?:async\s+)?function\s+(run[A-Za-z0-9_]+)\s*\(/gm)].map((match) => match[1]);
console.log(`Workflow functions: ${runFunctions.length} (${runFunctions.join(', ')})`);

if (failed) {
  throw new Error('Architecture baseline changed; update the implementation or review the baseline intentionally');
}
