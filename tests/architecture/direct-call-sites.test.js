import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('current direct side-effect call baseline', () => {
  it('keeps pack.open and low-level SBC save/submit calls inside EA Adapters', async () => {
    const source = await readFile(path.join(root, 'src', 'userscript-entry.js'), 'utf8');
    const packAdapter = await readFile(path.join(root, 'src', 'adapters', 'ea', 'pack.js'), 'utf8');
    const sbcAdapter = await readFile(path.join(root, 'src', 'adapters', 'ea', 'sbc.js'), 'utf8');
    expect(source.match(/\bpackAdapter\.open\s*\(/g) || []).toHaveLength(1);
    expect(source.match(/\b(?:currentPack|selectedPack|pack)\.open\s*\(/g) || []).toHaveLength(0);
    expect(packAdapter.match(/\bpack\.open\s*\(/g) || []).toHaveLength(1);
    expect(source.match(/\bW\.services\.SBC\.saveChallenge\s*\(/g) || []).toHaveLength(0);
    expect(source.match(/\bW\.services\.SBC\.submitChallenge\s*\(/g) || []).toHaveLength(0);
    expect(sbcAdapter.match(/\bservice\.saveChallenge\s*\(/g) || []).toHaveLength(1);
    expect(sbcAdapter.match(/\bservice\.submitChallenge\s*\(/g) || []).toHaveLength(1);
    expect(source.match(/\bsaveChallengeSquad\s*\(/g) || []).toHaveLength(3);
    expect(source).toMatch(/function\s+prepareSbcSquad\s*\(/);
    expect(source).toContain('prepareOnly: true');
  });

  it('records the special workflow functions that still require migration', async () => {
    const source = await readFile(path.join(root, 'src', 'userscript-entry.js'), 'utf8');
    expect(source).not.toMatch(/function\s+runInventoryMixedUpgrade(?:DryRun)?\s*\(/);
    expect(source).toMatch(/function\s+runSupplyAndCraftLoop\s*\(/);
    expect(source).not.toMatch(/function\s+runDailySingleCardRecycle(?:DryRun)?\s*\(/);
    expect(source).toMatch(/function\s+runRecycleLoop\s*\(/);
    expect(source).not.toMatch(/function\s+runCommonGoldToRareUpgrade(?:DryRun)?\s*\(/);
    expect(source).not.toMatch(/function\s+runRarePackTo84Upgrade(?:DryRun)?\s*\(/);
    expect(source).toMatch(/function\s+runRarePackCraftLoop\s*\(/);
    expect(source).not.toMatch(/function\s+runPlayerPickSbc(?:DryRun)?\s*\(/);
    expect(source).toMatch(/function\s+runPlayerPickLoop\s*\(/);
    expect(source).not.toMatch(/function\s+runProvisionPackCrafting(?:DryRun)?\s*\(/);
    expect(source).toMatch(/function\s+runProvisionCraftLoop\s*\(/);
    expect(source).not.toMatch(/function\s+runFillAndVerifySbc\s*\(/);
    expect(source).not.toMatch(/\brunFillAndVerifySbc\s*\(/);
    expect(source).toMatch(/function\s+runFillAndVerifyLoop\s*\(/);
    expect(source).not.toMatch(/function\s+runDryRunLoop\s*\(/);
    expect(source).not.toMatch(/function\s+clear(?:MixedUpgrade)?Unassigned\s*\(/);
    expect(source).not.toMatch(/\bclear(?:MixedUpgrade)?Unassigned\s*\(/);
    expect(source).toMatch(/function\s+resolveRuntimeUnassigned\s*\(/);
    expect(source).not.toMatch(/function\s+runDailyRoutine\s*\(/);
    expect(source).toMatch(/function\s+runDailySequence\s*\(/);
  });

  it('requires every userscript pack call to provide an opened-item policy', async () => {
    const source = await readFile(path.join(root, 'src', 'userscript-entry.js'), 'utf8');
    expect(source).not.toMatch(/const\s+items\s*=\s*await\s+openPack\s*\(/);
    expect(source).not.toMatch(/function\s+handle(?:Recycle|Provision|RarePackTo84|RareSource)PackItems\s*\(/);
    expect(source).toContain('Opened item policy is required for');
    const packCalls = source.match(/await\s+openPack\s*\(/g) || [];
    const explicitPolicies = source.split(/\r?\n/).filter((line) =>
      line.includes('openedItemPolicy:') && !line.includes('options.openedItemPolicy')
    );
    expect(packCalls).toHaveLength(7);
    expect(explicitPolicies).toHaveLength(packCalls.length);
  });
});
