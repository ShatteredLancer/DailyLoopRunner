import { createFutbinPlayerUrl, resolveRecapCardTheme } from '../reward/recap.js';
import { applyResponsiveDialogLayout, readResponsiveUiMode, responsiveControlHeight } from './responsive-dialog.js';

function applyStyles(element, styles) {
  Object.assign(element.style, styles);
}

function candidateName(candidate, fallback, itemDisplayName) {
  const value = itemDisplayName?.(candidate?.item) || candidate?.item?.name || fallback;
  return String(value || 'Unknown player');
}

function candidateTheme(candidate, resolveNativeTheme) {
  const item = candidate?.item || {};
  const nativeTheme = typeof resolveNativeTheme === 'function'
    ? resolveNativeTheme(item)
    : null;
  const theme = resolveRecapCardTheme({
    rating: Number(candidate?.rating || item.rating || 0),
    special: candidate?.special === true,
    rare: candidate?.rare === true,
    tier: item.tier,
  }, nativeTheme || undefined);
  return {
    accent: theme.accent,
    background: theme.background,
    foreground: theme.foreground,
    rating: theme.rating,
    muted: theme.muted,
  };
}

function candidatePrice(candidate, formatPrice) {
  const value = candidate?.price;
  if (!Number.isFinite(Number(value))) return 'price:?';
  return `price:${formatPrice?.(Number(value)) || Number(value)}`;
}

function candidateFutbinUrl(candidate, resolveFutbinPlayerId) {
  if (typeof resolveFutbinPlayerId !== 'function') return null;
  try {
    return createFutbinPlayerUrl(resolveFutbinPlayerId(candidate?.item));
  } catch {
    return null;
  }
}

