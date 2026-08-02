import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const fsuSource = readFileSync(
  new URL('../../FSU_mod/【FSU】EAFC FUT WEB 增强器-26.09_mod.user.js', import.meta.url),
  'utf8',
);

function metadataValue(key) {
  return fsuSource.match(new RegExp(`^// @${key}\\s+(.+)$`, 'm'))?.[1]?.trim() || '';
}

describe('FSU maintained userscript identity', () => {
  it('retains the upstream Tampermonkey identity and GM storage scope', () => {
    expect(metadataValue('name')).toBe('【FSU】EAFC FUT WEB 增强器');
    expect(metadataValue('namespace')).toBe('https://futcd.com/');
  });

  it('uses the maintained GitHub release endpoints without changing identity', () => {
    expect(metadataValue('downloadURL')).toBe(
      'https://github.com/ShatteredLancer/DailyLoopRunner/releases/latest/download/FSU-Local.user.js',
    );
    expect(metadataValue('updateURL')).toBe(
      'https://github.com/ShatteredLancer/DailyLoopRunner/releases/latest/download/FSU-Local.meta.js',
    );
  });
});
