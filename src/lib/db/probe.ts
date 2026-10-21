export type PersistenceMode = 'indexeddb' | 'memory';

export interface StorageProbeResult {
  available: boolean;
  mode: PersistenceMode;
  reason?: string;
}

/**
 * Probe whether IndexedDB is functional in the current browser environment.
 * Detects private browsing blocks, quota restrictions, and disabled storage.
 */
export async function probeIndexedDB(): Promise<StorageProbeResult> {
  if (typeof window === 'undefined') {
    return { available: false, mode: 'memory', reason: 'Server environment' };
  }

  const idbFactory =
    window.indexedDB ||
    (window as unknown as { mozIndexedDB?: IDBFactory }).mozIndexedDB ||
    (window as unknown as { webkitIndexedDB?: IDBFactory }).webkitIndexedDB;

  if (!idbFactory) {
    return {
      available: false,
      mode: 'memory',
      reason: 'IndexedDB is not supported by this browser.',
    };
  }

  const probeDbName = `edumentor-probe-${Math.random().toString(36).slice(2)}`;

  return new Promise<StorageProbeResult>((resolve) => {
    let completed = false;

    const timer = setTimeout(() => {
      if (!completed) {
        completed = true;
        resolve({
          available: false,
          mode: 'memory',
          reason: 'IndexedDB probe timed out (possibly blocked or constrained).',
        });
      }
    }, 2000);

    try {
      const request = idbFactory.open(probeDbName, 1);

      request.onerror = (e) => {
        if (!completed) {
          completed = true;
          clearTimeout(timer);
          const error = (e.target as IDBOpenDBRequest)?.error;
          resolve({
            available: false,
            mode: 'memory',
            reason: error?.message || 'IndexedDB access was denied or blocked (private browsing mode).',
          });
        }
      };

      request.onsuccess = () => {
        if (!completed) {
          completed = true;
          clearTimeout(timer);
          try {
            const db = request.result;
            db.close();
            idbFactory.deleteDatabase(probeDbName);
          } catch {
            // ignore cleanup errors
          }
          resolve({
            available: true,
            mode: 'indexeddb',
          });
        }
      };

      request.onblocked = () => {
        if (!completed) {
          completed = true;
          clearTimeout(timer);
          resolve({
            available: false,
            mode: 'memory',
            reason: 'IndexedDB is blocked by another connection.',
          });
        }
      };
    } catch (err) {
      if (!completed) {
        completed = true;
        clearTimeout(timer);
        resolve({
          available: false,
          mode: 'memory',
          reason: err instanceof Error ? err.message : 'IndexedDB initialization threw an exception.',
        });
      }
    }
  });
}

export { probeIndexedDB as probeStorageAvailability };
