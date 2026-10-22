import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getNotificationStatus,
  requestNotificationPermission,
  sendReviewNotification,
} from '@/features/spaced-repetition/notifications';

describe('Best-Effort In-App Review Notifications (notifications.test.ts)', () => {
  const originalNotification = global.Notification;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).Notification = originalNotification;
  });

  describe('Permission & Status Invariants', () => {
    it('returns "unsupported" when Notification API is not available on window', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (global as any).Notification;
      expect(getNotificationStatus()).toBe('unsupported');
    });

    it('returns current permission status without prompting user', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any).Notification = {
        permission: 'default',
        requestPermission: vi.fn(),
      };

      const status = getNotificationStatus();
      expect(status).toBe('default');
      // Proves no permission was requested merely by checking status
      expect(global.Notification.requestPermission).not.toHaveBeenCalled();
    });

    it('calls Notification.requestPermission() ONLY when requestNotificationPermission is explicitly executed', async () => {
      const mockRequestPermission = vi.fn().mockResolvedValue('granted');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any).Notification = {
        permission: 'default',
        requestPermission: mockRequestPermission,
      };

      // Nothing called yet
      expect(mockRequestPermission).not.toHaveBeenCalled();

      // User clicked toggle -> explicit action
      const result = await requestNotificationPermission();
      expect(mockRequestPermission).toHaveBeenCalledTimes(1);
      expect(result).toBe('granted');
    });

    it('handles permission denied gracefully', async () => {
      const mockRequestPermission = vi.fn().mockResolvedValue('denied');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any).Notification = {
        permission: 'default',
        requestPermission: mockRequestPermission,
      };

      const result = await requestNotificationPermission();
      expect(result).toBe('denied');
    });

    it('handles requestPermission throwing gracefully', async () => {
      const mockRequestPermission = vi.fn().mockRejectedValue(new Error('Permission prompt dismissed'));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any).Notification = {
        permission: 'default',
        requestPermission: mockRequestPermission,
      };

      const result = await requestNotificationPermission();
      expect(result).toBe('denied');
    });
  });

  describe('sendReviewNotification Dispatching', () => {
    it('does NOT send notification if permission is not granted', () => {
      const mockConstructor = vi.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any).Notification = mockConstructor;
      (global.Notification as unknown as { permission: string }).permission = 'denied';

      const sent = sendReviewNotification({
        title: 'Review Due',
        body: 'You have 1 review due.',
      });

      expect(sent).toBe(false);
      expect(mockConstructor).not.toHaveBeenCalled();
    });

    it('dispatches notification when permission is granted', () => {
      const mockConstructor = vi.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any).Notification = mockConstructor;
      (global.Notification as unknown as { permission: string }).permission = 'granted';

      const sent = sendReviewNotification({
        title: 'Review Due',
        body: 'Cell Respiration is due today.',
      });

      expect(sent).toBe(true);
      expect(mockConstructor).toHaveBeenCalledWith(
        'Review Due',
        expect.objectContaining({
          body: 'Cell Respiration is due today.',
          tag: 'edumentor-review-reminder',
        }),
      );
    });
  });
});
