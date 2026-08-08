import { describe, expect, it } from 'vitest';
import {
  MAIN_PANEL_STYLE,
  mainPanelHtml,
  mountMainPanel,
  setMainPanelStartupHidden,
} from '../../src/ui/main-panel-view.js';

describe('main panel view template', () => {
  it('contains the compact controls, one latest log, and one full log', () => {
    const html = mainPanelHtml(7, '0.6.10');
    for (const id of [
      'bronze-loop-select',
      'bronze-loop-start',
      'bronze-loop-stop',
      'bronze-loop-batch-open',
      'bronze-loop-trade',
      'bronze-loop-options-toggle',
      'bronze-loop-collapse',
      'bronze-loop-help-overview',
      'bronze-loop-help-run-options',
      'bronze-loop-help-config',
      'bronze-loop-help-log',
      'bronze-loop-latest',
      'bronze-loop-options',
      'bronze-loop-options-scroll',
      'bronze-loop-mobile-tabs',
      'bronze-loop-mobile-tab-run',
      'bronze-loop-mobile-tab-options',
      'bronze-loop-mobile-tab-log',
      'bronze-loop-run-summary',
      'bronze-loop-scan-progress',
      'bronze-loop-scan-progress-label',
      'bronze-loop-scan-progress-count',
      'bronze-loop-scan-progress-track',
      'bronze-loop-scan-progress-bar',
      'bronze-loop-log',
      'bronze-loop-log-resize',
    ]) {
      expect(html.match(new RegExp(`id="${id}"`, 'g')) || [], id).toHaveLength(1);
    }
    expect(html).toContain('<button id="bronze-loop-collapse" title="Compact">L</button>');
    expect(html).toContain('<span id="bronze-loop-title">Loop Runner v0.6.10</span>');
    expect(html).toContain('<div class="bronze-loop-title-label"><span id="bronze-loop-title">Loop Runner v0.6.10</span><button id="bronze-loop-help-overview"');
    expect(html).toContain('id="bronze-loop-rounds" type="number" min="1" max="50" value="7"');
    expect(html).toContain('type="checkbox"> Inventory only');
  });

  it('contains every advanced option and command control expected by entry bindings', () => {
    const html = mainPanelHtml();
    for (const id of [
      'bronze-loop-open-rewards',
      'bronze-loop-daily-inventory-only',
      'bronze-loop-low-rated-gold-max',
      'bronze-loop-rating-sbc-max-card',
      'bronze-loop-pick-auto-below-90',
      'bronze-loop-pick-open-at-end',
      'bronze-loop-pick-auto-threshold',
      'bronze-loop-profile-select',
      'bronze-loop-refresh',
      'bronze-loop-scan-mode',
      'bronze-loop-scan-picks',
      'bronze-loop-layout-mode',
      'bronze-loop-open-builder',
      'bronze-loop-copy',
      'bronze-loop-clear',
      'bronze-loop-download',
      'bronze-loop-recap-reopen',
      'bronze-loop-reward-alert-enabled',
      'bronze-loop-reward-alert-summary',
      'bronze-loop-reward-alert-settings',
      'bronze-loop-trade',
    ]) {
      expect(html, id).toContain(`id="${id}"`);
    }
    for (const removedId of [
      'bronze-loop-validate-json',
      'bronze-loop-load-json',
      'bronze-loop-built-in',
      'bronze-loop-preview-pick-recap',
      'bronze-loop-dry-run',
      'bronze-loop-show-mvp',
      'bronze-loop-pick-prefer-scanned',
      'bronze-loop-pick-protect-high-gold',
      'bronze-loop-pick-high-gold-threshold',
    ]) {
      expect(html, removedId).not.toContain(`id="${removedId}"`);
    }
    expect(html).toContain('SBC scan');
    expect(html).toContain('Incremental scan');
    expect(html).toContain('Clear cache + scan');
  });

  it('defines exactly eight stable resize handles', () => {
    const html = mainPanelHtml();
    const handles = [...html.matchAll(/id="bronze-loop-resize-([a-z]+)"/g)].map((match) => match[1]);
    expect(handles).toEqual(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);
  });

  it('keeps compact/options/icon visibility and overflow rules in CSS', () => {
    expect(MAIN_PANEL_STYLE).toContain('#bronze-loop-options { display: none;');
    expect(MAIN_PANEL_STYLE).toContain('#bronze-loop-panel.options-open #bronze-loop-options { display: flex;');
    expect(MAIN_PANEL_STYLE).toContain('#bronze-loop-panel.options-open #bronze-loop-run-view { flex: 0 0 auto; min-height: auto; }');
    expect(MAIN_PANEL_STYLE).not.toContain('#bronze-loop-panel.options-open #bronze-loop-run-view,');
    expect(MAIN_PANEL_STYLE).toContain('#bronze-loop-panel.options-open #bronze-loop-latest { display: none; }');
    expect(MAIN_PANEL_STYLE).toContain('#bronze-loop-options-scroll { flex: 1 1 auto;');
    expect(MAIN_PANEL_STYLE).toContain('overflow-y: auto;');
    expect(MAIN_PANEL_STYLE).toContain('#bronze-loop-panel.icon-only .panel-body,');
    expect(MAIN_PANEL_STYLE).toContain('#bronze-loop-panel.icon-only .bronze-loop-title-label,');
    expect(MAIN_PANEL_STYLE).toContain('.bronze-loop-title-label { display: flex; align-items: center; gap: 4px;');
    expect(MAIN_PANEL_STYLE).toContain('.bronze-loop-section-heading { display: flex; align-items: center; gap: 4px;');
    expect(MAIN_PANEL_STYLE).toContain('min-width: 18px; width: 18px; height: 18px;');
    expect(MAIN_PANEL_STYLE).toContain('#bronze-loop-panel.startup-hidden {');
    expect(MAIN_PANEL_STYLE).toContain('visibility: hidden;');
    expect(MAIN_PANEL_STYLE).toContain('#bronze-loop-latest {');
    expect(MAIN_PANEL_STYLE).toContain('white-space: pre-wrap;');
    expect(MAIN_PANEL_STYLE).toContain('overflow-wrap: anywhere;');
    expect(MAIN_PANEL_STYLE).toContain('overflow-y: auto;');
    expect(MAIN_PANEL_STYLE).toContain('#bronze-loop-log {');
    expect(MAIN_PANEL_STYLE).toContain('flex: 0 0 auto;');
    expect(MAIN_PANEL_STYLE).toContain('height: 110px;');
    expect(MAIN_PANEL_STYLE).toContain('min-height: 64px;');
    expect(MAIN_PANEL_STYLE).toContain('#bronze-loop-log-resize {');
    expect(MAIN_PANEL_STYLE).toContain('cursor: ns-resize;');
    expect(MAIN_PANEL_STYLE).toContain('scrollbar-gutter: stable;');
    expect(MAIN_PANEL_STYLE).toContain('overscroll-behavior: contain;');
    expect(MAIN_PANEL_STYLE).toContain('#bronze-loop-scan-progress[data-mode="indeterminate"]');
    expect(MAIN_PANEL_STYLE).toContain('@keyframes bronze-loop-scan-slide');
    expect(MAIN_PANEL_STYLE).toContain('#bronze-loop-panel[data-layout="mobile"]');
    expect(MAIN_PANEL_STYLE).toContain('#bronze-loop-panel[data-input="touch"] button');
    expect(MAIN_PANEL_STYLE).toContain('height: min(72dvh, 620px)');
    expect(MAIN_PANEL_STYLE).toContain('left: var(--dlr-mobile-icon-left, auto) !important;');
    expect(MAIN_PANEL_STYLE).toContain('.icon-only #bronze-loop-drag { cursor: move; touch-action: none; }');
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
    const first = mountMainPanel({ dom, maxRounds: 7, version: '0.6.10', startupHidden: true });
    expect(first.created).toBe(true);
    expect(head).toHaveLength(1);
    expect(body).toHaveLength(1);
    expect(head[0].textContent).toBe(MAIN_PANEL_STYLE);
    expect(body[0].innerHTML).toContain('id="bronze-loop-rounds" type="number" min="1" max="50" value="7"');
    expect(body[0].innerHTML).toContain('<span id="bronze-loop-title">Loop Runner v0.6.10</span>');
    expect(first.panel.classList.contains('startup-hidden')).toBe(true);

    setMainPanelStartupHidden(first.panel, false);
    expect(first.panel.classList.contains('startup-hidden')).toBe(false);

    const second = mountMainPanel({ dom, maxRounds: 3 });
    expect(second).toEqual({ panel: first.panel, created: false });
    expect(head).toHaveLength(1);
    expect(body).toHaveLength(1);
  });
});
