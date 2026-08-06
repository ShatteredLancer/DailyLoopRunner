import { describe, expect, it } from 'vitest';
import {
  applyResponsiveDialogLayout,
  readResponsiveUiMode,
  responsiveControlHeight,
} from '../../src/ui/responsive-dialog.js';

describe('responsive dialog layout', () => {
  it('reads the shared page layout without browser globals', () => {
    const root = { getAttribute: (name) => name.endsWith('layout') ? 'mobile' : 'touch' };
    const mode = readResponsiveUiMode({ query: () => root });
    expect(mode).toEqual({ layout: 'mobile', input: 'touch', mobile: true, touchTargets: true });
    expect(responsiveControlHeight(mode)).toBe('44px');
  });

  it('turns a mobile dialog into a safe-area full-screen surface', () => {
    const overlay = { style: {} };
    const dialog = { style: {} };
    const title = { style: {} };
    const actions = { style: {} };
    const input = { tagName: 'INPUT', style: {} };
    applyResponsiveDialogLayout({
      mode: { mobile: true, touchTargets: true },
      overlay,
      dialog,
      title,
      actions,
      controls: [input],
    });
    expect(dialog.style).toMatchObject({ width: '100%', height: '100dvh', maxHeight: '100dvh', border: '0' });
    expect(actions.style.position).toBe('sticky');
    expect(input.style).toMatchObject({ minHeight: '44px', fontSize: '16px' });
  });
});
