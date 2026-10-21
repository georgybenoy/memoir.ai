import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isQuotaExceededError,
  StorageError,
  normalizeStorageError,
} from '@/lib/db/errors';
import {
  openDatabase,
  closeDatabase,
  removeDatabase,
  safeWrite,
  runTransaction,
} from '@/lib/db/indexeddb';
import { useSaveStatusStore } from '@/lib/state/save-status-store';

describe('Quota and Storage Error Handling', () => {
  const testDbName = 'edumentor-quota-test';

  beforeEach(async () => {
    closeDatabase();
    await removeDatabase(testDbName);
    await openDatabase(testDbName);
    useSaveStatusStore.getState().reset();
  });

  afterEach(async () => {
    closeDatabase();
    await removeDatabase(testDbName);
  });

  it('detects quota exceeded errors across browser variants', () => {
    // 1. Standard Chrome / W3C DOMException
    const chromeErr = new DOMException('Storage quota exceeded', 'QuotaExceededError');
    expect(isQuotaExceededError(chromeErr)).toBe(true);

    // 2. Legacy code 22 DOMException
    const code22Err = { name: 'QuotaExceededError', code: 22 };
    expect(isQuotaExceededError(code22Err)).toBe(true);

    // 3. Firefox NS_ERROR_DOM_QUOTA_REACHED
    const firefoxErr = { name: 'NS_ERROR_DOM_QUOTA_REACHED', code: 1014 };
    expect(isQuotaExceededError(firefoxErr)).toBe(true);

    // 4. Safari / WebKit quota error string
    const safariErr = new Error('The quota has been exceeded.');
    expect(isQuotaExceededError(safariErr)).toBe(true);

    // 5. Generic Error should NOT be detected as quota
    const normalErr = new Error('Connection refused');
    expect(isQuotaExceededError(normalErr)).toBe(false);
  });

  it('normalizes quota error into StorageError with QUOTA_EXCEEDED code', () => {
    const quotaErr = new DOMException('Disk space exhausted', 'QuotaExceededError');
    const normalized = normalizeStorageError(quotaErr);

    expect(normalized).toBeInstanceOf(StorageError);
    expect(normalized.code).toBe('QUOTA_EXCEEDED');
    expect(normalized.message).toContain('quota exceeded');
  });

  it('safeWrite intercepts simulated QuotaExceededError and throws QUOTA_EXCEEDED', async () => {
    const failingOp = async () => {
      throw new DOMException('Simulated browser quota exhaustion', 'QuotaExceededError');
    };

    let caught: unknown;
    try {
      await safeWrite(failingOp);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(StorageError);
    expect((caught as StorageError).code).toBe('QUOTA_EXCEEDED');
  });

  it('simulated quota error leaves no partial write in multi-store transaction', async () => {
    const attempt = {
      id: 'att-quota-1',
      sessionId: 'sess-1',
      questionId: 'q-1',
      conceptId: 'c-1',
      answerText: 'Answer',
      confidence: 'high' as const,
      qualityGrade: 5,
      evaluationMode: 'hybrid' as const,
      pendingEvaluation: false,
      createdAt: '2026-05-01T10:00:00.000Z',
    };

    const mastery = {
      id: 'm-quota-1',
      conceptId: 'c-1',
      level: 2,
      percentage: 50,
      bestScore: 50,
      attemptCount: 1,
      updatedAt: '2026-05-01T10:00:00.000Z',
    };

    let txError: unknown;
    try {
      await runTransaction(
        ['recallAttempts', 'masteryStates'],
        'readwrite',
        async (tx) => {
          await tx.objectStore('recallAttempts').put(attempt);
          await tx.objectStore('masteryStates').put(mastery);
          // Simulate QuotaExceededError during the write
          throw new DOMException('Out of storage space', 'QuotaExceededError');
        },
        testDbName,
      );
    } catch (err) {
      txError = err;
    }

    expect(txError).toBeInstanceOf(StorageError);
    expect((txError as StorageError).code).toBe('QUOTA_EXCEEDED');

    // Confirm that the first write was rolled back and is NOT present in the database
    const db = await openDatabase(testDbName);
    const savedAttempt = await db.get('recallAttempts', 'att-quota-1');
    const savedMastery = await db.get('masteryStates', 'm-quota-1');

    expect(savedAttempt).toBeUndefined();
    expect(savedMastery).toBeUndefined();
  });

  it('save-status store transitions to error on failure and does not report saved', () => {
    const store = useSaveStatusStore.getState();

    // 1. Initial state
    expect(store.status).toBe('idle');

    // 2. Start saving
    store.setSaving();
    expect(useSaveStatusStore.getState().status).toBe('saving');

    // 3. Mark error with StorageError
    const storageErr = new StorageError('Storage quota exceeded', 'QUOTA_EXCEEDED');
    store.setError(storageErr.message);

    const errorState = useSaveStatusStore.getState();
    expect(errorState.status).toBe('error');
    expect(errorState.errorMessage).toContain('Storage quota exceeded');
    expect(errorState.lastSavedAt).toBeNull(); // Never reported as saved
  });
});