export function waitForManualPlayerPickSelection(options = {}) {
  if (!options.dom?.create || !options.dom?.appendToBody) throw new TypeError('dom adapter is required');
  if (typeof options.describeCandidate !== 'function') throw new TypeError('describeCandidate is required');
  if (typeof options.scheduleStopCheck !== 'function') throw new TypeError('scheduleStopCheck is required');
  if (typeof options.cancelStopCheck !== 'function') throw new TypeError('cancelStopCheck is required');

  const ranked = options.ranked || [];
  const pickCount = Math.max(1, Number(options.pickCount || 1) || 1);
  const reason = String(options.reason || 'manual selection required');
  const mode = readResponsiveUiMode(options.dom);

  return new Promise((resolve, reject) => {
    let stopTimer = null;
    const overlay = options.dom.create('div');
    const finish = (callback, value) => {
      if (stopTimer !== null) options.cancelStopCheck(stopTimer);
      overlay.remove();
      callback(value);
    };

    overlay.id = 'bronze-loop-pick-modal';
    applyStyles(overlay, {
      position: 'fixed', inset: '0', zIndex: '100000', background: 'rgba(0, 0, 0, 0.78)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box',
    });
    const dialog = options.dom.create('div');
    applyStyles(dialog, {
      width: 'min(780px, 100%)', maxHeight: '90vh', overflow: 'auto', background: '#171b21', color: '#f3f5f7',
      border: '1px solid #65758a', padding: '16px', boxSizing: 'border-box', fontFamily: 'Arial, sans-serif',
    });
    const title = options.dom.create('div');
    title.textContent = `Manual Player Pick: ${reason}`;
    applyStyles(title, { fontWeight: '700', marginBottom: '8px' });
    const hint = options.dom.create('div');
    hint.textContent = `Select exactly ${pickCount} player(s), then confirm.`;
    applyStyles(hint, { color: '#b7c2d0', marginBottom: '12px' });
    const list = options.dom.create('div');
    applyStyles(list, { display: 'grid', gridTemplateColumns: mode.mobile ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' });
    const selected = new Set();
    const cards = [];
    const confirm = options.dom.create('button');
    confirm.textContent = 'Confirm selection';
    confirm.disabled = true;
    applyStyles(confirm, { marginTop: '14px', minHeight: responsiveControlHeight(mode, 34), padding: '0 14px' });

    const refresh = () => {
      cards.forEach(({ card, candidate }) => {
        card.style.boxShadow = selected.has(candidate) ? '0 0 0 2px #64d77a' : 'none';
      });
      confirm.disabled = selected.size !== pickCount;
    };

    ranked.forEach((candidate) => {
      const card = options.dom.create('div');
      card.role = 'button';
      card.tabIndex = 0;
      const description = String(options.describeCandidate(candidate) || '');
      card.title = description;
      const theme = candidateTheme(candidate, options.resolveNativeTheme);
      applyStyles(card, {
        minHeight: '72px', textAlign: 'left', color: theme.foreground, background: theme.background,
        borderLeft: `4px solid ${theme.accent}`, padding: '8px 10px', cursor: 'pointer', lineHeight: '1.3',
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gridTemplateRows: 'auto auto',
        rowGap: '4px', alignItems: 'center', boxSizing: 'border-box',
      });
      const futbinUrl = candidateFutbinUrl(candidate, options.resolveFutbinPlayerId);
      const name = options.dom.create(futbinUrl ? 'a' : 'span');
      name.textContent = candidateName(candidate, description, options.itemDisplayName);
      name.title = futbinUrl ? `Open ${name.textContent} on FUTBIN` : name.textContent;
      if (futbinUrl) {
        name.href = futbinUrl;
        name.target = '_blank';
        name.rel = 'noopener noreferrer';
        name.addEventListener('click', (event) => event?.stopPropagation?.());
        name.addEventListener('keydown', (event) => event?.stopPropagation?.());
      }
      applyStyles(name, {
        gridColumn: '1', gridRow: '1', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontWeight: '700', color: theme.foreground, textDecoration: futbinUrl ? 'underline' : 'none',
      });
      const tagRow = options.dom.create('div');
      applyStyles(tagRow, {
        gridColumn: '1', gridRow: '2', display: 'flex', alignItems: 'center', gap: '6px', minWidth: '0',
      });
      const ratingBadge = options.dom.create('span');
      ratingBadge.textContent = String(Number(candidate?.rating || 0) || '?');
      ratingBadge.title = `Rating ${ratingBadge.textContent}`;
      applyStyles(ratingBadge, {
        minWidth: '34px', padding: '2px 6px', boxSizing: 'border-box', textAlign: 'center', lineHeight: '18px',
        color: theme.rating, background: theme.accent, borderRadius: '2px', fontWeight: '700', fontSize: '13px',
        flex: '0 0 auto',
      });
      const status = options.dom.create('span');
      status.textContent = candidate?.duplicate ? 'dupe' : 'new';
      status.title = candidate?.duplicate ? 'Duplicate card (already owned)' : 'New card';
      applyStyles(status, {
        color: theme.muted, fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em',
        flex: '0 0 auto',
      });
      const price = options.dom.create('span');
      price.textContent = candidatePrice(candidate, options.formatPrice);
      price.title = price.textContent;
      applyStyles(price, {
        marginLeft: 'auto', whiteSpace: 'nowrap', color: theme.accent, fontWeight: '700', fontSize: '12px',
        flex: '0 0 auto',
      });
      tagRow.append(ratingBadge, status, price);
      card.append(name, tagRow);
      const toggle = () => {
        if (selected.has(candidate)) selected.delete(candidate);
        else if (selected.size < pickCount) selected.add(candidate);
        refresh();
      };
      card.addEventListener('click', toggle);
      card.addEventListener('keydown', (event) => {
        if (!['Enter', ' '].includes(event?.key)) return;
        event.preventDefault?.();
        toggle();
      });
      cards.push({ card, candidate });
      list.appendChild(card);
    });
    confirm.addEventListener('click', () => {
      if (selected.size !== pickCount) return;
      finish(resolve, [...selected].map((candidate) => candidate.item));
    });
    dialog.append(title, hint, list, confirm);
    applyResponsiveDialogLayout({ dom: options.dom, mode, overlay, dialog, title, actions: confirm, controls: [confirm, ...cards.map((entry) => entry.card)] });
    overlay.appendChild(dialog);
    options.dom.appendToBody(overlay);
    refresh();
    stopTimer = options.scheduleStopCheck(() => {
      if (!options.isStopping?.()) return;
      finish(reject, new Error('Stopped by user while a Player Pick selection was pending'));
    }, 250);
  });
}
