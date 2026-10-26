import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  openDatabase,
  closeDatabase,
  removeDatabase,
} from '@/lib/db/indexeddb';
import {
  isQuotaExceededError,
  normalizeStorageError,
  StorageError,
} from '@/lib/db/errors';

describe('IndexedDB Storage Engine & Quota Detection', () => {
  let testDbName: string;

  beforeEach(async () => {
    closeDatabase();
    testDbName = `edumentor-test-${Math.random().toString(36).slice(2)}`;
  });

  afterEach(async () => {
    closeDatabase();
    await removeDatabase(testDbName);
  });

  it('opens database with current schema and verifies core stores', async () => {
    const db = await openDatabase(testDbName);
    expect(db).toBeDefined();

    const expectedStores = [
      'documents',
      'documentChunks',
      'concepts',
      'conceptDependencies',
      'learningUnits',
      'studySessions',
      'conversationMessages',
      'processing',
    ];

    for (const store of expectedStores) {
      expect(db.objectStoreNames.contains(store)).toBe(true);
    }
  });

  it('performs basic CRUD operations on documents store', async () => {
    const db = await openDatabase(testDbName);

    const testDoc = {
      id: 'doc-1',
      materialId: 'doc-1',
      filename: 'OS_Concurrency.txt',
      fileType: 'txt' as const,
      fileSize: 1024,
      extractedText: 'Threads and synchronization.',
      analysisStatus: 'pending' as const,
      fileHash: 'hash1',
      contentHash: 'hash1',
      contentVersion: 'hash1',
      promptVersion: '1.0',
      createdAt: '2026-05-01T10:00:00Z',
      updatedAt: '2026-05-01T10:00:00Z',
    };

    // Create
    await db.put('documents', testDoc);

    // Read
    const retrieved = await db.get('documents', 'doc-1');
    expect(retrieved).toBeDefined();
    expect(retrieved?.filename).toBe('OS_Concurrency.txt');

    // Update
    testDoc.filename = 'OS_Concurrency_V2.txt';
    await db.put('documents', testDoc);
    const updated = await db.get('documents', 'doc-1');
    expect(updated?.filename).toBe('OS_Concurrency_V2.txt');

    // Delete
    await db.delete('documents', 'doc-1');
    const deleted = await db.get('documents', 'doc-1');
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

  it('normalizeStorageError maps quota error to StorageError with QUOTA_EXCEEDED code', () => {
    const quotaErr = new DOMException('Quota limit reached', 'QuotaExceededError');
    const normalized = normalizeStorageError(quotaErr);

    expect(normalized).toBeInstanceOf(StorageError);
    expect(normalized.code).toBe('QUOTA_EXCEEDED');
  });
});
