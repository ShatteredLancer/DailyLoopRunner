import { describe, expect, it } from 'vitest';
import {
  MAIN_PANEL_STYLE,
  mainPanelHtml,
  mountMainPanel,
  setMainPanelStartupHidden,
} from '../../src/ui/main-panel-view.js';

describe('main panel view template', () => {
  it('contains the compact controls, one latest log, and one full log', () => {
    const html = mainPanelHtml(7);
    for (const id of [
      'bronze-loop-select',
      'bronze-loop-start',
      'bronze-loop-stop',
      'bronze-loop-batch-open',
      'bronze-loop-options-toggle',
      'bronze-loop-collapse',
      'bronze-loop-latest',
      'bronze-loop-options',
      'bronze-loop-options-scroll',
      'bronze-loop-log',
    ]) {
      expect(html.match(new RegExp(`id="${id}"`, 'g')) || [], id).toHaveLength(1);
    }
    expect(html).toContain('<button id="bronze-loop-collapse" title="Compact">L</button>');
    expect(html).toContain('id="bronze-loop-rounds" type="number" min="1" max="50" value="7"');
    expect(html).toContain('type="checkbox"> Inventory only');
  });

  it('contains every advanced option and command control expected by entry bindings', () => {
    const html = mainPanelHtml();
    for (const id of [
      'bronze-loop-dry-run',
      'bronze-loop-open-rewards',
      'bronze-loop-daily-inventory-only',
      'bronze-loop-show-mvp',
      'bronze-loop-pick-protect-high-gold',
      'bronze-loop-pick-high-gold-threshold',
      'bronze-loop-pick-auto-below-90',
      'bronze-loop-pick-prefer-scanned',
      'bronze-loop-pick-open-at-end',
      'bronze-loop-pick-auto-threshold',
      'bronze-loop-refresh',
      'bronze-loop-scan-picks',
      'bronze-loop-load-json',
      'bronze-loop-built-in',
      'bronze-loop-edit',
      'bronze-loop-edit-config',
      'bronze-loop-apply-config',
      'bronze-loop-json',
      'bronze-loop-copy',
      'bronze-loop-clear',
      'bronze-loop-download',
      'bronze-loop-recap-reopen',
      'bronze-loop-reward-alert-enabled',
      'bronze-loop-reward-alert-summary',
      'bronze-loop-reward-alert-settings',
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
    expect(MAIN_PANEL_STYLE).toContain('#bronze-loop-options-scroll { flex: 1 1 auto;');
    expect(MAIN_PANEL_STYLE).toContain('overflow-y: auto;');
    expect(MAIN_PANEL_STYLE).toContain('#bronze-loop-panel.icon-only .panel-body,');
    expect(MAIN_PANEL_STYLE).toContain('#bronze-loop-panel.startup-hidden {');
    expect(MAIN_PANEL_STYLE).toContain('visibility: hidden;');
    expect(MAIN_PANEL_STYLE).toContain('#bronze-loop-latest {');
    expect(MAIN_PANEL_STYLE).toContain('white-space: pre-wrap;');
    expect(MAIN_PANEL_STYLE).toContain('overflow-wrap: anywhere;');
    expect(MAIN_PANEL_STYLE).toContain('overflow-y: auto;');
    expect(MAIN_PANEL_STYLE).toContain('#bronze-loop-log {');
    expect(MAIN_PANEL_STYLE).toContain('flex: 0 1 110px;');
    expect(MAIN_PANEL_STYLE).toContain('min-height: 64px;');
    expect(MAIN_PANEL_STYLE).toContain('scrollbar-gutter: stable;');
    expect(MAIN_PANEL_STYLE).toContain('overscroll-behavior: contain;');
  });

  it('mounts style and panel once through the DOM adapter', () => {
    const head = [];
    const body = [];
    const existing = new Map();
    const dom = {
      query: (selector) => existing.get(selector) || null,
      create: (tagName) => ({
        tagName,
        classList: {
          values: new Set(),
          add(value) { this.values.add(value); },
          contains(value) { return this.values.has(value); },
          toggle(value, force) {
            if (force === true) this.values.add(value);
            else if (force === false) this.values.delete(value);
          },
        },
        remove() {},
      }),
      appendToHead: (element) => { head.push(element); existing.set(`#${element.id}`, element); },
      appendToBody: (element) => { body.push(element); existing.set(`#${element.id}`, element); },
    };
    const first = mountMainPanel({ dom, maxRounds: 7, startupHidden: true });
    expect(first.created).toBe(true);
    expect(head).toHaveLength(1);
    expect(body).toHaveLength(1);
    expect(head[0].textContent).toBe(MAIN_PANEL_STYLE);
    expect(body[0].innerHTML).toContain('id="bronze-loop-rounds" type="number" min="1" max="50" value="7"');
    expect(first.panel.classList.contains('startup-hidden')).toBe(true);

    setMainPanelStartupHidden(first.panel, false);
    expect(first.panel.classList.contains('startup-hidden')).toBe(false);

    const second = mountMainPanel({ dom, maxRounds: 3 });
    expect(second).toEqual({ panel: first.panel, created: false });
    expect(head).toHaveLength(1);
    expect(body).toHaveLength(1);
  });
});
