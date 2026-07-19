import { describe, expect, it, vi } from 'vitest';
import { createLogRenderer } from '../../src/ui/log-renderer.js';

function classList(values = []) {
  const entries = new Set(values);
  return {
    contains(value) { return entries.has(value); },
  };
}

describe('compact latest log rendering', () => {
  it('keeps the complete latest line available and resets its internal scroll position', () => {
    const latest = 'Error stack: chrome-extension://example/userscript.html:123456:789';
    const latestBox = { textContent: 'old', title: '', scrollTop: 20 };
    const renderer = createLogRenderer({
      schedule: (callback) => { callback(); return 1; },
      cancel: vi.fn(),
      getLines: () => [latest],
      getPanel: () => ({ classList: classList() }),
      getLatestBox: () => latestBox,
      getFullBox: () => null,
    });

    renderer.flushNow();

    expect(latestBox.textContent).toBe(latest);
    expect(latestBox.title).toBe(latest);
    expect(latestBox.scrollTop).toBe(0);
  });
});
