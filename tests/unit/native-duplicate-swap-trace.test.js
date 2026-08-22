import { describe, expect, it, vi } from 'vitest';
import { createNativeDuplicateSwapTrace } from '../../src/adapters/ea/native-duplicate-swap-trace.js';
import { loadUserscript } from '../helpers/load-userscript.js';

function runtimeFixture(options = {}) {
  const calls = [];
  const observable = {
    observe(controller, callback) {
      calls.push(['observe', this, controller, callback]);
      return callback.call(this, 'sender', {
        success: true,
        data: {
          sourcePile: 6,
          destinationPile: 7,
          itemIds: [301],
          clubDuplicates: [{ id: 201 }],
          untradeableSwap: true,
        },
      });
    },
  };
  const service = {
    move(items, destination, allowStorage) {
      calls.push(['move', this, items, destination, allowStorage]);
      return observable;
    },
    requestDuplicateItems() {
      calls.push(['requestDuplicateItems', this]);
      return { success: true };
    },
    unrelated() {
      calls.push(['unrelated', this]);
      return null;
    },
  };
  class UTUnassignedItemsViewController {
    confirmSwapUntradeablesTapped(item) {
      calls.push(['controller', this, item]);
      return service.move([item], 7, true);
    }
  }
  const controller = new UTUnassignedItemsViewController();
  return {
    calls,
    controller,
    observable,
    runtime: {
      services: { Item: service },
      UTUnassignedItemsViewController,
      secretToken: options.secretToken || 'not-captured',
    },
    service,
  };
}

describe('native duplicate swap trace', () => {
  it('traces the native controller, Item service, and Observable result without replacing returns', () => {
    const fixture = runtimeFixture();
    const originalControllerMethod = fixture.controller.confirmSwapUntradeablesTapped;
    const originalMove = fixture.service.move;
    const originalObserve = fixture.observable.observe;
    const logs = [];
    const trace = createNativeDuplicateSwapTrace(fixture.runtime, {
      currentController: () => fixture.controller,
      log: (line) => logs.push(line),
    });

    const started = trace.start();
    expect(started.active).toBe(true);
    expect(started.events[0].payload.values.discovered).toEqual(expect.arrayContaining([
      'ItemService.move',
      'ItemService.requestDuplicateItems',
      'UTUnassignedItemsViewController.confirmSwapUntradeablesTapped',
    ]));
    expect(fixture.service.unrelated.name).toBe('unrelated');

    const item = { id: 101, definitionId: 501, pile: 6, duplicateId: 201, tradeable: false };
    const returned = fixture.controller.confirmSwapUntradeablesTapped(item);
    expect(returned).toBe(fixture.observable);
    const callback = vi.fn(function (_sender, result) {
      expect(this).toBe(fixture.observable);
      return result.data.itemIds[0];
    });
    expect(returned.observe(fixture.controller, callback)).toBe(301);
    expect(callback).toHaveBeenCalledTimes(1);

    const snapshot = trace.get();
    expect(snapshot.events.map((event) => `${event.method}:${event.phase}`)).toEqual(expect.arrayContaining([
      'UTUnassignedItemsViewController.confirmSwapUntradeablesTapped:call',
      'ItemService.move:call',
      'ItemService.move:return',
      'ItemService.move:observe',
      'ItemService.move:observable-result',
    ]));
    expect(JSON.stringify(snapshot)).not.toContain('not-captured');
    const responseEvent = snapshot.events.find((event) => event.phase === 'observable-result');
    const response = responseEvent.payload.values.args[1].values;
    expect(response.data.values).toMatchObject({
      itemIds: [301],
      clubDuplicates: [{ id: 201 }],
      sourcePile: 6,
      destinationPile: 7,
    });
    expect(logs.length).toBeGreaterThan(0);

    const stopped = trace.stop();
    expect(stopped.active).toBe(false);
    expect(fixture.controller.confirmSwapUntradeablesTapped).toBe(originalControllerMethod);
    expect(fixture.service.move).toBe(originalMove);
    expect(fixture.observable.observe).toBe(originalObserve);
  });

  it('is idempotent, bounded, restartable, and cannot break the traced operation when logging fails', () => {
    const fixture = runtimeFixture();
    const trace = createNativeDuplicateSwapTrace(fixture.runtime, {
      maxEvents: 20,
      currentController: () => fixture.controller,
      log: () => { throw new Error('diagnostic sink failed'); },
    });

    expect(trace.start().sessionId).toBe(trace.start().sessionId);
    for (let index = 0; index < 30; index++) {
      expect(fixture.service.requestDuplicateItems()).toEqual({ success: true });
    }
    expect(trace.get().eventCount).toBe(20);
    trace.stop();

    const restarted = trace.start();
    expect(restarted.active).toBe(true);
    expect(restarted.eventCount).toBe(1);
    expect(() => fixture.service.requestDuplicateItems()).not.toThrow();
    trace.stop();
  });

  it('exposes the bounded trace controls through the installed userscript API', async () => {
    const { window } = await loadUserscript();
    const runner = window.__FCLoopRunner;

    expect(runner).toMatchObject({
      startNativeDuplicateSwapTrace: expect.any(Function),
      stopNativeDuplicateSwapTrace: expect.any(Function),
      getNativeDuplicateSwapTrace: expect.any(Function),
    });
    expect(runner.startNativeDuplicateSwapTrace()).toMatchObject({ active: true, schemaVersion: 1 });
    expect(runner.getNativeDuplicateSwapTrace()).toMatchObject({ active: true, eventCount: 1 });
    runner.destroy();
    expect(runner.getNativeDuplicateSwapTrace()).toMatchObject({ active: false });
  });
});
