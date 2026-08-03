import { describe, expect, it } from 'vitest';
import {
  captureDefinitionPileState,
  captureMoveResult,
  captureRuntimeInventoryItem,
  createRuntimeObjectIdentityTracker,
  diagnosticJson,
} from '../../src/unassigned/diagnostics.js';

function player(id, definitionId, options = {}) {
  return {
    id,
    definitionId,
    rating: 80,
    rareflag: 1,
    pile: options.pile,
    duplicateId: options.duplicateId || 0,
    _duplicateId: options.privateDuplicateId,
    _data: {
      pile: options.dataPile,
      duplicateId: options.dataDuplicateId,
      injuryType: options.dataInjuryType,
    },
    untradeable: options.untradeable,
    isDuplicate() { return Number(this.duplicateId || 0) > 0; },
    isUntradeable() { return options.untradeable !== false; },
  };
}

describe('Unassigned runtime diagnostics', () => {
  it('captures mutation-relevant EA item fields and stable object identities', () => {
    const identify = createRuntimeObjectIdentityTracker('test-item');
    const item = player(907443226269, 270673, {
      pile: 'purchased',
      dataPile: 'unassigned',
      duplicateId: 764303611195,
      privateDuplicateId: 764303611195,
      untradeable: true,
    });

    const first = captureRuntimeInventoryItem(item, { identify });
    const second = captureRuntimeInventoryItem(item, { identify });
    const replacement = captureRuntimeInventoryItem({ ...item }, { identify });

    expect(first).toMatchObject({
      objectRef: 'test-item-1',
      id: 907443226269,
      definitionId: 270673,
      pile: 'purchased',
      dataPile: 'unassigned',
      duplicateId: 764303611195,
      privateDuplicateId: 764303611195,
      isDuplicate: true,
      isUntradeable: true,
    });
    expect(second.objectRef).toBe(first.objectRef);
    expect(replacement.objectRef).toBe('test-item-2');
  });

  it('reports every same-definition location without serializing unrelated inventory', () => {
    const identify = createRuntimeObjectIdentityTracker();
    const live = player(1, 270673, { duplicateId: 2, pile: 'purchased' });
    const state = captureDefinitionPileState({
      unassigned: [live],
      storage: [player(3, 270673, { pile: 'storage' }), player(4, 123, { pile: 'storage' })],
      transfer: [],
      club: [player(2, 270673, { pile: 'club', untradeable: true })],
    }, 270673, { identify });

    expect(state.unassigned.count).toBe(1);
    expect(state.storage.count).toBe(1);
    expect(state.storage.items[0].id).toBe(3);
    expect(state.club.count).toBe(1);
    expect(state.transfer.count).toBe(0);
  });

  it('keeps move-result diagnostics bounded and serializable', () => {
    const result = captureMoveResult({
      success: true,
      status: 200,
      response: { statusCode: 200, message: 'accepted', payload: { ignored: true } },
      _data: { code: 'settled', privatePayload: { ignored: true } },
    });

    expect(result).toMatchObject({
      result: { success: true, status: 200 },
      response: { statusCode: 200, message: 'accepted' },
      data: { code: 'settled' },
    });
    expect(diagnosticJson(result)).toContain('privatePayload');
    expect(diagnosticJson(result)).not.toContain('"ignored":true');
  });
});
