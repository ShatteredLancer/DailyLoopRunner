import { describe, expect, it, vi } from 'vitest';
import { createNotificationAdapter } from '../../src/adapters/browser/notification.js';

describe('notification adapter', () => {
  it('uses GM_notification for local desktop alerts', async () => {
    const gmNotification = vi.fn();
    const adapter = createNotificationAdapter({ gmNotification });
    await expect(adapter.desktop({ title: 'Title', body: 'Body' })).resolves.toBe(true);
    expect(gmNotification).toHaveBeenCalledWith(expect.objectContaining({ title: 'Title', text: 'Body' }));
  });

  it('publishes authenticated batched ntfy messages over HTTPS', async () => {
    const http = { postText: vi.fn(async () => 'ok') };
    const adapter = createNotificationAdapter({ http });
    await adapter.ntfy({ title: 'Pack', body: 'Player - 96' }, {
      server: 'https://ntfy.sh/',
      topic: 'private_topic',
      token: 'tk_secret',
    });
    expect(http.postText).toHaveBeenCalledWith(
      'https://ntfy.sh/private_topic',
      'Player - 96',
      expect.objectContaining({
        sendCookies: false,
        headers: expect.objectContaining({ Authorization: 'Bearer tk_secret', 'X-Title': 'Pack' }),
      }),
    );
  });

  it('rejects insecure servers and invalid topics', async () => {
    const adapter = createNotificationAdapter({ http: { postText: vi.fn() } });
    await expect(adapter.ntfy({}, { server: 'http://ntfy.test', topic: 'topic' })).rejects.toThrow(/HTTPS/);
    await expect(adapter.ntfy({}, { server: 'https://ntfy.sh', topic: 'bad topic' })).rejects.toThrow(/unsupported/);
  });
});
