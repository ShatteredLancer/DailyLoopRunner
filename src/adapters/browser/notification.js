function normalizedServer(value) {
  const url = new URL(String(value || 'https://ntfy.sh'));
  if (url.protocol !== 'https:') throw new Error('ntfy server must use HTTPS');
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

export function createNotificationAdapter(options = {}) {
  const gmNotification = options.gmNotification;
  const http = options.http;

  async function desktop(message = {}) {
    if (typeof gmNotification !== 'function') throw new Error('GM_notification is unavailable');
    gmNotification({
      title: String(message.title || 'Daily Loop Runner'),
      text: String(message.body || ''),
      timeout: Math.max(1000, Number(message.timeout || 8000) || 8000),
      silent: message.silent === true,
    });
    return true;
  }

  async function ntfy(message = {}, config = {}) {
    if (!http?.postText) throw new Error('HTTP transport is unavailable');
    const topic = String(config.topic || '').trim();
    if (!topic) throw new Error('ntfy topic is required');
    if (!/^[-_A-Za-z0-9]{1,64}$/.test(topic)) throw new Error('ntfy topic contains unsupported characters');
    const server = normalizedServer(config.server);
    const headers = {
      'Content-Type': 'text/plain; charset=UTF-8',
      'X-Title': String(message.title || 'Daily Loop Runner'),
      'X-Tags': 'tada,soccer',
      'X-Priority': 'high',
    };
    const token = String(config.token || '').trim();
    if (token) headers.Authorization = `Bearer ${token}`;
    await http.postText(`${server}/${encodeURIComponent(topic)}`, String(message.body || ''), {
      headers,
      sendCookies: false,
      timeout: Math.max(1000, Number(config.timeout || 15000) || 15000),
    });
    return true;
  }

  return Object.freeze({ desktop, ntfy });
}
