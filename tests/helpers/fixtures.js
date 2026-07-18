import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

export async function loadFixture(relativePath) {
  return JSON.parse(await readFile(path.join(fixtureRoot, relativePath), 'utf8'));
}
