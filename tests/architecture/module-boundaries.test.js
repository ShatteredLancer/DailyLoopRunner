import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function readJavaScriptFiles(relativeDir) {
  const dir = path.join(root, relativeDir);
  const entries = await readdir(dir, { withFileTypes: true });
  return Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map(async (entry) => ({
      name: path.join(relativeDir, entry.name).replaceAll('\\', '/'),
      source: await readFile(path.join(dir, entry.name), 'utf8'),
    })));
}

function expectNoRuntimeGlobals(files) {
  for (const file of files) {
    expect(file.source, file.name).not.toMatch(/\b(?:window|document|unsafeWindow)\b/);
    expect(file.source, file.name).not.toMatch(/\bW\s*\./);
    expect(file.source, file.name).not.toMatch(/\b(?:repositories|services)\s*\./);
  }
}

describe('module boundaries', () => {
  it('keeps Workflow modules independent from EA, FSU, DOM, and Adapter implementations', async () => {
    const files = await readJavaScriptFiles('src/workflows');
    expectNoRuntimeGlobals(files);
    for (const file of files) {
      expect(file.source, file.name).not.toMatch(/from\s+['"][^'"]*\/adapters(?:\/|['"])/);
    }
  });

  it('keeps Domain and Selection modules pure', async () => {
    const files = [
      ...await readJavaScriptFiles('src/domain'),
      ...await readJavaScriptFiles('src/selection'),
    ];
    expectNoRuntimeGlobals(files);
    for (const file of files) {
      expect(file.source, file.name).not.toMatch(/from\s+['"][^'"]*\/adapters(?:\/|['"])/);
    }
  });

  it('keeps shared Config, Pack, Reward, SBC, Unassigned, and UI modules free of runtime globals', async () => {
    const files = [
      ...await readJavaScriptFiles('src/config'),
      ...await readJavaScriptFiles('src/pack'),
      ...await readJavaScriptFiles('src/reward'),
      ...await readJavaScriptFiles('src/sbc'),
      ...await readJavaScriptFiles('src/unassigned'),
      ...await readJavaScriptFiles('src/ui'),
    ];
    expectNoRuntimeGlobals(files);
    for (const file of files) {
      expect(file.source, file.name).not.toMatch(/from\s+['"][^'"]*\/adapters(?:\/|['"])/);
    }
  });
});
