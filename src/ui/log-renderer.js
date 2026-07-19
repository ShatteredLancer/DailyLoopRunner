function defaultSchedule(callback) {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
  return setTimeout(callback, 0);
}

function defaultCancel(handle) {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
  else clearTimeout(handle);
}

export function formatLogHtml(lines = [], escapeHtml = String) {
  return lines
    .map((line) => escapeHtml(line).replace(
      /(rating:(?:9[1-9]|[1-9]\d{2,}))/g,
      '<span class="bronze-loop-log-high-rated">$1</span>',
    ))
    .join('\n');
}

export function createLogRenderer(options = {}) {
  const schedule = options.schedule || defaultSchedule;
  const cancel = options.cancel || defaultCancel;
  const getLines = options.getLines || (() => []);
  const getPanel = options.getPanel || (() => null);
  const getLatestBox = options.getLatestBox || (() => null);
  const getFullBox = options.getFullBox || (() => null);
  const formatFullLog = options.formatFullLog || ((lines) => lines.join('\n'));
  let pendingHandle = null;
  let fullLogDirty = true;

  function fullLogVisible(panel) {
    return !!panel && panel.classList?.contains('options-open') && !panel.classList?.contains('icon-only');
  }

  function flush() {
    pendingHandle = null;
    const lines = getLines();
    const latest = lines[lines.length - 1] || 'Ready.';
    const panel = getPanel();
    const latestBox = getLatestBox();
    if (latestBox && !panel?.classList?.contains('options-open') && !panel?.classList?.contains('icon-only')) {
      if (latestBox.textContent !== latest) {
        latestBox.textContent = latest;
        latestBox.scrollTop = 0;
      }
      if (latestBox.title !== latest) latestBox.title = latest;
    }

    if (!fullLogVisible(panel)) return;
    const fullBox = getFullBox();
    if (!fullBox || !fullLogDirty) return;
    const pinnedToBottom = fullBox.scrollHeight - fullBox.scrollTop - fullBox.clientHeight <= 8;
    fullBox.innerHTML = formatFullLog(lines);
    fullLogDirty = false;
    if (pinnedToBottom) fullBox.scrollTop = fullBox.scrollHeight;
  }

  function request() {
    fullLogDirty = true;
    if (pendingHandle !== null) return;
    pendingHandle = schedule(flush);
  }

  function flushNow() {
    fullLogDirty = true;
    if (pendingHandle !== null) {
      cancel(pendingHandle);
      pendingHandle = null;
    }
    flush();
  }

  function destroy() {
    if (pendingHandle !== null) cancel(pendingHandle);
    pendingHandle = null;
  }

  return Object.freeze({ request, flushNow, destroy });
}
