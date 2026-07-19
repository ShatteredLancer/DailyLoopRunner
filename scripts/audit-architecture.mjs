import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'src', 'userscript-entry.js'), 'utf8');
const rules = [
  { name: 'workflow Pack Adapter.open', regex: /\bpackAdapter\.open\s*\(/g, expected: 1 },
  { name: 'workflow direct pack model.open', regex: /\b(?:currentPack|selectedPack|pack)\.open\s*\(/g, expected: 0 },
  { name: 'workflow SBC.saveChallenge', regex: /\bW\.services\.SBC\.saveChallenge\s*\(/g, expected: 0 },
  { name: 'workflow SBC.submitChallenge', regex: /\bW\.services\.SBC\.submitChallenge\s*\(/g, expected: 0 },
  { name: 'workflow Player Pick redeem', regex: /\bW\.services\.Item\.redeem\s*\(/g, expected: 0 },
  { name: 'workflow Player Pick confirm', regex: /\bW\.services\.Item\.confirmPlayerPickItemSelection\s*\(/g, expected: 0 },
  { name: 'workflow GM_xmlhttpRequest', regex: /\bGM_xmlhttpRequest\s*\(/g, expected: 0 },
  { name: 'workflow direct fetch', regex: /(^|[^.\w])fetch\s*\(/gm, expected: 0 },
  { name: 'workflow direct FSU window.info', regex: /\bW\.info\b/g, expected: 0 },
  { name: 'workflow FSU runtime discovery helpers', regex: /function\s+(?:readFsuSettingsFromInfo|readFsuSettingsFromWindow|readFsuLockedPlayersFromWindow|readFsuLockedPlayers)\s*\(/g, expected: 0 },
  { name: 'workflow direct My Packs repository', regex: /\b(?:W\.)?(?:repositories|services)[^\n;]*\.myPacks\b/g, expected: 0 },
  { name: 'workflow direct Store.getPacks', regex: /\bW\.services\.Store\.getPacks\s*\(/g, expected: 0 },
  { name: 'workflow direct getAppMain', regex: /\bW\.getAppMain\s*\(/g, expected: 0 },
  { name: 'workflow page readiness helpers', regex: /function\s+(?:areFutServicesReady|hasFutMainDom|isMainFutControllerName)\s*\(/g, expected: 0 },
  { name: 'workflow direct page shields', regex: /\bW\.g(?:ClickShield|PopupClickShield)\b/g, expected: 0 },
  { name: 'workflow direct inventory capacity', regex: /\bW\.repositories\.Item\.(?:getPileSize|numItemsInCache)\s*\(/g, expected: 0 },
  { name: 'workflow direct Item service effects', regex: /\bW\.services\.Item\.(?:requestUnassignedItems|move)\s*\(/g, expected: 0 },
  { name: 'workflow direct Localization service', regex: /\bW\.services\.Localization\.localize\s*\(/g, expected: 0 },
  { name: 'workflow direct SBC repositories/services', regex: /\bW\.(?:services\.SBC|repositories\.Squad)\b/g, expected: 0 },
  { name: 'workflow direct SBC submit settings', regex: /\bW\.services\.(?:UserSettings|Chemistry)\b/g, expected: 0 },
  { name: 'workflow direct inventory enums', regex: /\bW\.(?:ItemPile|PlayerInjury)\b/g, expected: 0 },
  { name: 'workflow remaining direct W properties', regex: /\bW\.[A-Za-z_$][A-Za-z0-9_$]*/g, expected: 0 },
  { name: 'workflow direct Clipboard/download effects', regex: /\bnavigator\.clipboard\b|\bnew\s+Blob\b|\bURL\.(?:createObjectURL|revokeObjectURL)\b/g, expected: 0 },
  { name: 'workflow direct DOM event constructors', regex: /\bnew\s+(?:PointerEvent|MouseEvent|KeyboardEvent)\s*\(/g, expected: 0 },
  { name: 'workflow inline rating eligibility parser', regex: /function\s+(?:requirementFirstKey|flattenRequirementValues|requirementValues|itemMatchesDynamicRequirement)\s*\(/g, expected: 0 },
  { name: 'workflow inline Player Pick recap DOM', regex: /overlay\.id\s*=\s*['"]bronze-loop-recap-modal['"]/g, expected: 0 },
  { name: 'workflow duplicate rating materialization', regex: /function\s+(?:comparePileSelections|mergePileCounts|ratingGroupSelectionOptions|buildRatingMaterializationContext|materializeRatingVector)\s*\(/g, expected: 0 },
  { name: 'workflow inline config schema helpers', regex: /function\s+(?:validateStringArray|validateNumberArray|validatePileList|validateCardSpec|validateRequirements|validateUpgradeDef|validateShortagePacks|validateRecoveryAction|validateRecoveryRecipeList|validateRecoveryPolicyList|validateRecoveryPolicyIds)\s*\(/g, expected: 0 },
  { name: 'workflow inline LOOP_DEFS', regex: /\bconst\s+LOOP_DEFS\s*=\s*\[/g, expected: 0 },
  { name: 'workflow inline reward claim loop', regex: /while\s*\(Date\.now\(\)\s*-\s*start\s*<\s*25000\)/g, expected: 0 },
  { name: 'workflow inline rating candidate planner', regex: /\bconst\s+submissionByDefinition\s*=\s*new\s+Map\s*\(\)/g, expected: 0 },
  { name: 'workflow inline run-limit switch', regex: /function\s+getLiveRunLimit\s*\([^)]*\)\s*\{[\s\S]*?strategy\s*===\s*['"]validationBronzeUpgrade['"]/g, expected: 0 },
  { name: 'workflow inline routine step projection', regex: /step\s+\$\{index\s*\+\s*1\}\s+cannot reference itself/g, expected: 0 },
  { name: 'workflow inline configured strategy dispatch', regex: /function\s+executeConfiguredLoopInternal\s*\(/g, expected: 0 },
  { name: 'workflow obsolete compatibility helpers', regex: /function\s+(?:setLoopDefs|getEditorLoopStrategy|findBronzeUpgradeSet|isEligibleTotwForLoop|getEligibleTotwEntries|summarizeTotwEntries|sortTotwEntriesForSubmit|isCommonGoldPlayer|isCommonGoldDuplicate|isLowCommonGoldDuplicate)\s*\(/g, expected: 0 },
  { name: 'workflow inline Pick runtime option projection', regex: /function\s+applyPickRuntimeOptions\s*\(/g, expected: 0 },
];

let failed = false;
for (const rule of rules) {
  const count = source.match(rule.regex)?.length || 0;
  console.log(`${rule.name}: ${count} direct call site(s), baseline ${rule.expected}`);
  if (process.argv.includes('--check') && count !== rule.expected) failed = true;
}
const packAdapter = await readFile(path.join(root, 'src', 'adapters', 'ea', 'pack.js'), 'utf8');
const packAdapterOpenCount = packAdapter.match(/\bpack\.open\s*\(/g)?.length || 0;
console.log(`Pack Adapter pack.open: ${packAdapterOpenCount} direct call site(s), baseline 1`);
if (process.argv.includes('--check') && packAdapterOpenCount !== 1) failed = true;
const packAdapterRefreshCount = packAdapter.match(/\bservice\.getPacks\s*\(/g)?.length || 0;
console.log(`Pack Adapter Store.getPacks: ${packAdapterRefreshCount} direct call site(s), baseline 1`);
if (process.argv.includes('--check') && packAdapterRefreshCount !== 1) failed = true;

const sbcAdapter = await readFile(path.join(root, 'src', 'adapters', 'ea', 'sbc.js'), 'utf8');
for (const [name, regex] of [
  ['SBC Adapter saveChallenge', /\bservice\.saveChallenge\s*\(/g],
  ['SBC Adapter submitChallenge', /\bservice\.submitChallenge\s*\(/g],
]) {
  const count = sbcAdapter.match(regex)?.length || 0;
  console.log(`${name}: ${count} direct call site(s), baseline 1`);
  if (process.argv.includes('--check') && count !== 1) failed = true;
}

const playerPickAdapter = await readFile(path.join(root, 'src', 'adapters', 'ea', 'player-pick.js'), 'utf8');
for (const [name, regex] of [
  ['Player Pick Adapter redeem', /\bservice\.redeem\s*\(/g],
  ['Player Pick Adapter confirm', /\bservice\.confirmPlayerPickItemSelection\s*\(/g],
]) {
  const count = playerPickAdapter.match(regex)?.length || 0;
  console.log(`${name}: ${count} direct call site(s), baseline 1`);
  if (process.argv.includes('--check') && count !== 1) failed = true;
}

const runFunctions = [...source.matchAll(/^\s*(?:async\s+)?function\s+(run[A-Za-z0-9_]+)\s*\(/gm)].map((match) => match[1]);
console.log(`Workflow functions: ${runFunctions.length} (${runFunctions.join(', ')})`);

if (failed) {
  throw new Error('Architecture baseline changed; update the implementation or review the baseline intentionally');
}
