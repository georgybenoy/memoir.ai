import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export const DB_NAME = 'edumentor-local';
export const DB_VERSION = 1;

/**
 * EduMentor local database schema for IndexedDB.
 * Source of truth: TECH_STACK.md §5 and Phase 1 specifications.
 */
export interface EduMentorDB extends DBSchema {
  notes: {
    key: string;
    value: {
      id: string;
      title: string;
      content: string;
      createdAt: string;
      updatedAt: string;
      subjectId?: string;
    };
    indexes: {
      'by-updated': string;
      'by-subject': string;
    };
  };
  chunks: {
    key: string;
    value: {
      id: string;
      noteId: string;
      chunkIndex: number;
      text: string;
      metadata?: Record<string, unknown>;
    };
    indexes: {
      'by-note': string;
      'by-note-index': [string, number];
    };
  };
  embeddings: {
    key: string;
    value: {
      chunkId: string;
      vector: number[];
      model: string;
      createdAt: string;
    };
  };
  evaluations: {
    key: string;
    value: {
      id: string;
      sessionId: string;
      questionId: string;
      score: number;
      mode: 'hybrid' | 'judge-only' | 'fallback';
      feedback: string;
      createdAt: string;
    };
    indexes: {
      'by-session': string;
    };
  };
  review_items: {
    key: string;
    value: {
      id: string;
      conceptId: string;
      nextReviewAt: string;
      interval: number;
      repetition: number;
      efactor: number;
      updatedAt: string;
    };
    indexes: {
      'by-next-review': string;
      'by-concept': string;
    };
  };
  sessions: {
    key: string;
    value: {
      id: string;
      noteId?: string;
      state: string;
      startedAt: string;
      endedAt?: string;
    };
    indexes: {
      'by-started': string;
    };
  };
  settings: {
    key: string;
    value: {
      key: string;
      value: unknown;
      updatedAt: string;
    };
  };
}

/** Custom error thrown when browser storage quota is exceeded */
export class StorageQuotaExceededError extends Error {
  constructor(
    message = 'Browser storage quota exceeded. Please export a backup and clear unused data.',
  ) {
    super(message);
    this.name = 'StorageQuotaExceededError';
  }
}

/** General storage error wrapper */
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

/** Check if an unknown error is a QuotaExceededError across browsers */
export function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number };
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 || // DOMException.QUOTA_EXCEEDED_ERR
    e.code === 1014 // NS_ERROR_DOM_QUOTA_REACHED
  );
}

let _dbInstance: IDBPDatabase<EduMentorDB> | null = null;

/**
 * Open the EduMentor IndexedDB database with versioning and migration hooks.
 */
export async function getDatabase(
  dbName = DB_NAME,
  version = DB_VERSION,
): Promise<IDBPDatabase<EduMentorDB>> {
  if (_dbInstance && dbName === DB_NAME && _dbInstance.version === version) {
    return _dbInstance;
  }

  try {
    const db = await openDB<EduMentorDB>(dbName, version, {
      upgrade(db, oldVersion) {
        // Version 1 migrations
        if (oldVersion < 1) {
          // Notes store
          if (!db.objectStoreNames.contains('notes')) {
            const noteStore = db.createObjectStore('notes', { keyPath: 'id' });
            noteStore.createIndex('by-updated', 'updatedAt');
            noteStore.createIndex('by-subject', 'subjectId');
          }

          // Chunks store
          if (!db.objectStoreNames.contains('chunks')) {
            const chunkStore = db.createObjectStore('chunks', { keyPath: 'id' });
            chunkStore.createIndex('by-note', 'noteId');
            chunkStore.createIndex('by-note-index', ['noteId', 'chunkIndex']);
          }

          // Embeddings store
          if (!db.objectStoreNames.contains('embeddings')) {
            db.createObjectStore('embeddings', { keyPath: 'chunkId' });
          }

          // Evaluations store
          if (!db.objectStoreNames.contains('evaluations')) {
            const evalStore = db.createObjectStore('evaluations', { keyPath: 'id' });
            evalStore.createIndex('by-session', 'sessionId');
          }

          // Review items store
          if (!db.objectStoreNames.contains('review_items')) {
            const reviewStore = db.createObjectStore('review_items', { keyPath: 'id' });
            reviewStore.createIndex('by-next-review', 'nextReviewAt');
            reviewStore.createIndex('by-concept', 'conceptId');
          }

          // Sessions store
          if (!db.objectStoreNames.contains('sessions')) {
            const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
            sessionStore.createIndex('by-started', 'startedAt');
          }

          // Settings store
          if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings', { keyPath: 'key' });
          }
        }
      },
      blocked() {
        console.warn('EduMentor IndexedDB upgrade blocked by older tab/connection');
      },
      blocking() {
        console.warn('EduMentor IndexedDB blocking upgrade, closing connection');
        _dbInstance?.close();
        _dbInstance = null;
      },
      terminated() {
        console.warn('EduMentor IndexedDB connection unexpectedly terminated');
        _dbInstance = null;
      },
    });

    if (dbName === DB_NAME) {
      _dbInstance = db;
    }
    return db;
  } catch (err) {
    if (isQuotaExceededError(err)) {
      throw new StorageQuotaExceededError();
    }
    throw new StorageError('Failed to open local database', err);
  }
}

/** Close active connection (useful in test cleanup) */
export function closeDatabase(): void {
  if (_dbInstance) {
    _dbInstance.close();
    _dbInstance = null;
  }
}

/**
 * Execute a write operation safely, handling quota errors explicitly.
 */
export async function safeWrite<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (isQuotaExceededError(err)) {
      throw new StorageQuotaExceededError();
    }
    throw new StorageError('Storage write failed', err);
  }
}
