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

export function triggerPlayerPickRecapFireworks(dialog, specialCount, runtime = {}) {
  if (!dialog || !runtime.dom?.create || typeof runtime.requestFrame !== 'function') return;
  if (runtime.getComputedStyle?.(dialog)?.position === 'static') dialog.style.position = 'relative';
  dialog.style.isolation = 'isolate';

  const canvas = runtime.dom.create('canvas');
  canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:35%;pointer-events:none;z-index:-1;overflow:hidden;';
  dialog.insertBefore(canvas, dialog.firstChild);
  const width = Math.max(220, canvas.clientWidth);
  const height = Math.max(120, canvas.clientHeight);
  const dpr = Math.min(2, Number(runtime.devicePixelRatio?.() || 1));
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext?.('2d');
  if (!context) {
    canvas.remove();
    return;
  }
  context.scale(dpr, dpr);

  const palette = ['#ffd54a', '#ff5c5c', '#5c8aff', '#5cffa0', '#7a5cff', '#ff9d4a', '#ff5cb1', '#5ce0ff'];
  const random = runtime.random || Math.random;
  const intensity = Math.max(1, Math.min(6, Number(specialCount) || 1));
  const particlesPerBurst = 70 + intensity * 14;
  const particles = [];
  const burstSchedule = [80, 700, 1400];
  const columns = [0.22, 0.5, 0.78];
  const startMs = runtime.now?.() || 0;
  let lastBurstIndex = -1;

  function spawnBurst(x, y) {
    particles.push({ x, y, life: 1, decay: 0.05, color: '#fff', size: 14 + random() * 6, isFlash: true });
    for (let index = 0; index < particlesPerBurst; index++) {
      const angle = (index / particlesPerBurst) * Math.PI * 2 + (random() - 0.5) * 0.5;
      const speed = 1.5 + random() * 3.5;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.8,
        color: palette[Math.floor(random() * palette.length)],
        life: 1,
        decay: 0.006 + random() * 0.012,
        size: 0.9 + random() * 1.4,
      });
    }
  }

  function tick(now) {
    const elapsed = now - startMs;
    if (elapsed > 3000 || !canvas.isConnected) {
      canvas.remove();
      return;
    }
    for (let burst = lastBurstIndex + 1; burst < burstSchedule.length; burst++) {
      if (elapsed < burstSchedule[burst]) break;
      spawnBurst(width * columns[burst] + (random() - 0.5) * 30, height * (0.18 + random() * 0.12));
      lastBurstIndex = burst;
    }

    context.fillStyle = 'rgba(0, 0, 0, 0.18)';
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = 'lighter';
    for (let index = particles.length - 1; index >= 0; index--) {
      const particle = particles[index];
      particle.vy = Number(particle.vy || 0) + 0.06;
      particle.vx = Number(particle.vx || 0) * 0.985;
      particle.vy *= 0.985;
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.life -= particle.decay;
      if (particle.life <= 0 || particle.y > height + 30 || particle.x < -30 || particle.x > width + 30) {
        particles.splice(index, 1);
        continue;
      }
      context.shadowColor = particle.color;
      context.shadowBlur = particle.isFlash ? 18 : 9;
      context.fillStyle = particle.color;
      context.globalAlpha = Math.max(0, Math.min(1, particle.life));
      context.beginPath();
      context.arc(particle.x, particle.y, particle.isFlash ? particle.size * (1 + (1 - particle.life) * 0.6) : particle.size, 0, Math.PI * 2);
      context.fill();
    }
    context.shadowBlur = 0;
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    runtime.requestFrame(tick);
  }
  runtime.requestFrame(tick);
}
