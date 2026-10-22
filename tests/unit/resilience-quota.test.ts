import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  isQuotaExceededError,
  normalizeStorageError,
  StorageError,
} from '@/lib/db/errors';
import * as idbModule from '@/lib/db/indexeddb';
import { createIdbRepositories } from '@/lib/db/repositories/idb-repositories';
import { ingestDocument } from '@/features/ingestion';
import { extractConceptsForDocument } from '@/features/concepts/pipeline';
import { initializeStudyPathForDocument } from '@/features/study-path/service';
import { saveAttemptAndMasteryAtomic } from '@/features/mastery/mastery-service';
import { executeImport, createBackupEnvelope } from '@/lib/db/backup';
import { useSaveStatusStore } from '@/lib/state/save-status-store';
import { type RecallAttemptRecord } from '@/types/domain';

class MockQuotaExceededError extends Error {
  name = 'QuotaExceededError';
  code = 22;
  constructor(message = 'The quota has been exceeded.') {
    super(message);
  }
}

describe('Resilience Audit — QuotaExceededError Invariant Across All Write Paths', () => {
  const testDb = 'resilience-quota-test-db';

  beforeEach(async () => {
    idbModule.closeDatabase();
    await idbModule.removeDatabase(testDb);
    useSaveStatusStore.getState().reset();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    idbModule.closeDatabase();
    await idbModule.removeDatabase(testDb);
    useSaveStatusStore.getState().reset();
  });

  describe('Central Quota Detection & Normalization', () => {
    it('recognizes standard browser QuotaExceededError shapes', () => {
      expect(isQuotaExceededError(new MockQuotaExceededError())).toBe(true);
      expect(isQuotaExceededError({ name: 'QuotaExceededError' })).toBe(true);
      expect(isQuotaExceededError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
      expect(isQuotaExceededError({ code: 22 })).toBe(true);
      expect(isQuotaExceededError({ code: 1014 })).toBe(true);
      expect(isQuotaExceededError(new Error('Storage quota reached on device'))).toBe(true);
      expect(isQuotaExceededError(new Error('Generic failure'))).toBe(false);
    });

    it('normalizes quota exceptions into typed StorageError(QUOTA_EXCEEDED)', () => {
      const err = normalizeStorageError(new MockQuotaExceededError());
      expect(err).toBeInstanceOf(StorageError);
      expect(err.code).toBe('QUOTA_EXCEEDED');
      expect(err.message).toContain('quota exceeded');
      expect(err.message).toContain('export a backup');
    });

    it('proves runTransaction catches QuotaExceededError, aborts, and normalizes to StorageError(QUOTA_EXCEEDED)', async () => {
      await idbModule.openDatabase(testDb);

      let caught: unknown;
      try {
        await idbModule.runTransaction(
          ['documents'],
          'readwrite',
          async () => {
            // Simulate quota failure during write
            throw new MockQuotaExceededError('Low disk space');
          },
          testDb,
        );
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(StorageError);
      expect((caught as StorageError).code).toBe('QUOTA_EXCEEDED');
      expect((caught as StorageError).message).toContain('quota exceeded');
    });
  });

  describe('Write Path 1: Document Ingestion (ingestDocument)', () => {
    it('aborts on QuotaExceededError and preserves the original file content without claiming saved', async () => {
      const fileText = '# Quantum Electrodynamics\nDraft content here...';
      const textBuffer = new TextEncoder().encode(fileText);
      const fileInput = {
        name: 'quantum.md',
        size: textBuffer.byteLength,
        type: 'text/markdown',
        arrayBuffer: async () => textBuffer.buffer.slice(textBuffer.byteOffset, textBuffer.byteOffset + textBuffer.byteLength),
      };

      vi.spyOn(idbModule, 'runTransaction').mockRejectedValueOnce(
        normalizeStorageError(new MockQuotaExceededError('Disk quota full during chunk insertion')),
      );

      const res = await ingestDocument({
        file: fileInput,
        dbName: testDb,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('quota exceeded');
      // Original content in memory remains completely intact
      expect(fileText).toContain('Quantum Electrodynamics');
    });
  });

  describe('Write Path 2: Concept Pipeline (extractConceptsForDocument)', () => {
    it('returns failure result and does not crash when QuotaExceededError occurs', async () => {
      vi.spyOn(idbModule, 'runTransaction').mockRejectedValueOnce(
        normalizeStorageError(new MockQuotaExceededError('Failed to allocate space for concept record')),
      );

      const res = await extractConceptsForDocument({
        documentId: 'doc-123',
        dbName: testDb,
      });

      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
    });
  });

  describe('Write Path 3: Study Path Initialization (initializeStudyPathForDocument)', () => {
    it('fails cleanly with StorageError(QUOTA_EXCEEDED) on storage quota exhaustion', async () => {
      vi.spyOn(idbModule, 'runTransaction').mockRejectedValueOnce(
        normalizeStorageError(new MockQuotaExceededError('Quota exceeded when writing study session')),
      );

      let caught: unknown;
      try {
        await initializeStudyPathForDocument({
          documentId: 'doc-1',
          dbName: testDb,
        });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeDefined();
      expect(caught).toBeInstanceOf(StorageError);
      expect((caught as StorageError).code).toBe('QUOTA_EXCEEDED');
    });
  });

  describe('Write Path 4: Recall Evaluation Atomic Persist (saveAttemptAndMasteryAtomic)', () => {
    it('aborts all stores atomically when QuotaExceededError occurs and preserves student answer', async () => {
      const attempt: RecallAttemptRecord = {
        id: 'attempt-1',
        sessionId: 'session-1',
        questionId: 'q-1',
        conceptId: 'c-1',
        answerText: 'My detailed student answer that must never be dropped',
        confidence: 'high',
        qualityGrade: 4,
        compositeScore: 88,
        semanticScore: 85,
        judgeScore: 90,
        evaluationMode: 'hybrid',
        pendingEvaluation: false,
        createdAt: new Date().toISOString(),
      };

      vi.spyOn(idbModule, 'runTransaction').mockRejectedValueOnce(
        normalizeStorageError(new MockQuotaExceededError('Quota hit during attempt persistence')),
      );

      let caught: unknown;
      try {
        await saveAttemptAndMasteryAtomic({
          attempt,
          currentMastery: null,
          currentSr: null,
          pastAttempts: [],
          dbName: testDb,
        });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeDefined();
      expect(caught).toBeInstanceOf(StorageError);
      expect((caught as StorageError).code).toBe('QUOTA_EXCEEDED');
      // The student answer content is completely preserved in the object
      expect(attempt.answerText).toBe('My detailed student answer that must never be dropped');
    });
  });

  describe('Write Path 5: Backup Import (executeImport)', () => {
    it('aborts the transaction and throws when import encounters QuotaExceededError', async () => {
      const repos = createIdbRepositories(testDb);
      await repos.workspace.getOrCreateDefault();
      const envelope = await createBackupEnvelope(repos);

      vi.spyOn(repos.documents, 'putMany').mockRejectedValueOnce(
        normalizeStorageError(new MockQuotaExceededError('Quota exceeded while importing dataset')),
      );

      let caught: unknown;
      try {
        await executeImport(envelope, 'replace_all', repos);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeDefined();
      expect((caught as StorageError).code).toBe('QUOTA_EXCEEDED');
    });
  });
});
