import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('semantic state contracts', () => {
  it('does not use human-readable action descriptions as routing state', async () => {
    const source = await readFile(path.join(root, 'src', 'userscript-entry.js'), 'utf8');

    expect(source).not.toMatch(/action\.description\??\.includes\s*\(/);
    expect(source).toContain('action.requiresExactClubDuplicate === true');
  });

  it('keeps Unassigned controller recovery policy out of the userscript entry point', async () => {
    const source = await readFile(path.join(root, 'src', 'userscript-entry.js'), 'utf8');
    const start = source.indexOf('async function showUnassignedIfAny');
    const end = source.indexOf('async function unwindSbcSquadControllers', start);
    const block = source.slice(start, end);

    expect(block).toContain('recoverRuntimeUnassignedNavigation({');
    expect(block).toContain('materializeUnassigned: async () => {');
    expect(block).toContain('await refreshUnassigned({');
    expect(block).toContain('attempts: 1');
    expect(block).toContain('allowCacheFallback: false');
    expect(block).toContain('return true;');
    expect(block).not.toMatch(/UT(?:Home|Store|SBC|Unassigned)[A-Za-z]*ViewController/);
  });

  it('uses complete fresh entity evidence for opened rewards and reserves Controller confirmation for response-lost recovery', async () => {
    const source = await readFile(path.join(root, 'src', 'userscript-entry.js'), 'utf8');
    const materializeStart = source.indexOf('async function materializeOpenedPlayerRewards');
    const materializeEnd = source.indexOf('async function tryDirectlySettleUnmaterializedOpenedDuplicates', materializeStart);
    const materializeBlock = source.slice(materializeStart, materializeEnd);
    expect(materializeBlock).toContain('materializeOpenedDuplicatesFresh(');
    expect(materializeBlock).not.toContain('showUnassignedIfAny(');

    expect(source).toContain('routingBaseline: context.routingBaseline || null');
    expect(source).toContain('routingBaseline: packContext.routingBaseline || null');
    expect(source).not.toContain('showUnassignedIfAny(`${label} duplicate materialization`, {');

    const recoveryAnchor = 'showUnassignedIfAny(`${purpose} pack-open recovery sync`, {';
    const recoveryIndex = source.indexOf(recoveryAnchor);
    expect(recoveryIndex).toBeGreaterThan(-1);
    expect(source.slice(recoveryIndex, recoveryIndex + 300)).toContain('requireNavigation: true');
  });

  it('keeps committed pack settlement and Rolling ledger reconciliation inside the Stop guard', async () => {
    const source = await readFile(path.join(root, 'src', 'userscript-entry.js'), 'utf8');
    expect(source).toContain('committedPackOpenDepth: 0');
    expect(source).toMatch(/function stopPoint\(\)[\s\S]*?committedPackOpenDepth > 0/);
    expect(source).toMatch(/async function runCommittedPackOpen[\s\S]*?committedPackOpenDepth\+\+[\s\S]*?await operation\(\)/);
    expect(source).toMatch(/openPackTransaction\(\{[\s\S]*?runCommitted: runCommittedPackOpen/);
    expect(source).toMatch(/settleReceipt: async \(openedReceipt, context\)[\s\S]*?recordLoopPackReceipt\(openedReceipt, purpose\)[\s\S]*?options\.settleReceipt/);
    expect(source).toMatch(/openRollingRecoveryReward[\s\S]*?settleReceipt: async \(openedReceipt\)[\s\S]*?coordinator\.recordPackReceipt\(openedReceipt, \{ reconcile: true \}\)/);
    expect(source).toMatch(/openPrimaryPack:[\s\S]*?settleReceipt: async \(openedReceipt\)[\s\S]*?coordinator\.recordPackReceipt\(openedReceipt, \{ reconcile: true \}\)/);
  });
});
