/**
 * Storage status and quota estimation service.
 * Source of truth: TECH_STACK.md §5.4 and PRD FR-17.
 */

export interface StorageEstimateInfo {
  supported: boolean;
  usageBytes?: number;
  quotaBytes?: number;
  percentUsed?: number;
  formattedUsage?: string;
  formattedQuota?: string;
  isPersisted?: boolean;
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Estimate storage usage and available quota via navigator.storage.estimate().
 */
export async function getStorageEstimate(): Promise<StorageEstimateInfo> {
  if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.estimate) {
    return { supported: false };
  }

  try {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage ?? 0;
    const quota = estimate.quota ?? 0;
    const percentUsed = quota > 0 ? (usage / quota) * 100 : undefined;

    let isPersisted: boolean | undefined = undefined;
    if (navigator.storage.persisted) {
      try {
        isPersisted = await navigator.storage.persisted();
      } catch {
        // ignore errors checking persisted
      }
    }

    return {
      supported: true,
      usageBytes: usage,
      quotaBytes: quota,
      percentUsed: percentUsed !== undefined ? Math.round(percentUsed * 10) / 10 : undefined,
      formattedUsage: formatBytes(usage),
      formattedQuota: formatBytes(quota),
      isPersisted,
    };
  } catch {
    return { supported: false };
  }
}

/**
 * Request persistent storage permission from the browser.
 * NOTE: MUST be triggered ONLY by an explicit user action (button click). Never call automatically.
 */
export async function requestPersistentStorage(): Promise<{
  supported: boolean;
  persisted: boolean;
  message: string;
}> {
  if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.persist) {
    return {
      supported: false,
      persisted: false,
      message: 'Persistent storage API is not supported in this browser.',
    };
  }

  try {
    const isPersisted = await navigator.storage.persist();
    if (isPersisted) {
      return {
        supported: true,
        persisted: true,
        message: 'Storage persistence granted. Browser will not automatically evict data.',
      };
    }
    return {
      supported: true,
      persisted: false,
      message: 'Browser declined persistent storage. Data may still be cleared if device runs low on disk space.',
    };
  } catch (err) {
    return {
      supported: true,
      persisted: false,
      message: `Failed to request persistent storage: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
