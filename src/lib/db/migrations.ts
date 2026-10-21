import { type IDBPDatabase, type IDBPTransaction } from 'idb';
import { StorageError } from './errors';

export type MigrationFn = (
  db: IDBPDatabase<unknown>,
  transaction: IDBPTransaction<unknown, string[], 'versionchange'>,
) => void | Promise<void>;

export interface Migration {
  version: number;
  description: string;
  apply: MigrationFn;
}

/**
 * Migration Version 1: Initial schema with all 14 object stores and indexes.
 * Source of truth: TECH_STACK.md §5.2
 */
export const migrationV1: Migration = {
  version: 1,
  description: 'Initial schema with 14 object stores and relational indexes',
  apply: (db) => {
    // 1. workspace
    if (!db.objectStoreNames.contains('workspace')) {
      const store = db.createObjectStore('workspace', { keyPath: 'id' });
      store.createIndex('by-updated', 'updatedAt');
    }

    // 2. documents
    if (!db.objectStoreNames.contains('documents')) {
      const store = db.createObjectStore('documents', { keyPath: 'id' });
      store.createIndex('by-created', 'createdAt');
      store.createIndex('by-subject', 'subjectId');
    }

    // 3. documentChunks
    if (!db.objectStoreNames.contains('documentChunks')) {
      const store = db.createObjectStore('documentChunks', { keyPath: 'id' });
      store.createIndex('by-document', 'documentId');
      store.createIndex('by-doc-index', ['documentId', 'chunkIndex']);
    }

    // 4. subjects
    if (!db.objectStoreNames.contains('subjects')) {
      const store = db.createObjectStore('subjects', { keyPath: 'id' });
      store.createIndex('by-title', 'title');
    }

    // 5. concepts
    if (!db.objectStoreNames.contains('concepts')) {
      const store = db.createObjectStore('concepts', { keyPath: 'id' });
      store.createIndex('by-subject', 'subjectId');
      store.createIndex('by-status', 'status');
    }

    // 6. conceptDependencies
    if (!db.objectStoreNames.contains('conceptDependencies')) {
      const store = db.createObjectStore('conceptDependencies', { keyPath: 'id' });
      store.createIndex('by-prerequisite', 'prerequisiteId');
      store.createIndex('by-dependent', 'dependentConceptId');
      store.createIndex('by-prereq-dep', ['prerequisiteId', 'dependentConceptId']);
    }

    // 7. studySessions
    if (!db.objectStoreNames.contains('studySessions')) {
      const store = db.createObjectStore('studySessions', { keyPath: 'id' });
      store.createIndex('by-updated', 'updatedAt');
      store.createIndex('by-status', 'machineState');
    }

    // 8. studyPathItems
    if (!db.objectStoreNames.contains('studyPathItems')) {
      const store = db.createObjectStore('studyPathItems', { keyPath: 'id' });
      store.createIndex('by-session', 'sessionId');
      store.createIndex('by-session-order', ['sessionId', 'orderIndex']);
    }

    // 9. recallQuestions
    if (!db.objectStoreNames.contains('recallQuestions')) {
      const store = db.createObjectStore('recallQuestions', { keyPath: 'id' });
      store.createIndex('by-concept', 'conceptId');
    }

    // 10. recallAttempts
    if (!db.objectStoreNames.contains('recallAttempts')) {
      const store = db.createObjectStore('recallAttempts', { keyPath: 'id' });
      store.createIndex('by-concept', 'conceptId');
      store.createIndex('by-session', 'sessionId');
      store.createIndex('by-created', 'createdAt');
    }

    // 11. masteryStates
    if (!db.objectStoreNames.contains('masteryStates')) {
      const store = db.createObjectStore('masteryStates', { keyPath: 'id' });
      store.createIndex('by-concept', 'conceptId');
      store.createIndex('by-updated', 'updatedAt');
    }

    // 12. spacedRepetitionStates
    if (!db.objectStoreNames.contains('spacedRepetitionStates')) {
      const store = db.createObjectStore('spacedRepetitionStates', { keyPath: 'id' });
      store.createIndex('by-next-due', 'nextDueAt');
      store.createIndex('by-concept', 'conceptId');
    }

    // 13. conversationMessages
    if (!db.objectStoreNames.contains('conversationMessages')) {
      const store = db.createObjectStore('conversationMessages', { keyPath: 'id' });
      store.createIndex('by-session', 'sessionId');
      store.createIndex('by-created', 'createdAt');
    }

    // 14. learningEvents
    if (!db.objectStoreNames.contains('learningEvents')) {
      const store = db.createObjectStore('learningEvents', { keyPath: 'id' });
      store.createIndex('by-event-type', 'eventType');
      store.createIndex('by-created', 'createdAt');
    }
  },
};

/**
 * Migration Version 2 (Test Harness):
 * Proves that version migrations preserve existing records while introducing new schema elements.
 */
export const migrationV2TestHarness: Migration = {
  version: 2,
  description: 'Test harness migration: adds v2 test auxiliary store',
  apply: (db) => {
    if (!db.objectStoreNames.contains('v2_test_metadata')) {
      db.createObjectStore('v2_test_metadata', { keyPath: 'id' });
    }
  },
};

export const MIGRATIONS: Migration[] = [migrationV1, migrationV2TestHarness];

/**
 * Execute registered migrations deterministically from oldVersion to newVersion.
 */
export function runMigrations(
  db: IDBPDatabase<unknown>,
  oldVersion: number,
  newVersion: number,
  transaction: IDBPTransaction<unknown, string[], 'versionchange'>,
  availableMigrations: Migration[] = MIGRATIONS,
): void {
  const applicable = availableMigrations
    .filter((m) => m.version > oldVersion && m.version <= newVersion)
    .sort((a, b) => a.version - b.version);

  for (const migration of applicable) {
    try {
      migration.apply(db, transaction);
    } catch (err) {
      throw new StorageError(
        `Database migration to version ${migration.version} failed: ${err instanceof Error ? err.message : String(err)}. Your data has been preserved. Please export a backup from settings.`,
        'MIGRATION_FAILED',
        err,
      );
    }
  }
}
