import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('userscript entry helper usage', () => {
  it('does not retain top-level helpers that are only defined and never referenced', async () => {
    const source = await readFile(path.join(root, 'src', 'userscript-entry.js'), 'utf8');
    const definitions = [...source.matchAll(/^  (?:async )?function ([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/gm)]
      .map((match) => match[1]);
    const unused = definitions.filter((name) => {
      const references = source.match(new RegExp(`\\b${name}\\b`, 'g')) || [];
      return references.length <= 1;
    });
    expect(unused).toEqual([]);
  });
});
