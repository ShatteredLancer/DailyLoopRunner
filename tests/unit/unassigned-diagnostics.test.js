import { describe, expect, it } from 'vitest';
import {
  captureDefinitionPileState,
  captureMoveResult,
  captureRuntimePack,
  captureRuntimeInventoryItem,
  captureUnassignedRefreshResult,
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
      evolution: false,
      hasUpgrades: false,
      hasCosmetics: false,
    });
    expect(second.objectRef).toBe(first.objectRef);
    expect(replacement.objectRef).toBe('test-item-2');
  });

  it('reports Evolution and cosmetic identity state used by duplicate matching', () => {
    const evolved = player(1, 270673);
    evolved.upgrades = { evolutionId: 12 };
    evolved.cosmetics = [{ id: 7 }];

    expect(captureRuntimeInventoryItem(evolved)).toMatchObject({
      evolution: true,
      hasUpgrades: true,
      hasCosmetics: true,
    });
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
      _data: {
        code: 'settled',
        sourcePile: 6,
        destinationPile: 7,
        itemIds: [101, 102],
        clubDuplicates: [{ id: 201 }, 202],
        untradeableSwap: false,
        privatePayload: { ignored: true },
      },
    });

    expect(result).toMatchObject({
      result: { success: true, status: 200 },
      response: { statusCode: 200, message: 'accepted' },
      data: { code: 'settled' },
      dataValues: {
        sourcePile: 6,
        destinationPile: 7,
        itemIds: [101, 102],
        clubDuplicates: [201, 202],
        untradeableSwap: false,
      },
    });
    expect(diagnosticJson(result)).toContain('privatePayload');
    expect(diagnosticJson(result)).not.toContain('"ignored":true');
  });

  it('captures Pack instance identity and bounded scalar metadata', () => {
    const identify = createRuntimeObjectIdentityTracker('test-pack');
    const pack = {
      id: 21346,
      articleId: 9981,
      name: 'Repeatable FUTTIES Provisions Players Pack',
      count: 30,
      nested: { ignored: true },
      _data: { itemId: 7788, consumed: false, nested: { ignored: true } },
    };

    expect(captureRuntimePack(pack, { identify })).toMatchObject({
      objectRef: 'test-pack-1',
      scalars: {
        articleId: 9981,
        count: 30,
        id: 21346,
        name: 'Repeatable FUTTIES Provisions Players Pack',
      },
      dataScalars: { consumed: false, itemId: 7788 },
    });
    expect(captureRuntimePack(pack, { identify }).objectRef).toBe('test-pack-1');
  });

  it('captures the raw EA error reason alongside its code', () => {
    expect(captureMoveResult({
      success: false,
      status: 409,
      error: { code: 471, reason: 'pending-items' },
    })).toMatchObject({
      error: { code: 471, reason: 'pending-items' },
    });
  });

  it('captures bounded item identity, names, and private Purchased response payloads', () => {
    const diagnostic = captureUnassignedRefreshResult({
      success: true,
      response: {
        items: [{
          id: 101,
          definitionId: 1001,
          rating: 95,
          pile: 'unassigned',
          name: 'Diagnostic Player',
          privatePayload: 'private diagnostic value',
        }],
      },
    });

    expect(diagnostic).toMatchObject({
      transport: { result: { success: true } },
      itemArrays: [{
        source: 'response.items',
        count: 1,
        items: [{
          id: 101,
          definitionId: 1001,
          rating: 95,
          pile: 'unassigned',
          name: 'Diagnostic Player',
        }],
      }],
      raw: {
        success: true,
        response: {
          items: [{
            name: 'Diagnostic Player',
            privatePayload: 'private diagnostic value',
          }],
        },
      },
    });
    expect(JSON.stringify(diagnostic).length).toBeLessThan(20000);
  });
});
