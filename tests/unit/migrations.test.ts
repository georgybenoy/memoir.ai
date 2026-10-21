import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDB } from 'idb';
import {
  openDatabase,
  closeDatabase,
  removeDatabase,
} from '@/lib/db/indexeddb';
import {
  migrationV1,
  migrationV2TestHarness,
  type Migration,
} from '@/lib/db/migrations';
import { StorageError } from '@/lib/db/errors';

describe('IndexedDB Migrations', () => {
  const testDbName = 'edumentor-migration-test';

  beforeEach(async () => {
    closeDatabase();
    await removeDatabase(testDbName);
  });

  afterEach(async () => {
    closeDatabase();
    await removeDatabase(testDbName);
  });

  it('runs migration v0 -> v1 and creates all 14 stores with indexes', async () => {
    const db = await openDatabase(testDbName, 1, [migrationV1]);
    expect(db).toBeDefined();

    const expectedStores = [
      'workspace',
      'documents',
      'documentChunks',
      'subjects',
      'concepts',
      'conceptDependencies',
      'studySessions',
      'studyPathItems',
      'recallQuestions',
      'recallAttempts',
      'masteryStates',
      'spacedRepetitionStates',
      'conversationMessages',
      'learningEvents',
    ];

    for (const storeName of expectedStores) {
      expect(
        db.objectStoreNames.contains(storeName),
        `Store ${storeName} should exist`,
      ).toBe(true);
    }

    // Verify critical indexes
    const chunkStore = db.transaction('documentChunks').objectStore('documentChunks');
    expect(chunkStore.indexNames.contains('by-document')).toBe(true);
    expect(chunkStore.indexNames.contains('by-doc-index')).toBe(true);

    const srStore = db.transaction('spacedRepetitionStates').objectStore('spacedRepetitionStates');
    expect(srStore.indexNames.contains('by-next-due')).toBe(true);
    expect(srStore.indexNames.contains('by-concept')).toBe(true);

    const depStore = db.transaction('conceptDependencies').objectStore('conceptDependencies');
    expect(depStore.indexNames.contains('by-prereq-dep')).toBe(true);
  });

  it('executes v2 test harness migration and preserves existing data', async () => {
    // 1. Open database at v1 and populate a concept
    const dbV1 = await openDatabase(testDbName, 1, [migrationV1]);
    await dbV1.put('concepts', {
      id: 'concept-os-1',
      title: 'Process Scheduling',
      summary: 'Round-robin and priority scheduling',
      canonicalExplanation: 'OS mechanisms for time-sharing CPU cores.',
      keyTerms: ['quantum', 'preemption', 'context switch'],
      sourceChunkIds: ['chunk-1'],
      tier: 1,
      status: 'available',
      confidence: 0.95,
      extractionOrder: 0,
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
    });
    closeDatabase();

    // 2. Upgrade to v2 with migrationV2TestHarness
    const dbV2 = await openDatabase(testDbName, 2, [migrationV1, migrationV2TestHarness]);
    expect(dbV2.version).toBe(2);
    expect(dbV2.objectStoreNames.contains('v2_test_metadata')).toBe(true);

    // 3. Confirm existing data was preserved
    const retrievedConcept = await dbV2.get('concepts', 'concept-os-1');
    expect(retrievedConcept).toBeDefined();
    expect(retrievedConcept?.title).toBe('Process Scheduling');
    expect(retrievedConcept?.keyTerms).toContain('quantum');
  });

  it('surfaces MIGRATION_FAILED StorageError and preserves data on migration failure', async () => {
    // 1. Create v1 database with data
    const dbV1 = await openDatabase(testDbName, 1, [migrationV1]);
    await dbV1.put('subjects', {
      id: 'subj-1',
      title: 'Distributed Systems',
      description: 'Consensus and replication',
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
    });
    closeDatabase();

    // 2. Define a failing migration
    const failingMigration: Migration = {
      version: 2,
      description: 'Failing migration',
      apply: () => {
        throw new Error('Disk full during index rebuild');
      },
    };

    // 3. Attempt upgrade - should throw StorageError with MIGRATION_FAILED
    let capturedErr: unknown;
    try {
      await openDatabase(testDbName, 2, [migrationV1, failingMigration]);
    } catch (err) {
      capturedErr = err;
    }

    expect(capturedErr).toBeInstanceOf(StorageError);
    const storageErr = capturedErr as StorageError;
    expect(storageErr.code).toBe('MIGRATION_FAILED');
    expect(storageErr.message).toContain('Please export a backup');

    // 4. Confirm data is still intact at v1
    closeDatabase(testDbName);
    const dbRecovered = await openDB(testDbName, 1);
    const subject = await dbRecovered.get('subjects', 'subj-1');
    expect(subject).toBeDefined();
    expect(subject.title).toBe('Distributed Systems');
    dbRecovered.close();
  });
});
