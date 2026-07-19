import { describe, expect, it, vi } from 'vitest';
import { showRewardAlertSettings } from '../../src/ui/reward-alert-settings.js';

function harness() {
  const created = [];
  const byId = new Map();
  const create = (tagName) => {
    const listeners = new Map();
    const children = [];
    const element = {
      tagName,
      style: {},
      children,
      textContent: '',
      value: '',
      checked: false,
      removed: false,
      addEventListener(type, callback) { listeners.set(type, callback); },
      append(...items) { items.forEach((item) => element.appendChild(item)); },
      appendChild(item) { children.push(item); if (item.id) byId.set(`#${item.id}`, item); },
      remove() { element.removed = true; },
      click() { return listeners.get('click')?.({ target: element }); },
    };
    created.push(element);
    return element;
  };
  return {
    created,
    byId,
    dom: {
      create,
      query: (selector) => byId.get(selector) || null,
      appendToBody(element) { if (element.id) byId.set(`#${element.id}`, element); },
    },
  };
}

describe('reward alert settings modal', () => {
  it('exposes preview and notification tests and saves normalized settings', async () => {
    const ui = harness();
    const onPreview = vi.fn(async () => true);
    const onTestDesktop = vi.fn(async () => true);
    const onTestNtfy = vi.fn(async () => true);
    const onSave = vi.fn(async () => true);
    const overlay = showRewardAlertSettings({
      dom: ui.dom,
      settings: { enabled: true, minimumRating: 94, ntfyTopic: 'topic' },
      onPreview,
      onTestDesktop,
      onTestNtfy,
      onSave,
    });

    expect(ui.byId.get('#bronze-loop-alert-test-ntfy').disabled).toBe(false);

    await ui.byId.get('#bronze-loop-alert-preview').click();
    await ui.byId.get('#bronze-loop-alert-test-desktop').click();
    await ui.byId.get('#bronze-loop-alert-test-ntfy').click();
    expect(onPreview).toHaveBeenCalledOnce();
    expect(onTestDesktop).toHaveBeenCalledOnce();
    expect(onTestNtfy).toHaveBeenCalledOnce();

    ui.byId.get('#bronze-loop-alert-minimum-rating').value = '97';
    ui.byId.get('#bronze-loop-alert-ntfy-enabled').checked = true;
    await ui.byId.get('#bronze-loop-alert-save').click();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ minimumRating: 97, ntfyEnabled: true, ntfyTopic: 'topic' }));
    expect(overlay.removed).toBe(true);
  });

  it('disables ntfy testing until the topic is valid', () => {
    const ui = harness();
    showRewardAlertSettings({ dom: ui.dom, settings: { ntfyTopic: '' } });
    expect(ui.byId.get('#bronze-loop-alert-test-ntfy').disabled).toBe(true);
    expect(ui.byId.get('#bronze-loop-alert-test-ntfy').title).toContain('valid ntfy topic');
  });
});
