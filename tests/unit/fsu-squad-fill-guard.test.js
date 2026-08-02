import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const fsuSource = readFileSync(
  new URL('../../FSU_mod/【FSU】EAFC FUT WEB 增强器-26.09_mod.user.js', import.meta.url),
  'utf8',
);

function sourceSection(startMarker, endMarker) {
  const start = fsuSource.indexOf(startMarker);
  const end = fsuSource.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`FSU source section is missing: ${startMarker}`);
  return fsuSource.slice(start, end);
}

describe('FSU native squad fill Club readiness guards', () => {
  it('keeps the shared squad writer behind Club readiness', () => {
    const section = sourceSection(
      '        events.playerListFillSquad = (challenge,list,type) => {',
      '        //阵容智能填充',
    );

    expect(section).toContain('events.requireClubReady("squad fill")');
  });

  it('treats Unassigned as duplicate priority input while guarding Club-backed candidates', () => {
    const section = sourceSection('                        //一键填充按钮', '                }else if(info.set.sbc_dupfill');

    expect(section).toContain('repositories.Item.getUnassignedItems()');
    expect(section).toContain('events.getItemBy(2,getCriteria,unassigned)');
    expect(section).toContain('events.playerListFillSquad');
    expect(section).toContain('events.requireClubReady("one-click squad fill")');
  });

  it('guards Duplicate Fill before it resolves matching Club players', () => {
    const section = sourceSection('                    //重复球员填充按钮', '                //阵容补全按钮');

    expect(section).toContain('events.requireClubReady("duplicate squad fill")');
    expect(section).toContain('events.getItemBy(2,criteria)');
  });
});
