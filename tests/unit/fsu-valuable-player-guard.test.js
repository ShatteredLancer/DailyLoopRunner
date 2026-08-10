import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const fsuSource = readFileSync(
  new URL('../../FSU_mod/【FSU】EAFC FUT WEB 增强器-26.09_mod.user.js', import.meta.url),
  'utf8',
);

describe('FSU valuable-player submit guard', () => {
  it('does not abort submission when the price marker is unavailable', () => {
    expect(fsuSource).toContain('typeof priceItem?.classList?.contains === "function"');
    expect(fsuSource).toContain('events.emitClubDiagnostic?.(');
    expect(fsuSource).toContain('valuable-player-price-missing');
    expect(fsuSource).not.toContain("view?.getItemView()?._fsu?.priceItem.classList.contains('precious')");
  });

  it('keeps the precious marker check when the price element is available', () => {
    expect(fsuSource).toContain('priceItem.classList.contains("precious")');
    expect(fsuSource).toContain('call.squad.submit.call(controller,e)');
  });
});
