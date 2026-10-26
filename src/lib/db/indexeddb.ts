import { openDB, deleteDB, type IDBPDatabase, type IDBPTransaction } from 'idb';
import {
  type WorkspaceRecord,
  type DocumentRecord,
  type DocumentChunkRecord,
  type SubjectRecord,
  type ConceptRecord,
  type ConceptDependencyRecord,
  type StudySessionRecord,
  type StudyPathItemRecord,
  type RecallQuestionRecord,
  type RecallAttemptRecord,
  type MasteryStateRecord,
  type SpacedRepetitionStateRecord,
  type ConversationMessageRecord,
  type LearningEventRecord,
  type LearningUnitRecord,
  type MaterialProcessingRecord,
  type MaterialFileRecord,
  type WorkflowStateRecord,
} from '@/types/domain';
import { SCHEMA_VERSION } from './schema';
import { runMigrations, MIGRATIONS, type Migration } from './migrations';
import { StorageError, normalizeStorageError } from './errors';

export const DB_NAME = 'edumentor-local';

/**
 * Fully typed IndexedDB schema for EduMentor.
 * Source of truth: TECH_STACK.md §5.2 and PRD §11.
 */
export interface EduMentorDBSchema {
  workspace: {
    key: string;
    value: WorkspaceRecord;
    indexes: {
      'by-updated': string;
    };
  };
  documents: {
    key: string;
    value: DocumentRecord;
    indexes: {
      'by-created': string;
      'by-subject': string;
      'by-file-hash': string;
      'by-content-hash': string;
    };
  };
  documentChunks: {
    key: string;
    value: DocumentChunkRecord;
    indexes: {
      'by-document': string;
      'by-doc-index': [string, number];
      'by-material': string;
    };
  };
  subjects: {
    key: string;
    value: SubjectRecord;
    indexes: {
      'by-title': string;
    };
  };
  concepts: {
    key: string;
    value: ConceptRecord;
    indexes: {
      'by-subject': string;
      'by-status': string;
      'by-material': string;
      'by-unit': string;
    };
  };
  conceptDependencies: {
    key: string;
    value: ConceptDependencyRecord;
    indexes: {
      'by-prerequisite': string;
      'by-dependent': string;
      'by-prereq-dep': [string, string];
    };
  };
  studySessions: {
    key: string;
    value: StudySessionRecord;
    indexes: {
      'by-updated': string;
      'by-status': string;
      'by-material': string;
      'by-unit': string;
    };
  };
  studyPathItems: {
    key: string;
    value: StudyPathItemRecord;
    indexes: {
      'by-session': string;
      'by-session-order': [string, number];
    };
  };
  recallQuestions: {
    key: string;
    value: RecallQuestionRecord;
    indexes: {
      'by-concept': string;
      'by-material': string;
    };
  };
  recallAttempts: {
    key: string;
    value: RecallAttemptRecord;
    indexes: {
      'by-concept': string;
      'by-session': string;
      'by-created': string;
      'by-material': string;
    };
  };
  masteryStates: {
    key: string;
    value: MasteryStateRecord;
    indexes: {
      'by-concept': string;
      'by-updated': string;
    };
  };
  spacedRepetitionStates: {
    key: string;
    value: SpacedRepetitionStateRecord;
    indexes: {
      'by-next-due': string;
      'by-concept': string;
    };
  };
  conversationMessages: {
    key: string;
    value: ConversationMessageRecord;
    indexes: {
      'by-session': string;
      'by-created': string;
    };
  };
  learningEvents: {
    key: string;
    value: LearningEventRecord;
    indexes: {
      'by-event-type': string;
      'by-created': string;
    };
  };
  learningUnits: {
    key: string;
    value: LearningUnitRecord;
    indexes: {
      'by-material': string;
      'by-material-order': [string, number];
      'by-updated': string;
    };
  };
  processing: {
    key: string;
    value: MaterialProcessingRecord;
    indexes: {
      'by-stage': string;
      'by-updated': string;
    };
  };
  materialFiles: {
    key: string;
    value: MaterialFileRecord;
    indexes: {
      'by-created': string;
    };
  };
  workflowState: {
    key: string; // materialId
    value: WorkflowStateRecord;
    indexes: {
      'by-material': string;
      'by-updated': string;
    };
  };
}

