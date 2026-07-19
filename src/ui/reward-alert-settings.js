import { normalizeRewardAlertSettings } from '../reward/pack-highlight.js';

function applyStyles(element, styles) {
  Object.assign(element.style, styles);
}

function inputStyles(input) {
  applyStyles(input, {
    width: '100%', minWidth: '0', height: '30px', boxSizing: 'border-box', background: '#222832',
    color: '#f4f6f8', border: '1px solid #607089', padding: '0 8px',
  });
  return input;
}

function field(dom, labelText, input) {
  const label = dom.create('label');
  applyStyles(label, { display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr)', alignItems: 'center', gap: '10px' });
  const text = dom.create('span');
  text.textContent = labelText;
  applyStyles(text, { color: '#b8c3d2', fontSize: '12px' });
  label.append(text, input);
  return label;
}

function checkbox(dom, id, labelText, checked) {
  const label = dom.create('label');
  applyStyles(label, { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' });
  const input = dom.create('input');
  input.id = id;
  input.type = 'checkbox';
  input.checked = checked === true;
  input.style.accentColor = '#78a6ff';
  const text = dom.create('span');
  text.textContent = labelText;
  label.append(input, text);
  return { label, input };
}

function validNtfyTopic(value) {
  return /^[-_A-Za-z0-9]{1,64}$/.test(String(value || '').trim());
}

export function showRewardAlertSettings(options = {}) {
  const dom = options.dom;
  if (!dom?.create || !dom?.appendToBody) throw new TypeError('dom adapter is required');
  dom.query?.('#bronze-loop-reward-alert-modal')?.remove?.();
  const initial = normalizeRewardAlertSettings(options.settings);
  const overlay = dom.create('div');
  overlay.id = 'bronze-loop-reward-alert-modal';
  applyStyles(overlay, {
    position: 'fixed', inset: '0', zIndex: '1000001', background: 'rgba(0,0,0,.72)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box',
  });
  const dialog = dom.create('div');
  applyStyles(dialog, {
    width: 'min(520px, 100%)', maxHeight: '90vh', overflow: 'auto', background: '#171b21', color: '#f4f6f8',
    border: '1px solid #65758a', padding: '14px', boxSizing: 'border-box', fontFamily: 'Arial, sans-serif',
  });
  const title = dom.create('div');
  title.textContent = 'Reward Alerts';
  applyStyles(title, { fontSize: '16px', fontWeight: '700', marginBottom: '12px' });
  const form = dom.create('div');
  applyStyles(form, { display: 'flex', flexDirection: 'column', gap: '10px' });
  const enabled = checkbox(dom, 'bronze-loop-alert-enabled-modal', 'Enable reward alerts', initial.enabled);
  const highlight = checkbox(dom, 'bronze-loop-alert-highlight-enabled', 'Show pack highlight', initial.highlightEnabled);
  const desktop = checkbox(dom, 'bronze-loop-alert-desktop-enabled', 'Desktop notification', initial.desktopEnabled);
  const ntfy = checkbox(dom, 'bronze-loop-alert-ntfy-enabled', 'ntfy remote notification', initial.ntfyEnabled);
  const threshold = inputStyles(dom.create('input'));
  threshold.id = 'bronze-loop-alert-minimum-rating';
  threshold.type = 'number';
  threshold.min = '1';
  threshold.max = '99';
  threshold.value = String(initial.minimumRating);
  const server = inputStyles(dom.create('input'));
  server.id = 'bronze-loop-alert-ntfy-server';
  server.type = 'url';
  server.value = initial.ntfyServer;
  server.readOnly = true;
  const topic = inputStyles(dom.create('input'));
  topic.id = 'bronze-loop-alert-ntfy-topic';
  topic.type = 'text';
  topic.value = initial.ntfyTopic;
  topic.autocomplete = 'off';
  const token = inputStyles(dom.create('input'));
  token.id = 'bronze-loop-alert-ntfy-token';
  token.type = 'password';
  token.value = initial.ntfyToken;
  token.autocomplete = 'off';
  form.append(
    enabled.label,
    highlight.label,
    field(dom, 'Minimum rating', threshold),
    desktop.label,
    ntfy.label,
    field(dom, 'ntfy server', server),
    field(dom, 'ntfy topic', topic),
    field(dom, 'ntfy token', token),
  );

  const status = dom.create('div');
  applyStyles(status, { minHeight: '16px', marginTop: '10px', color: '#9fb2c9', fontSize: '11px' });
  const tests = dom.create('div');
  applyStyles(tests, { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' });
  const actions = dom.create('div');
  applyStyles(actions, { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' });
  const button = (id, text, primary = false) => {
    const value = dom.create('button');
    value.id = id;
    value.type = 'button';
    value.textContent = text;
    applyStyles(value, {
      minHeight: '30px', padding: '0 12px', cursor: 'pointer', color: '#fff',
      background: primary ? '#2f6fde' : '#222832', border: `1px solid ${primary ? '#4f8cff' : '#607089'}`,
    });
    return value;
  };
  const preview = button('bronze-loop-alert-preview', 'Preview highlight');
  const desktopTest = button('bronze-loop-alert-test-desktop', 'Send desktop test');
  const ntfyTest = button('bronze-loop-alert-test-ntfy', 'Send ntfy test');
  const cancel = button('bronze-loop-alert-cancel', 'Cancel');
  const save = button('bronze-loop-alert-save', 'Save', true);
  tests.append(preview, desktopTest, ntfyTest);
  actions.append(cancel, save);

  const updateNtfyTestState = () => {
    const valid = validNtfyTopic(topic.value);
    ntfyTest.disabled = !valid;
    ntfyTest.title = valid ? 'Send a test notification through ntfy' : 'Enter a valid ntfy topic first';
  };
  topic.addEventListener('input', updateNtfyTestState);
  updateNtfyTestState();

  const draft = () => normalizeRewardAlertSettings({
    enabled: enabled.input.checked,
    highlightEnabled: highlight.input.checked,
    minimumRating: threshold.value,
    desktopEnabled: desktop.input.checked,
    ntfyEnabled: ntfy.input.checked,
    ntfyServer: server.value,
    ntfyTopic: topic.value,
    ntfyToken: token.value,
  });
  const runTest = async (callback, pendingText, successText) => {
    status.textContent = pendingText;
    try {
      await callback(draft());
      status.textContent = successText;
    } catch (error) {
      status.textContent = `Failed: ${error?.message || error}`;
    }
  };
  preview.addEventListener('click', () => runTest(options.onPreview || (() => true), 'Showing preview...', 'Preview shown'));
  desktopTest.addEventListener('click', () => runTest(options.onTestDesktop || (() => true), 'Sending desktop test...', 'Desktop test sent'));
  ntfyTest.addEventListener('click', () => runTest(options.onTestNtfy || (() => true), 'Sending ntfy test...', 'ntfy test sent'));
  const close = () => overlay.remove?.();
  cancel.addEventListener('click', close);
  save.addEventListener('click', async () => {
    try {
      const settings = draft();
      if (settings.ntfyEnabled && !validNtfyTopic(settings.ntfyTopic)) {
        throw new Error('A valid ntfy topic is required when ntfy is enabled');
      }
      await options.onSave?.(settings);
      close();
    } catch (error) {
      status.textContent = `Save failed: ${error?.message || error}`;
    }
  });
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  dialog.append(title, form, tests, status, actions);
  overlay.appendChild(dialog);
  dom.appendToBody(overlay);
  return overlay;
}
