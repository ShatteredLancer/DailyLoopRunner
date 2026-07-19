import { describe, expect, it, vi } from 'vitest';
import { createUserEffectsAdapter } from '../../src/adapters/browser/user-effects.js';

describe('Browser user effects adapter', () => {
  it('uses the Clipboard API when it is available', async () => {
    const writeText = vi.fn(async () => {});
    const adapter = createUserEffectsAdapter({ navigator: { clipboard: { writeText } } }, {});
    await expect(adapter.copyText('log')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('log');
  });

  it('falls back to a temporary textarea when Clipboard API fails', async () => {
    const appended = [];
    const textarea = { style: {}, select: vi.fn(), remove: vi.fn() };
    const documentObject = {
      createElement: vi.fn(() => textarea),
      body: { appendChild: (element) => appended.push(element) },
      execCommand: vi.fn(() => true),
    };
    const adapter = createUserEffectsAdapter({ navigator: { clipboard: { writeText: async () => { throw new Error('denied'); } } } }, documentObject);
    await expect(adapter.copyText('fallback')).resolves.toBe(true);
    expect(textarea.value).toBe('fallback');
    expect(textarea.select).toHaveBeenCalledOnce();
    expect(documentObject.execCommand).toHaveBeenCalledWith('copy');
    expect(textarea.remove).toHaveBeenCalledOnce();
    expect(appended).toEqual([textarea]);
  });

  it('downloads text through Blob and revokes the temporary URL', () => {
    const anchor = { click: vi.fn(), remove: vi.fn() };
    const createObjectURL = vi.fn(() => 'blob:test');
    const revokeObjectURL = vi.fn();
    class FakeBlob {
      constructor(parts, options) {
        this.parts = parts;
        this.options = options;
      }
    }
    const adapter = createUserEffectsAdapter({
      Blob: FakeBlob,
      URL: { createObjectURL, revokeObjectURL },
    }, {
      createElement: () => anchor,
      body: { appendChild: vi.fn() },
    });

    expect(adapter.downloadText('full log', 'bronze-loop-1.log')).toBe(true);
    expect(anchor.href).toBe('blob:test');
    expect(anchor.download).toBe('bronze-loop-1.log');
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });
});
