import { isPlainObject } from '../domain/objects.js';

export function isMvpLoopDef(definition = {}) {
  return definition.mvp === true || /(?:^|-)mvp(?:-|$)/i.test(String(definition.id || ''));
}

export function visibleLoopDefs(loopDefs = [], showMvpLoops = false) {
  return (loopDefs || []).filter((definition) => {
    if (isMvpLoopDef(definition)) return showMvpLoops === true;
    return definition.hidden !== true;
  });
}

function filterPileList(piles, disabledPiles, path) {
  if (!Array.isArray(piles) || !piles.length || !disabledPiles?.size) return piles;
  const filtered = piles.filter((pile) => !disabledPiles.has(pile));
  if (!filtered.length) throw new Error(`${path} has no enabled piles after disabledPiles`);
  return filtered;
}

function filterRequirements(requirements, disabledPiles, path) {
  if (!Array.isArray(requirements)) return;
  requirements.forEach((requirement, index) => {
    requirement.priorityPiles = filterPileList(
      requirement.priorityPiles,
      disabledPiles,
      `${path}[${index}].priorityPiles`,
    );
  });
}

export function applyDisabledPiles(loopDef) {
  const disabledPiles = new Set(loopDef?.disabledPiles || []);
  if (!disabledPiles.size) return loopDef;

  loopDef.priorityPiles = filterPileList(loopDef.priorityPiles, disabledPiles, 'priorityPiles');
  loopDef.primaryPiles = filterPileList(loopDef.primaryPiles, disabledPiles, 'primaryPiles');
  loopDef.clubFallbackPiles = filterPileList(loopDef.clubFallbackPiles, disabledPiles, 'clubFallbackPiles');
  if (isPlainObject(loopDef.ratingSbcFill)) {
    loopDef.ratingSbcFill.priorityPiles = filterPileList(
      loopDef.ratingSbcFill.priorityPiles,
      disabledPiles,
      'ratingSbcFill.priorityPiles',
    );
  }
  filterRequirements(loopDef.requirements, disabledPiles, 'requirements');
  (loopDef.challengeRequirements || []).forEach((requirements, index) => {
    filterRequirements(requirements, disabledPiles, `challengeRequirements[${index}]`);
  });

  for (const upgradeName of ['commonUpgrade', 'rareUpgrade']) {
    const upgradeDef = loopDef[upgradeName];
    if (!isPlainObject(upgradeDef)) continue;
    upgradeDef.priorityPiles = filterPileList(upgradeDef.priorityPiles, disabledPiles, `${upgradeName}.priorityPiles`);
    filterRequirements(upgradeDef.requirements, disabledPiles, `${upgradeName}.requirements`);
    (upgradeDef.challengeRequirements || []).forEach((requirements, index) => {
      filterRequirements(requirements, disabledPiles, `${upgradeName}.challengeRequirements[${index}]`);
    });
  }

  (loopDef.craftingUpgrades || []).forEach((upgradeDef, index) => {
    if (!isPlainObject(upgradeDef)) return;
    upgradeDef.priorityPiles = filterPileList(upgradeDef.priorityPiles, disabledPiles, `craftingUpgrades[${index}].priorityPiles`);
    filterRequirements(upgradeDef.requirements, disabledPiles, `craftingUpgrades[${index}].requirements`);
    (upgradeDef.challengeRequirements || []).forEach((requirements, challengeIndex) => {
      filterRequirements(requirements, disabledPiles, `craftingUpgrades[${index}].challengeRequirements[${challengeIndex}]`);
    });
  });

  (loopDef.stages || []).forEach((stageDef, index) => {
    if (!isPlainObject(stageDef)) return;
    stageDef.priorityPiles = filterPileList(stageDef.priorityPiles, disabledPiles, `stages[${index}].priorityPiles`);
    filterRequirements(stageDef.requirements, disabledPiles, `stages[${index}].requirements`);
    (stageDef.challengeRequirements || []).forEach((requirements, challengeIndex) => {
      filterRequirements(requirements, disabledPiles, `stages[${index}].challengeRequirements[${challengeIndex}]`);
    });
  });

  return loopDef;
}
