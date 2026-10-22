import 'fake-indexeddb/auto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  openDatabase,
  closeDatabase,
  removeDatabase,
  runTransaction,
} from '@/lib/db/indexeddb';
import {
  ingestDocument,
  deleteDocumentAndChunks,
} from '@/features/ingestion/ingest';
import { type IngestFileInput } from '@/features/ingestion/types';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

describe('Ingestion Pipeline & Transaction Atomicity', () => {
  const testDbName = 'edumentor-pipeline-test';

  beforeEach(async () => {
    closeDatabase();
    await removeDatabase(testDbName);
    await openDatabase(testDbName);
  });

  afterEach(async () => {
    closeDatabase();
    await removeDatabase(testDbName);
  });

  function createFileInput(filename: string): IngestFileInput {
    const filePath = path.join(FIXTURES_DIR, filename);
    const buffer = fs.readFileSync(filePath);
    return {
      name: filename,
      size: buffer.length,
      arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    };
  }

  it('runs full pipeline: validate -> extract -> normalize -> chunk -> persist', async () => {
    const file = createFileInput('sample-note.txt');
    const stages: string[] = [];

    const result = await ingestDocument({
      file,
      dbName: testDbName,
      onProgress: (p) => stages.push(p.stage),
    });

    expect(result.success).toBe(true);
    expect(result.documentId).toBeDefined();
    expect(result.document).toBeDefined();
    expect(result.chunks).toBeDefined();
    expect(result.chunks!.length).toBeGreaterThan(0);

    expect(stages).toContain('validating');
    expect(stages).toContain('extracting');
    expect(stages).toContain('normalizing');
    expect(stages).toContain('chunking');
    expect(stages).toContain('persisting');
    expect(stages).toContain('completed');

    // Verify stored in test IndexedDB instance
    const db = await openDatabase(testDbName);
    const storedDoc = await db.get('documents', result.documentId!);
    expect(storedDoc).toBeDefined();
    expect(storedDoc?.filename).toBe('sample-note.txt');

    const storedChunks = await db.getAllFromIndex('documentChunks', 'by-document', result.documentId!);
    expect(storedChunks.length).toBe(result.chunks!.length);
  });

  it('detects duplicate documents by content hash and offers alreadyImported', async () => {
    const file = createFileInput('sample-note.txt');

    // First ingestion
    const res1 = await ingestDocument({ file, dbName: testDbName });
    expect(res1.success).toBe(true);

    // Second ingestion with the same content
    const res2 = await ingestDocument({ file, dbName: testDbName });
    expect(res2.success).toBe(false);
    expect(res2.alreadyImported).toBe(true);
    expect(res2.code).toBe('DUPLICATE_FILE');
    expect(res2.documentId).toBe(res1.documentId);
  });

  it('atomically rolls back: a failed chunk write leaves NO orphan document', async () => {
    const db = await openDatabase(testDbName);
    const docCountBefore = (await db.getAll('documents')).length;
    const chunkCountBefore = (await db.getAll('documentChunks')).length;

    // Simulate atomic transaction where writing chunks fails deliberately
    await expect(
      runTransaction(
        ['documents', 'documentChunks'],
        'readwrite',
        async (tx) => {
          await tx.objectStore('documents').put({
            id: 'doc-should-rollback',
            filename: 'rollback-test.txt',
            fileType: 'txt',
            fileSize: 100,
            extractedText: 'Rollback text',
            analysisStatus: 'pending',
            contentHash: 'hash-123',
            createdAt: '2026-10-22T00:00:00.000Z',
            updatedAt: '2026-10-22T00:00:00.000Z',
          });

          // Intentional failure before transaction commits
          throw new Error('Simulated disk/storage crash during chunk write');
        },
        testDbName,
      ),
    ).rejects.toThrow();

    // Verify document was NOT committed to IndexedDB (no orphan document)
    const docAfter = await db.get('documents', 'doc-should-rollback');
    expect(docAfter).toBeUndefined();

    const docCountAfter = (await db.getAll('documents')).length;
    const chunkCountAfter = (await db.getAll('documentChunks')).length;
    expect(docCountAfter).toBe(docCountBefore);
    expect(chunkCountAfter).toBe(chunkCountBefore);
  });

  it('deletes document and all associated chunks atomically', async () => {
    const file = createFileInput('sample-lecture.md');
    const result = await ingestDocument({ file, dbName: testDbName });
    expect(result.success).toBe(true);
    const docId = result.documentId!;

    const db = await openDatabase(testDbName);
    expect(await db.get('documents', docId)).toBeDefined();
    const chunksBefore = await db.getAllFromIndex('documentChunks', 'by-document', docId);
    expect(chunksBefore.length).toBeGreaterThan(0);

    // Delete document and chunks
    await deleteDocumentAndChunks(docId, testDbName);

    // Both document and chunks should be removed
    expect(await db.get('documents', docId)).toBeUndefined();
    const chunksAfter = await db.getAllFromIndex('documentChunks', 'by-document', docId);
    expect(chunksAfter.length).toBe(0);
  });

  it('supports cancellation via AbortSignal', async () => {
    const file = createFileInput('multipage-sample.pdf');
    const controller = new AbortController();
    controller.abort(); // Cancel immediately

    const res = await ingestDocument({
      file,
      signal: controller.signal,
      dbName: testDbName,
    });

    expect(res.success).toBe(false);
    expect(res.code).toBe('CANCELLED');
  });
});
