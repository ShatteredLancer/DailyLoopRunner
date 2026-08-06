import { describe, expect, it } from 'vitest';
import {
  MAIN_PANEL_HELP_TOPICS,
  getMainPanelHelpTopics,
  showMainPanelHelp,
} from '../../src/ui/main-panel-help.js';

function element(tagName) {
  const listeners = new Map();
  return {
    tagName,
    style: {},
    children: [],
    append(...items) { this.children.push(...items); },
    appendChild(item) { this.children.push(item); },
    addEventListener(type, callback) { listeners.set(type, callback); },
    remove() { this.removed = true; },
  };
}

describe('main panel help topics', () => {
  it('keeps an overview and focused explanations for every visible panel section', () => {
    expect(MAIN_PANEL_HELP_TOPICS.map((topic) => topic.id)).toEqual(['overview', 'run-options', 'config', 'log']);
    expect(getMainPanelHelpTopics('overview')).toHaveLength(4);
    expect(getMainPanelHelpTopics('run-options')[0].items.map(([label]) => label)).toContain('Open reward packs');
    expect(getMainPanelHelpTopics('config')[0].items.map(([label]) => label)).toContain('Open Builder');
    expect(getMainPanelHelpTopics('config')[0].items.map(([label]) => label)).toContain('Layout');
    expect(getMainPanelHelpTopics('log')[0].items.map(([label]) => label)).toContain('Resize log');
  });

  it('falls back to the complete guide for an unknown help topic', () => {
    expect(getMainPanelHelpTopics('missing-topic')).toBe(MAIN_PANEL_HELP_TOPICS);
  });

  it('mounts a focused help dialog and removes an earlier one', () => {
    const existing = element('div');
    const body = [];
    const dom = {
      query: (selector) => selector === '#bronze-loop-help-modal' ? existing : null,
      create: element,
      appendToBody: (item) => body.push(item),
    };
    const overlay = showMainPanelHelp({ dom, topic: 'log' });
    expect(existing.removed).toBe(true);
    expect(overlay.id).toBe('bronze-loop-help-modal');
    expect(body).toEqual([overlay]);
    const dialog = overlay.children[0];
    expect(dialog.children[0].textContent).toBe('Log');
  });

  it('uses the shared mobile dialog layout', () => {
    const body = [];
    const root = { getAttribute: (name) => name.endsWith('layout') ? 'mobile' : 'touch' };
    const dom = {
      query: (selector) => selector === ':root' ? root : null,
      create: element,
      appendToBody: (item) => body.push(item),
    };
    const overlay = showMainPanelHelp({ dom, topic: 'overview' });
    const dialog = overlay.children[0];
    expect(dialog.style).toMatchObject({ width: '100%', height: '100dvh', maxHeight: '100dvh' });
    const actions = dialog.children.at(-1);
    expect(actions.style.position).toBe('sticky');
  });
});
