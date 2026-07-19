const DESTINATION_COLORS = Object.freeze({
  club: '#5cffa0',
  transfer: '#5c8aff',
  storage: '#ff9d4a',
  unknown: '#536171',
});

const DESTINATION_LABELS = Object.freeze({
  club: '->CLUB',
  transfer: '->TRANSFER',
  storage: '->STORAGE',
  unknown: '->?',
});

function applyStyles(element, styles) {
  Object.assign(element.style, styles);
}

export function createPlayerPickRecapModel(pickResults = []) {
  const entries = Array.isArray(pickResults) ? pickResults : [];
  const cards = entries.flatMap((entry) => entry?.pickedCards || []);
  if (!cards.length) return null;

  const ratings = cards.map((card) => Number(card.rating || 0));
  const destinations = cards.reduce((counts, card) => {
    const destination = card.destination || 'unknown';
    counts[destination] = (counts[destination] || 0) + 1;
    return counts;
  }, {});
  const rows = entries
    .flatMap((entry, pickIndex) => (entry?.pickedCards || []).map((card) => ({
      card,
      pickIndex: pickIndex + 1,
      resumed: entry?.resumed === true,
    })))
    .sort((a, b) => Number(b.card.rating || 0) - Number(a.card.rating || 0) || a.pickIndex - b.pickIndex);

  return Object.freeze({
    cards,
    entries,
    rows,
    minRating: Math.min(...ratings),
    maxRating: Math.max(...ratings),
    specialCount: cards.filter((card) => card.special).length,
    duplicateCount: cards.filter((card) => card.duplicate).length,
    highRatedCount: cards.filter((card) => Number(card.rating || 0) >= 91).length,
    resumedCount: entries.filter((entry) => entry?.resumed).length,
    destinations,
  });
}

export function showPlayerPickRecap(options = {}) {
  if (!options.dom?.create || !options.dom?.appendToBody) throw new TypeError('dom adapter is required');
  if (typeof options.itemDisplayName !== 'function') throw new TypeError('itemDisplayName is required');
  if (typeof options.formatPrice !== 'function') throw new TypeError('formatPrice is required');
  if (typeof options.scheduleStopCheck !== 'function') throw new TypeError('scheduleStopCheck is required');
  if (typeof options.cancelStopCheck !== 'function') throw new TypeError('cancelStopCheck is required');

  const model = createPlayerPickRecapModel(options.pickResults);
  if (!model) return Promise.resolve(false);

  return new Promise((resolve) => {
    let stopTimer = null;
    const overlay = options.dom.create('div');
    overlay.id = 'bronze-loop-recap-modal';
    applyStyles(overlay, {
      position: 'fixed', inset: '0', zIndex: '100000', background: 'rgba(0, 0, 0, 0.78)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box',
    });

    const dialog = options.dom.create('div');
    applyStyles(dialog, {
      width: 'min(620px, 100%)', maxHeight: '90vh', overflow: 'auto', background: '#171b21', color: '#f3f5f7',
      border: '1px solid #65758a', padding: '12px 14px', boxSizing: 'border-box', fontFamily: 'Arial, sans-serif',
    });
    const title = options.dom.create('div');
    title.textContent = `Player Pick Recap: ${String(options.name || '')}`;
    applyStyles(title, { fontWeight: '700', marginBottom: '4px', fontSize: '16px' });

    const destinationSummary = Object.entries(model.destinations)
      .map(([destination, count]) => `${count} ${DESTINATION_LABELS[destination] || destination}`)
      .join(', ');
    const summary = options.dom.create('div');
    summary.textContent = `${model.entries.length} pick(s), ${model.cards.length} card(s), rating ${model.minRating}-${model.maxRating}, ${model.specialCount} special, ${model.duplicateCount} duplicate, ${model.highRatedCount} rated 91+${destinationSummary ? `, ${destinationSummary}` : ''}${model.resumedCount ? `, ${model.resumedCount} resumed` : ''}`;
    applyStyles(summary, { color: '#9aa6b8', marginBottom: '8px', fontSize: '12px' });

    const list = options.dom.create('div');
    applyStyles(list, { display: 'flex', flexDirection: 'column', gap: '6px' });
    for (const { card, pickIndex, resumed } of model.rows) {
      const rating = Number(card.rating || 0);
      const highRated = rating >= 91;
      const destination = card.destination || 'unknown';
      const row = options.dom.create('div');
      applyStyles(row, {
        padding: '6px 8px', fontSize: '13px', color: '#f3f5f7',
        background: highRated ? '#3a2f15' : card.special ? '#26223a' : '#1d2229',
        borderLeft: `3px solid ${highRated ? '#ffd54a' : card.special ? '#7a5cff' : DESTINATION_COLORS[destination] || DESTINATION_COLORS.unknown}`,
        display: 'flex', gap: '8px', alignItems: 'baseline',
      });
      const nameRating = options.dom.create('span');
      applyStyles(nameRating, { flex: '1 1 auto', minWidth: '0', display: 'flex', gap: '6px', alignItems: 'baseline', overflow: 'hidden' });
      const name = options.dom.create('span');
      name.textContent = options.itemDisplayName(card.item);
      applyStyles(name, { fontWeight: '600', flex: '0 1 auto', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
      const ratingText = options.dom.create('span');
      ratingText.textContent = `- ${rating}`;
      applyStyles(ratingText, { color: highRated ? '#ffd54a' : '#f3f5f7', fontWeight: '700', flex: '0 0 auto' });
      const pickTag = options.dom.create('span');
      pickTag.textContent = `P${pickIndex}${resumed ? 'r' : ''}`;
      applyStyles(pickTag, { color: '#7d8898', fontSize: '11px', fontWeight: '600', flex: '0 0 auto' });
      nameRating.append(name, ratingText, pickTag);

      const destinationTag = options.dom.create('span');
      destinationTag.textContent = DESTINATION_LABELS[destination] || destination;
      applyStyles(destinationTag, { color: DESTINATION_COLORS[destination] || DESTINATION_COLORS.unknown, fontSize: '11px', fontWeight: '600', flex: '0 0 auto' });
      const tags = options.dom.create('span');
      const price = options.formatPrice(card.price);
      tags.textContent = `${card.special ? 'special' : 'normal'}${card.duplicate ? ', duplicate' : ''}${price ? `, price:${price}` : ''}`;
      applyStyles(tags, { color: '#9aa6b8', fontSize: '11px', flex: '0 0 auto', whiteSpace: 'nowrap' });
      row.append(nameRating, destinationTag, tags);
      list.appendChild(row);
    }

    const closeButton = options.dom.create('button');
    closeButton.type = 'button';
    closeButton.textContent = 'Close';
    applyStyles(closeButton, {
      marginTop: '10px', minHeight: '30px', padding: '0 14px', background: '#2f6fde', color: '#fff',
      border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '13px',
    });

    const finish = () => {
      if (stopTimer !== null) options.cancelStopCheck(stopTimer);
      overlay.remove();
      options.onClose?.();
      resolve(true);
    };
    closeButton.addEventListener('click', finish);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) finish(); });
    dialog.append(title, summary, list, closeButton);
    overlay.appendChild(dialog);
    options.dom.appendToBody(overlay);
    if (model.specialCount > 0) options.celebrate?.(dialog, model.specialCount);
    stopTimer = options.scheduleStopCheck(() => {
      if (options.isStopping?.()) finish();
    }, 250);
  });
}
