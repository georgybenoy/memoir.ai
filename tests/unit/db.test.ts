import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { type StoreNames } from 'idb';
import {
  getDatabase,
  closeDatabase,
  safeWrite,
  StorageQuotaExceededError,
  isQuotaExceededError,
  type EduMentorDB,
} from '@/lib/storage/db';

describe('IndexedDB Storage Wrapper', () => {
  let testDbName: string;

  beforeEach(() => {
    closeDatabase();
    testDbName = `edumentor-test-${Math.random().toString(36).slice(2)}`;
  });

  afterEach(() => {
    closeDatabase();
  });

  it('opens database and executes version 1 migrations creating all stores', async () => {
    const db = await getDatabase(testDbName, 1);
    expect(db).toBeDefined();

    const expectedStores: StoreNames<EduMentorDB>[] = [
      'notes',
      'chunks',
      'embeddings',
      'evaluations',
      'review_items',
      'sessions',
      'settings',
    ];

    for (const store of expectedStores) {
      expect(db.objectStoreNames.contains(store)).toBe(true);
    }
  });

  it('performs basic CRUD operations on notes store', async () => {
    const db = await getDatabase(testDbName, 1);

    const testNote = {
      id: 'note-1',
      title: 'Operating Systems - Concurrency',
      content: 'Threads, mutexes, condition variables and deadlocks.',
      createdAt: '2026-05-01T10:00:00Z',
      updatedAt: '2026-05-01T10:00:00Z',
      subjectId: 'cs-301',
    };

    // Create
    await db.put('notes', testNote);

    // Read
    const retrieved = await db.get('notes', 'note-1');
    expect(retrieved).toBeDefined();
    expect(retrieved?.title).toBe('Operating Systems - Concurrency');

    // Update
    testNote.title = 'Operating Systems - Concurrency & Synchronization';
    await db.put('notes', testNote);
    const updated = await db.get('notes', 'note-1');
    expect(updated?.title).toBe('Operating Systems - Concurrency & Synchronization');

    // Delete
    await db.delete('notes', 'note-1');
    const deleted = await db.get('notes', 'note-1');
    expect(deleted).toBeUndefined();
  });

  it('detects quota exceeded errors via isQuotaExceededError', () => {
    const domQuotaError = new DOMException('Storage quota exceeded', 'QuotaExceededError');
    expect(isQuotaExceededError(domQuotaError)).toBe(true);

    const firefoxQuotaError = { name: 'NS_ERROR_DOM_QUOTA_REACHED', code: 1014 };
    expect(isQuotaExceededError(firefoxQuotaError)).toBe(true);

    const regularError = new Error('Random failure');
    expect(isQuotaExceededError(regularError)).toBe(false);
  });

  it('safeWrite intercepts quota errors and throws StorageQuotaExceededError', async () => {
    const failingOp = async () => {
      const quotaErr = new DOMException('Quota limit reached', 'QuotaExceededError');
      throw quotaErr;
    };

    await expect(safeWrite(failingOp)).rejects.toThrow(StorageQuotaExceededError);
  });
});
