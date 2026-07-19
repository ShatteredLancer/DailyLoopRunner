import { describe, expect, it, vi } from 'vitest';
import { createLogRenderer, formatLogHtml } from '../../src/ui/log-renderer.js';

function classList(values = []) {
  const entries = new Set(values);
  return {
    contains(value) { return entries.has(value); },
    add(value) { entries.add(value); },
    remove(value) { entries.delete(value); },
  };
}

describe('log renderer', () => {
  it('coalesces multiple log requests into one scheduled refresh', () => {
    const callbacks = [];
    const latestBox = { textContent: '' };
    const panel = { classList: classList() };
    const lines = ['one'];
    const renderer = createLogRenderer({
      schedule: (callback) => { callbacks.push(callback); return callbacks.length; },
      cancel: vi.fn(),
      getLines: () => lines,
      getPanel: () => panel,
      getLatestBox: () => latestBox,
      getFullBox: () => null,
    });

    renderer.request();
    lines.push('two');
    renderer.request();
    expect(callbacks).toHaveLength(1);
    callbacks[0]();
    expect(latestBox.textContent).toBe('two');
  });

  it('does not rebuild the hidden full log and renders it when Options opens', () => {
    const panel = { classList: classList() };
    const fullBox = { innerHTML: '', scrollHeight: 100, scrollTop: 0, clientHeight: 100 };
    const formatFullLog = vi.fn((lines) => lines.join('|'));
    const renderer = createLogRenderer({
      schedule: (callback) => { callback(); return 1; },
      cancel: vi.fn(),
      getLines: () => ['one', 'two'],
      getPanel: () => panel,
      getLatestBox: () => ({ textContent: '' }),
      getFullBox: () => fullBox,
      formatFullLog,
    });

    renderer.request();
    expect(formatFullLog).not.toHaveBeenCalled();
    panel.classList.add('options-open');
    renderer.flushNow();
    expect(formatFullLog).toHaveBeenCalledOnce();
    expect(fullBox.innerHTML).toBe('one|two');
  });

  it('keeps a full log pinned to the bottom without forcing a scrolled-up log down', () => {
    const panel = { classList: classList(['options-open']) };
    const fullBox = { innerHTML: '', scrollHeight: 100, scrollTop: 50, clientHeight: 50 };
    const renderer = createLogRenderer({
      schedule: (callback) => { callback(); return 1; },
      cancel: vi.fn(),
      getLines: () => ['one'],
      getPanel: () => panel,
      getLatestBox: () => null,
      getFullBox: () => fullBox,
    });

    renderer.flushNow();
    expect(fullBox.scrollTop).toBe(100);
    fullBox.scrollHeight = 200;
    fullBox.scrollTop = 20;
    renderer.flushNow();
    expect(fullBox.scrollTop).toBe(20);
  });

  it('escapes log text and highlights only high rating markers', () => {
    const html = formatLogHtml(
      ['<tag> rating:90', 'rating:91'],
      (value) => value.replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    );
    expect(html).toContain('&lt;tag&gt; rating:90');
    expect(html).toContain('<span class="bronze-loop-log-high-rated">rating:91</span>');
  });

  it('escapes by default when no formatter is provided', () => {
    const panel = { classList: classList(['options-open']) };
    const fullBox = { innerHTML: '', scrollHeight: 100, scrollTop: 100, clientHeight: 50 };
    const renderer = createLogRenderer({
      schedule: (callback) => { callback(); return 1; },
      cancel: vi.fn(),
      getLines: () => ['<img src=x onerror=alert(1)> rating:92'],
      getPanel: () => panel,
      getLatestBox: () => null,
      getFullBox: () => fullBox,
    });
    renderer.flushNow();
    expect(fullBox.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(fullBox.innerHTML).not.toContain('<img');
    expect(fullBox.innerHTML).toContain('<span class="bronze-loop-log-high-rated">rating:92</span>');
    expect(formatLogHtml(['<b>hi</b>'])).toBe('&lt;b&gt;hi&lt;/b&gt;');
  });
});