export type StoreName =
  | 'workspace'
  | 'documents'
  | 'documentChunks'
  | 'subjects'
  | 'concepts'
  | 'conceptDependencies'
  | 'studySessions'
  | 'studyPathItems'
  | 'recallQuestions'
  | 'recallAttempts'
  | 'masteryStates'
  | 'spacedRepetitionStates'
  | 'conversationMessages'
  | 'learningEvents'
  | 'learningUnits'
  | 'processing'
  | 'materialFiles'
  | 'workflowState';

const _openDatabases = new Map<string, IDBPDatabase<EduMentorDBSchema>>();

/**
 * Open the EduMentor IndexedDB database with versioned migrations and connection listeners.
 */
export async function openDatabase(
  dbName = DB_NAME,
  version = SCHEMA_VERSION,
  customMigrations: Migration[] = MIGRATIONS,
): Promise<IDBPDatabase<EduMentorDBSchema>> {
  const existing = _openDatabases.get(dbName);
  if (existing) {
    if (existing.version === version) {
      return existing;
    }
    // Version mismatch: close existing connection first so upgrade can proceed
    existing.close();
    _openDatabases.delete(dbName);
  }

  let migrationError: StorageError | null = null;

  try {
    const db = await openDB<EduMentorDBSchema>(dbName, version, {
      async upgrade(db, oldVersion, newVersion, transaction) {
        // Prevent unhandled rejection on tx.done when tx.abort() is called during migration failure
        transaction.done.catch(() => {});
        try {
          await runMigrations(
            db as unknown as IDBPDatabase<unknown>,
            oldVersion,
            newVersion ?? version,
            transaction as unknown as IDBPTransaction<unknown, string[], 'versionchange'>,
            customMigrations,
          );
        } catch (err) {
          migrationError =
            err instanceof StorageError
              ? err
              : new StorageError(
                  `Database migration failed: ${err instanceof Error ? err.message : String(err)}. Your data has been preserved. Please export a backup from settings.`,
                  'MIGRATION_FAILED',
                  err,
                );
          try {
            transaction.abort();
          } catch {
            // ignore
          }
        }
      },
      blocked() {
        const msg = 'EduMentor IndexedDB upgrade blocked by older connection in another tab or window.';
        console.warn(msg);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('edumentor:db-blocked', {
              detail: { message: msg },
            }),
          );
        }
      },
      blocking() {
        console.warn('EduMentor IndexedDB connection is blocking an upgrade, closing');
        closeDatabase(dbName);
      },
      terminated() {
        console.warn('EduMentor IndexedDB connection abruptly terminated');
        _openDatabases.delete(dbName);
      },
    });

    _openDatabases.set(dbName, db);
    return db;
  } catch (err) {
    if (migrationError) {
      throw migrationError;
    }
    throw normalizeStorageError(err, 'Failed to open IndexedDB database');
  }
}

/** Close active connection(s) */
export function closeDatabase(dbName?: string): void {
  if (dbName) {
    const db = _openDatabases.get(dbName);
    if (db) {
      db.close();
      _openDatabases.delete(dbName);
    }
  } else {
    for (const [, db] of _openDatabases) {
      try {
        db.close();
      } catch {
        // ignore
      }
    }
    _openDatabases.clear();
  }
}

/** Delete an IndexedDB database completely */
export async function removeDatabase(dbName = DB_NAME): Promise<void> {
  closeDatabase(dbName);
  try {
    await deleteDB(dbName);
  } catch (err) {
    throw normalizeStorageError(err, 'Failed to delete IndexedDB database');
  }
}

/**
 * Execute a multi-store transaction atomically across one or more stores.
 * If fn throws or fails, the transaction is automatically aborted.
 */
export async function runTransaction<
  T,
  Mode extends 'readonly' | 'readwrite' = 'readwrite',
>(
  storeNames: StoreName[],
  mode: Mode,
  fn: (tx: IDBPTransaction<EduMentorDBSchema, StoreName[], Mode>) => Promise<T>,
  dbName = DB_NAME,
): Promise<T> {
  const db = await openDatabase(dbName);
  const tx = db.transaction(storeNames, mode);

  try {
    const result = await fn(tx);
    await tx.done;
    return result;
  } catch (err) {
    tx.done.catch(() => {});
    try {
      tx.abort();
    } catch {
      // ignore abort if already aborted or finished
    }
    throw normalizeStorageError(err, 'Storage transaction failed');
  }
}

/**
 * Wrap a single storage write operation with quota error normalization.
 */
export async function safeWrite<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    throw normalizeStorageError(err);
  }
}
