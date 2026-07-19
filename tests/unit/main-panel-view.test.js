import { describe, expect, it } from 'vitest';
import { MAIN_PANEL_STYLE, mainPanelHtml, mountMainPanel } from '../../src/ui/main-panel-view.js';

describe('main panel view template', () => {
  it('contains the compact controls, one latest log, and one full log', () => {
    const html = mainPanelHtml(7);
    for (const id of [
      'bronze-loop-select',
      'bronze-loop-start',
      'bronze-loop-stop',
      'bronze-loop-options-toggle',
      'bronze-loop-collapse',
      'bronze-loop-latest',
      'bronze-loop-options',
      'bronze-loop-log',
    ]) {
      expect(html.match(new RegExp(`id="${id}"`, 'g')) || [], id).toHaveLength(1);
    }
    expect(html).toContain('<button id="bronze-loop-collapse" title="Compact">L</button>');
    expect(html).toContain('id="bronze-loop-rounds" type="number" min="1" max="50" value="7"');
  });

  it('contains every advanced option and command control expected by entry bindings', () => {
    const html = mainPanelHtml();
    for (const id of [
      'bronze-loop-dry-run',
      'bronze-loop-open-rewards',
      'bronze-loop-show-mvp',
      'bronze-loop-pick-protect-high-gold',
      'bronze-loop-pick-high-gold-threshold',
      'bronze-loop-pick-auto-below-90',
      'bronze-loop-pick-prefer-scanned',
      'bronze-loop-pick-auto-threshold',
      'bronze-loop-refresh',
      'bronze-loop-scan-picks',
      'bronze-loop-load-json',
      'bronze-loop-built-in',
      'bronze-loop-edit',
      'bronze-loop-json',
      'bronze-loop-copy',
      'bronze-loop-clear',
      'bronze-loop-download',
      'bronze-loop-recap-reopen',
    ]) {
      expect(html, id).toContain(`id="${id}"`);
    }
  });

  it('defines exactly eight stable resize handles', () => {
    const html = mainPanelHtml();
    const handles = [...html.matchAll(/id="bronze-loop-resize-([a-z]+)"/g)].map((match) => match[1]);
    expect(handles).toEqual(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);
  });

  it('keeps compact/options/icon visibility and overflow rules in CSS', () => {
    expect(MAIN_PANEL_STYLE).toContain('#bronze-loop-options { display: none;');
    expect(MAIN_PANEL_STYLE).toContain('#bronze-loop-panel.options-open #bronze-loop-options { display: flex;');
    expect(MAIN_PANEL_STYLE).toContain('#bronze-loop-panel.options-open #bronze-loop-latest { display: none; }');
    expect(MAIN_PANEL_STYLE).toContain('#bronze-loop-panel.icon-only .panel-body,');
    expect(MAIN_PANEL_STYLE).toContain('#bronze-loop-log {');
    expect(MAIN_PANEL_STYLE).toContain('overflow: auto;');
  });

  it('mounts style and panel once through the DOM adapter', () => {
    const head = [];
    const body = [];
    const existing = new Map();
    const dom = {
      query: (selector) => existing.get(selector) || null,
      create: (tagName) => ({ tagName, remove() {} }),
      appendToHead: (element) => { head.push(element); existing.set(`#${element.id}`, element); },
      appendToBody: (element) => { body.push(element); existing.set(`#${element.id}`, element); },
    };
    const first = mountMainPanel({ dom, maxRounds: 7 });
    expect(first.created).toBe(true);
    expect(head).toHaveLength(1);
    expect(body).toHaveLength(1);
    expect(head[0].textContent).toBe(MAIN_PANEL_STYLE);
    expect(body[0].innerHTML).toContain('id="bronze-loop-rounds" type="number" min="1" max="50" value="7"');

    const second = mountMainPanel({ dom, maxRounds: 3 });
    expect(second).toEqual({ panel: first.panel, created: false });
    expect(head).toHaveLength(1);
    expect(body).toHaveLength(1);
  });
});
