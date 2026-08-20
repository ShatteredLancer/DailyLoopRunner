import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function readJavaScriptTree(relativeDir) {
  const absoluteDir = path.join(root, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const relativePath = path.join(relativeDir, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory()) return readJavaScriptTree(relativePath);
    if (!entry.isFile() || !entry.name.endsWith('.js')) return [];
    return [{
      name: relativePath,
      source: await readFile(path.join(root, relativePath), 'utf8'),
    }];
  }));
  return nested.flat();
}

describe('player rarity boundary', () => {
  it('keeps raw EA player rarity reads inside the canonical domain helper', async () => {
    const files = (await readJavaScriptTree('src'))
      .filter((file) => file.name !== 'src/domain/player-rarity.js');
    const rawItemRarity = /\bitem\s*(?:\?\.)?\.?(?:rareflag|rareFlag|_rareflag)\b|\bitem\s*(?:\?\.)?\.(?:_data|_staticData)\s*(?:\?\.)?\.(?:rareflag|rareFlag)\b/;
    for (const file of files) {
      expect(file.source, file.name).not.toMatch(rawItemRarity);
    }
  });

  it('does not infer Player Item card types from Squad methods or opaque group IDs', async () => {
    const files = await readJavaScriptTree('src');
    for (const file of files) {
      expect(file.source, file.name).not.toMatch(/(?:\?\.|\.)is(?:TOTW|Totw|TOTS|Tots|FOF|Fof|FUTTIES|Futties)\s*(?:\?\.)?\(/);
      expect(file.source, file.name).not.toContain('TOTW_GROUP_IDS');
      expect(file.source, file.name).not.toMatch(/groups?[^\n]*45[^\n]*(?:TOTW|Totw)|(?:TOTW|Totw)[^\n]*groups?[^\n]*45/);
    }
  });

  it('does not generate legacy Gold consumption fields from current built-in producers', async () => {
    const files = await Promise.all([
      'src/config/loops.js',
      'src/config/builder-profile.js',
      'src/config/player-pick-discovery.js',
      'src/config/recovery.js',
      'src/config/upgrade-policies.js',
    ].map(async (name) => ({ name, source: await readFile(path.join(root, name), 'utf8') })));
    for (const file of files) {
      expect(file.source, file.name).not.toMatch(/\bpreferCommon\s*:/);
      expect(file.source, file.name).not.toMatch(/\bselectionMaterial\s*:/);
    }
  });
});
