export function classifyOpenedUpgradeDuplicates(items = [], options = {}) {
  const isDuplicate = options.isDuplicate || (() => false);
  const isEligibleDuplicate = options.isEligibleDuplicate || (() => false);
  const isTradeable = options.isTradeable || (() => false);
  const directClub = [];
  const reservedDuplicates = [];
  const tradeableDuplicates = [];
  const untradeableDuplicates = [];

  for (const item of items || []) {
    if (!isDuplicate(item)) {
      directClub.push(item);
      continue;
    }
    if (isEligibleDuplicate(item)) {
      reservedDuplicates.push(item);
      continue;
    }
    if (isTradeable(item)) tradeableDuplicates.push(item);
    else untradeableDuplicates.push(item);
  }

  return Object.freeze({
    directClub: Object.freeze(directClub),
    reservedDuplicates: Object.freeze(reservedDuplicates),
    tradeableDuplicates: Object.freeze(tradeableDuplicates),
    untradeableDuplicates: Object.freeze(untradeableDuplicates),
  });
}
