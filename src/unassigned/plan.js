function itemRef(item) {
  return item?.ref || { id: Number(item?.id || 0), definitionId: Number(item?.definitionId || 0), pile: 'unassigned' };
}

function findClubDuplicate(item, clubItems) {
  if (item.duplicateId) {
    const direct = clubItems.find((candidate) => candidate.id === item.duplicateId);
    if (direct) return direct;
  }
  return clubItems.find((candidate) => candidate.definitionId === item.definitionId && candidate.id !== item.id) || null;
}

function action(type, destination, items, description) {
  return {
    status: 'action',
    action: {
      type,
      destination,
      itemRefs: items.map(itemRef),
      description,
    },
  };
}

function blocked(destination, items, free, description) {
  return {
    status: 'blocked',
    blocked: {
      destination,
      required: items.length,
      free,
      itemRefs: items.map(itemRef),
      description,
    },
  };
}

export function planUnassignedActions(snapshot, options = {}) {
  const unassigned = snapshot?.piles?.unassigned || [];
  const club = snapshot?.piles?.club || [];
  const reserveItem = options.reserveItem || (() => false);
  const reserved = unassigned.filter(reserveItem);
  const items = unassigned.filter((item) => !reserveItem(item));

  if (!items.length) {
    return {
      status: reserved.length ? 'preserved' : 'empty',
      reservedItemRefs: reserved.map(itemRef),
    };
  }

  const nonDuplicates = items.filter((item) => !item.duplicate);
  if (nonDuplicates.length) return action('move', 'club', nonDuplicates, 'non-duplicate');

  const tradeableDuplicates = items.filter((item) => item.duplicate && item.tradeable);
  if (tradeableDuplicates.length) {
    const free = snapshot.capacities?.transfer?.free ?? null;
    if (free !== null && tradeableDuplicates.length > free) {
      return blocked('transfer', tradeableDuplicates, free, 'tradeable duplicate');
    }
    return action('move', 'transfer', tradeableDuplicates, 'tradeable duplicate');
  }

  const untradeableDuplicates = items.filter((item) => item.duplicate && !item.tradeable);
  const swappable = untradeableDuplicates.filter((item) => findClubDuplicate(item, club)?.tradeable === true);
  if (swappable.length) {
    const free = snapshot.capacities?.transfer?.free ?? null;
    if (free !== null && swappable.length > free) {
      return blocked('transfer', swappable, free, 'swappable duplicate');
    }
    return action('swap', 'club', swappable, 'swappable duplicate');
  }

  if (untradeableDuplicates.length) {
    const free = snapshot.capacities?.storage?.free ?? null;
    if (free !== null && untradeableDuplicates.length > free) {
      return blocked('storage', untradeableDuplicates, free, 'untradeable duplicate');
    }
    return action('move', 'storage', untradeableDuplicates, 'untradeable duplicate');
  }

  return {
    status: 'unclassified',
    itemRefs: items.map(itemRef),
    reservedItemRefs: reserved.map(itemRef),
  };
}

export function unassignedFingerprint(snapshot) {
  return (snapshot?.piles?.unassigned || [])
    .map((item) => [item.id, item.definitionId, Number(item.duplicate), item.duplicateId, Number(item.tradeable)].join(':'))
    .sort()
    .join('|');
}
