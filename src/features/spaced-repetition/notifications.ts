/**
 * Best-effort In-App Review Notifications
 * Source of truth: PRD FR-11, FR-16, AGENTS.md (Honesty Rules)
 *
 * Constraints:
 * 1. Never requests Notification permission on initial page load.
 * 2. Only requests permission upon explicit user click on the settings toggle.
 * 3. Clearly informs user that notifications are best-effort and cannot be guaranteed
 *    when the app/browser is closed.
 * 4. Strictly client-side: no external push servers, no server crons.
 */

export type NotificationSupportStatus = 'unsupported' | 'default' | 'granted' | 'denied';

export function getNotificationStatus(): NotificationSupportStatus {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

/**
 * Requests browser notification permission ONLY after explicit user action.
 */
export async function requestNotificationPermission(): Promise<NotificationSupportStatus> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.warn('Failed to request notification permission:', err);
    return 'denied';
  }
}

/**
 * Dispatches an in-app browser notification if permission is granted.
 */
export function sendReviewNotification(options: {
  title: string;
  body: string;
  onClick?: () => void;
}): boolean {
  if (getNotificationStatus() !== 'granted') {
    return false;
  }

  try {
    const notification = new Notification(options.title, {
      body: options.body,
      icon: '/icon.png',
      tag: 'edumentor-review-reminder',
    });

    if (options.onClick) {
      notification.onclick = () => {
        window.focus();
        options.onClick?.();
        notification.close();
      };
    }

    return true;
  } catch (err) {
    console.warn('Could not display browser notification:', err);
    return false;
  }
}
