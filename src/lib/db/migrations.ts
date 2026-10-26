import { type IDBPDatabase, type IDBPTransaction, type IDBPObjectStore } from 'idb';
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
 * Migration Version 2: Material Pipeline & Learning Units (Phase R2)
 * Adds learningUnits, processing, and materialFiles stores.
 * Adds materialId and contentVersion indexes across dependent stores.
 * Deterministically backfills legacy v1 records into materials, learning units, and processing records.
 */
export const migrationV2: Migration = {
  version: 2,
  description: 'Add learningUnits, processing, materialFiles stores, materialId indexes, and legacy backfill',
  apply: async (db, transaction) => {
    // 1. Create new object stores if they do not exist
    let unitStore: IDBPObjectStore<unknown, string[], 'learningUnits', 'versionchange'>;
    if (!db.objectStoreNames.contains('learningUnits')) {
      unitStore = db.createObjectStore('learningUnits', { keyPath: 'id' }) as unknown as typeof unitStore;
      unitStore.createIndex('by-material', 'materialId');
      unitStore.createIndex('by-material-order', ['materialId', 'order']);
      unitStore.createIndex('by-updated', 'updatedAt');
    } else {
      unitStore = transaction.objectStore('learningUnits') as unknown as typeof unitStore;
    }

    let procStore: IDBPObjectStore<unknown, string[], 'processing', 'versionchange'>;
    if (!db.objectStoreNames.contains('processing')) {
      procStore = db.createObjectStore('processing', { keyPath: 'id' }) as unknown as typeof procStore;
      procStore.createIndex('by-stage', 'stage');
      procStore.createIndex('by-updated', 'updatedAt');
    } else {
      procStore = transaction.objectStore('processing') as unknown as typeof procStore;
    }

    if (!db.objectStoreNames.contains('materialFiles')) {
      const store = db.createObjectStore('materialFiles', { keyPath: 'id' });
      store.createIndex('by-created', 'createdAt');
    }

    // 2. Add new indexes to existing stores
    const hasDocs = db.objectStoreNames.contains('documents');
    const docStore = hasDocs ? transaction.objectStore('documents') : null;
    if (docStore) {
      if (!docStore.indexNames.contains('by-file-hash')) {
        docStore.createIndex('by-file-hash', 'fileHash');
      }
      if (!docStore.indexNames.contains('by-content-hash')) {
        docStore.createIndex('by-content-hash', 'contentHash');
      }
    }

    const hasChunks = db.objectStoreNames.contains('documentChunks');
    const chunkStore = hasChunks ? transaction.objectStore('documentChunks') : null;
    if (chunkStore && !chunkStore.indexNames.contains('by-material')) {
      chunkStore.createIndex('by-material', 'materialId');
    }

    const hasConcepts = db.objectStoreNames.contains('concepts');
    const conceptStore = hasConcepts ? transaction.objectStore('concepts') : null;
    if (conceptStore) {
      if (!conceptStore.indexNames.contains('by-material')) {
        conceptStore.createIndex('by-material', 'materialId');
      }
      if (!conceptStore.indexNames.contains('by-unit')) {
        conceptStore.createIndex('by-unit', 'unitId');
      }
    }

    const hasSessions = db.objectStoreNames.contains('studySessions');
    const sessionStore = hasSessions ? transaction.objectStore('studySessions') : null;
    if (sessionStore) {
      if (!sessionStore.indexNames.contains('by-material')) {
        sessionStore.createIndex('by-material', 'materialId');
      }
      if (!sessionStore.indexNames.contains('by-unit')) {
        sessionStore.createIndex('by-unit', 'unitId');
      }
    }

    const hasQuestions = db.objectStoreNames.contains('recallQuestions');
    const questionStore = hasQuestions ? transaction.objectStore('recallQuestions') : null;
    if (questionStore && !questionStore.indexNames.contains('by-material')) {
      questionStore.createIndex('by-material', 'materialId');
    }

    const hasAttempts = db.objectStoreNames.contains('recallAttempts');
    const attemptStore = hasAttempts ? transaction.objectStore('recallAttempts') : null;
    if (attemptStore && !attemptStore.indexNames.contains('by-material')) {
      attemptStore.createIndex('by-material', 'materialId');
    }

    // 3. Additive legacy backfill: map existing v1 records to materials & units
    const docs = docStore ? ((await docStore.getAll()) as Array<Record<string, unknown>>) : [];
    const chunks = chunkStore ? ((await chunkStore.getAll()) as Array<Record<string, unknown>>) : [];
    const concepts = conceptStore ? ((await conceptStore.getAll()) as Array<Record<string, unknown>>) : [];
    const sessions = sessionStore ? ((await sessionStore.getAll()) as Array<Record<string, unknown>>) : [];
    const questions = questionStore ? ((await questionStore.getAll()) as Array<Record<string, unknown>>) : [];
    const attempts = attemptStore ? ((await attemptStore.getAll()) as Array<Record<string, unknown>>) : [];

    const chunkDocMap = new Map<string, string>();
    for (const chunk of chunks) {
      if (chunk.id && chunk.documentId) {
        chunkDocMap.set(String(chunk.id), String(chunk.documentId));
      }
    }

    // Backfill documents
    if (docStore) {
      for (const doc of docs) {
        if (!doc.materialId) {
          doc.materialId = doc.id;
        }
        if (!doc.fileHash) {
          doc.fileHash = doc.contentHash || `legacy-file-${doc.id}`;
        }
        if (!doc.contentHash) {
          doc.contentHash = `legacy-content-${doc.id}`;
        }
        if (!doc.contentVersion) {
          doc.contentVersion = String(doc.contentHash);
        }
        if (!doc.promptVersion) {
          doc.promptVersion = '1.0';
        }
        await docStore.put(doc);
      }
    }

    // Backfill chunks
    if (chunkStore) {
      for (const chunk of chunks) {
        if (!chunk.materialId) {
          chunk.materialId = chunk.documentId;
        }
        if (!chunk.contentVersion) {
          const parentDoc = docs.find((d) => d.id === chunk.documentId);
          chunk.contentVersion = (parentDoc?.contentVersion as string) || 'v1';
        }
        await chunkStore.put(chunk);
      }
    }

    // Backfill concepts and determine their materialId
    for (const concept of concepts) {
      if (!concept.materialId) {
        // Try linking via sourceChunkIds first
        const sourceChunkIds = (concept.sourceChunkIds as string[]) || [];
        let mappedDocId: string | undefined;
        for (const cid of sourceChunkIds) {
          const docId = chunkDocMap.get(cid);
          if (docId) {
            mappedDocId = docId;
            break;
          }
        }

        // Try linking via subjectId if single matching document
        if (!mappedDocId && concept.subjectId) {
          const subjectDocs = docs.filter((d) => d.subjectId === concept.subjectId);
          if (subjectDocs.length === 1) {
            mappedDocId = String(subjectDocs[0].id);
          }
        }

        // Fallback: if only one document in system, link to it
        if (!mappedDocId && docs.length === 1) {
          mappedDocId = String(docs[0].id);
        }

        if (mappedDocId) {
          concept.materialId = mappedDocId;
        }
      }

      if (!concept.contentVersion) {
        concept.contentVersion = 'v1';
      }
      if (!concept.promptVersion) {
        concept.promptVersion = '1.0';
      }
    }

    // Synthesize learning units for each document with concepts
    for (const doc of docs) {
      const docId = String(doc.id);
      const docConcepts = concepts.filter((c) => c.materialId === docId);

      if (docConcepts.length > 0) {
        const unitId = `unit-${docId}-1`;
        // Check if unit already exists
        const existingUnit = await unitStore.get(unitId);
        if (!existingUnit) {
          const unit = {
            id: unitId,
            materialId: docId,
            order: 0,
            title: (doc.filename || doc.title)
              ? `${doc.filename || doc.title} - Core Concepts`
              : 'Core Concepts',
            summary:
              (docConcepts[0]?.summary as string) ||
              'Core study unit synthesized from migrated document concepts.',
            conceptIds: docConcepts.map((c) => String(c.id)),
            sourceChunkIds: Array.from(
              new Set(docConcepts.flatMap((c) => (c.sourceChunkIds as string[]) || [])),
            ),
            contentVersion: String(doc.contentVersion || 'v1'),
            createdAt: (doc.createdAt as string) || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await unitStore.put(unit);
        }

        if (conceptStore) {
          for (const c of docConcepts) {
            if (!c.unitId) {
              c.unitId = unitId;
            }
            await conceptStore.put(c);
          }
        }
      }

      // Check and synthesize processing record for completed legacy doc
      const existingProc = await procStore.get(docId);
      if (!existingProc) {
        const docChunks = chunks.filter((c) => c.documentId === docId);
        const procRecord = {
          id: docId,
          materialId: docId,
          stage: 'COMPLETE',
          fileHash: String(doc.fileHash || ''),
          contentHash: String(doc.contentHash || ''),
          contentVersion: String(doc.contentVersion || 'v1'),
          promptVersion: '1.0',
          counts: {
            totalChunks: docChunks.length,
            extractedConcepts: docConcepts.length,
            totalUnits: docConcepts.length > 0 ? 1 : 0,
          },
          createdAt: (doc.createdAt as string) || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await procStore.put(procRecord);
      }
    }

    // Save any concepts that were updated but not in a doc loop
    if (conceptStore) {
      for (const c of concepts) {
        await conceptStore.put(c);
      }
    }

    // Backfill recall questions
    if (questionStore) {
      for (const q of questions) {
        if (!q.materialId && q.conceptId) {
          const c = concepts.find((con) => con.id === q.conceptId);
          if (c?.materialId) {
            q.materialId = c.materialId;
            await questionStore.put(q);
          }
        }
      }
    }

    // Backfill recall attempts
    if (attemptStore) {
      for (const a of attempts) {
        if (!a.materialId && a.conceptId) {
          const c = concepts.find((con) => con.id === a.conceptId);
          if (c?.materialId) {
            a.materialId = c.materialId;
            await attemptStore.put(a);
          }
        }
      }
    }

    // Backfill study sessions
    if (sessionStore) {
      for (const s of sessions) {
        if (!s.materialId && s.currentConceptId) {
          const c = concepts.find((con) => con.id === s.currentConceptId);
          if (c?.materialId) {
            s.materialId = c.materialId;
            await sessionStore.put(s);
          }
        }
      }
    }
  },
};

export const migrationV2TestHarness: Migration = {
  version: 2,
  description: 'Test harness migration: adds v2 test auxiliary store',
  apply: (db) => {
    if (!db.objectStoreNames.contains('v2_test_metadata')) {
      db.createObjectStore('v2_test_metadata', { keyPath: 'id' });
    }
  },
};

/**
 * Migration Version 3: Workflow State & Guided Workflow Shell (Phase R3)
 * Adds workflowState store for persisting material workflow selection and mode preferences.
 */
export const migrationV3: Migration = {
  version: 3,
  description: 'Add workflowState store for persisting material workflow selection and mode preferences',
  apply: (db) => {
    if (!db.objectStoreNames.contains('workflowState')) {
      const store = db.createObjectStore('workflowState', { keyPath: 'materialId' });
      store.createIndex('by-material', 'materialId', { unique: true });
      store.createIndex('by-updated', 'updatedAt');
    }
  },
};

export const MIGRATIONS: Migration[] = [migrationV1, migrationV2, migrationV3];

/**
 * Execute registered migrations deterministically from oldVersion to newVersion.
 */
export async function runMigrations(
  db: IDBPDatabase<unknown>,
  oldVersion: number,
  newVersion: number,
  transaction: IDBPTransaction<unknown, string[], 'versionchange'>,
  availableMigrations: Migration[] = MIGRATIONS,
): Promise<void> {
  const applicable = availableMigrations
    .filter((m) => m.version > oldVersion && m.version <= newVersion)
    .sort((a, b) => a.version - b.version);

  for (const migration of applicable) {
    try {
      await migration.apply(db, transaction);
    } catch (err) {
      throw new StorageError(
        `Database migration to version ${migration.version} failed: ${err instanceof Error ? err.message : String(err)}. Your data has been preserved. Please export a backup from settings.`,
        'MIGRATION_FAILED',
        err,
      );
    }
  }
}
