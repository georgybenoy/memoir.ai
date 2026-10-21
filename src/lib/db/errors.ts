/**
 * Storage error classifications and handling.
 * Source of truth: TECH_STACK §5.4 and Phase 2 specifications.
 */

export type StorageErrorCode =
  | 'UNAVAILABLE'
  | 'QUOTA_EXCEEDED'
  | 'BLOCKED'
  | 'VERSION_ERROR'
  | 'TRANSACTION_FAILED'
  | 'MIGRATION_FAILED'
  | 'UNKNOWN';

export class StorageError extends Error {
  public readonly code: StorageErrorCode;
  public readonly originalError?: unknown;

  constructor(message: string, code: StorageErrorCode = 'UNKNOWN', originalError?: unknown) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    this.originalError = originalError;
  }
}

/**
 * Robust cross-browser detection of quota exceeded errors.
 */
export function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number; message?: string };
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 || // DOMException.QUOTA_EXCEEDED_ERR
    e.code === 1014 || // NS_ERROR_DOM_QUOTA_REACHED
    (typeof e.message === 'string' && /quota/i.test(e.message))
  );
}

/**
 * Map an unknown storage exception to a typed StorageError.
 */
export function normalizeStorageError(err: unknown, defaultMessage = 'Storage operation failed'): StorageError {
  if (err instanceof StorageError) {
    return err;
  }
  if (isQuotaExceededError(err)) {
    return new StorageError(
      'Browser storage quota exceeded. Please export a backup and clear unused data.',
      'QUOTA_EXCEEDED',
      err,
    );
  }
  if (err && typeof err === 'object') {
    const e = err as { name?: string; message?: string };
    if (e.name === 'VersionError') {
      return new StorageError(
        'Database version conflict. Upgrades must not decrease version.',
        'VERSION_ERROR',
        err,
      );
    }
    if (e.name === 'InvalidStateError' || e.name === 'SecurityError') {
      return new StorageError(
        'IndexedDB is unavailable or blocked (possibly in private browsing mode).',
        'UNAVAILABLE',
        err,
      );
    }
    if (e.message) {
      return new StorageError(e.message, 'UNKNOWN', err);
    }
  }
  return new StorageError(defaultMessage, 'UNKNOWN', err);
}
