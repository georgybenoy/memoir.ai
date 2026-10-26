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
  migrationV2,
  type Migration,
} from '@/lib/db/migrations';
import { StorageError } from '@/lib/db/errors';

describe('Schema Migration v1 -> v2 (Phase R2)', () => {
  const testDbName = 'edumentor-migration-v2-test';

  beforeEach(async () => {
    closeDatabase();
    await removeDatabase(testDbName);
  });

  afterEach(async () => {
    closeDatabase();
    await removeDatabase(testDbName);
  });

  async function seedV1Database() {
    // Open at v1
    const db = await openDatabase(testDbName, 1, [migrationV1]);

    // Insert legacy v1 documents (without materialId, fileHash)
    await db.put('documents', {
      id: 'doc-legacy-1',
      filename: 'OS_Processes.pdf',
      fileType: 'pdf',
      fileSize: 10240,
      extractedText: 'Process scheduling, context switching, and PCB structures.',
      analysisStatus: 'completed',
      contentHash: 'hash-os-content',
      metadata: { originalFilename: 'OS_Processes.pdf' },
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
    });

    await db.put('documents', {
      id: 'doc-legacy-2',
      filename: 'Networks_TCP.md',
      fileType: 'md',
      fileSize: 5120,
      extractedText: 'TCP handshake, congestion control, and flow control.',
      analysisStatus: 'completed',
      contentHash: 'hash-net-content',
      metadata: { originalFilename: 'Networks_TCP.md' },
      createdAt: '2026-05-01T11:00:00.000Z',
      updatedAt: '2026-05-01T11:00:00.000Z',
    });

    // Insert legacy chunks (documentId present, materialId absent)
    await db.put('documentChunks', {
      id: 'chunk-os-1',
      documentId: 'doc-legacy-1',
      chunkIndex: 0,
      text: 'Process scheduling...',
      startOffset: 0,
      endOffset: 20,
      byteLength: 20,
      tokenEstimate: 5,
      createdAt: '2026-05-01T10:00:00.000Z',
    });

    await db.put('documentChunks', {
      id: 'chunk-net-1',
      documentId: 'doc-legacy-2',
      chunkIndex: 0,
      text: 'TCP handshake...',
      startOffset: 0,
      endOffset: 16,
      byteLength: 16,
      tokenEstimate: 4,
      createdAt: '2026-05-01T11:00:00.000Z',
    });

    // Insert legacy concepts (materialId absent, unitId absent)
    await db.put('concepts', {
      id: 'concept-pcb',
      title: 'Process Control Block',
      summary: 'Data structure containing process state',
      canonicalExplanation: 'OS kernel structure for managing execution contexts.',
      keyTerms: ['pcb', 'pid', 'registers'],
      sourceChunkIds: ['chunk-os-1'],
      tier: 0,
      status: 'available',
      confidence: 0.95,
      extractionOrder: 0,
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
    });

    await db.put('concepts', {
      id: 'concept-tcp-syn',
      title: 'TCP SYN Handshake',
      summary: 'Three-way connection establishment',
      canonicalExplanation: 'SYN, SYN-ACK, ACK sequence for reliable streams.',
      keyTerms: ['syn', 'ack', 'seq'],
      sourceChunkIds: ['chunk-net-1'],
      tier: 0,
      status: 'mastered',
      confidence: 0.9,
      extractionOrder: 0,
      createdAt: '2026-05-01T11:00:00.000Z',
      updatedAt: '2026-05-01T11:00:00.000Z',
    });

    // Insert legacy recall question and attempt
    await db.put('recallQuestions', {
      id: 'q-legacy-1',
      conceptId: 'concept-pcb',
      type: 'freeform',
      prompt: 'What information does a PCB store?',
      sampleAnswer: 'PID, registers, program counter.',
      keyPoints: ['PID', 'registers'],
      sourceChunkIds: ['chunk-os-1'],
      createdAt: '2026-05-01T10:00:00.000Z',
    });

    await db.put('recallAttempts', {
      id: 'att-legacy-1',
      questionId: 'q-legacy-1',
      conceptId: 'concept-pcb',
      userAnswer: 'Registers and PID',
      evaluatedScore: 5,
      evaluationMode: 'hybrid',
      feedback: 'Accurate',
      keyPointsCovered: ['PID', 'registers'],
      keyPointsMissed: [],
      answeredAt: '2026-05-01T10:30:00.000Z',
    });

    closeDatabase(testDbName);
  }

  it('migrates v1 -> v2: creates new stores, adds indexes, backfills materialId, units, and processing records', async () => {
    // 1. Seed database with legacy v1 data
    await seedV1Database();

    // Verify v1 counts before migration
    const dbV1 = await openDB(testDbName, 1);
    expect(await dbV1.count('documents')).toBe(2);
    expect(await dbV1.count('documentChunks')).toBe(2);
    expect(await dbV1.count('concepts')).toBe(2);
    expect(await dbV1.count('recallQuestions')).toBe(1);
    expect(await dbV1.count('recallAttempts')).toBe(1);
    expect(dbV1.objectStoreNames.contains('learningUnits')).toBe(false);
    expect(dbV1.objectStoreNames.contains('processing')).toBe(false);
    expect(dbV1.objectStoreNames.contains('materialFiles')).toBe(false);
    dbV1.close();

    // 2. Run Migration v2
    const dbV2 = await openDatabase(testDbName, 2, [migrationV1, migrationV2]);
    expect(dbV2.version).toBe(2);

    // 3. Verify new stores exist
    expect(dbV2.objectStoreNames.contains('learningUnits')).toBe(true);
    expect(dbV2.objectStoreNames.contains('processing')).toBe(true);
    expect(dbV2.objectStoreNames.contains('materialFiles')).toBe(true);

    // 4. Verify record counts after migration (additive, no records lost)
    expect(await dbV2.count('documents')).toBe(2);
    expect(await dbV2.count('documentChunks')).toBe(2);
    expect(await dbV2.count('concepts')).toBe(2);
    expect(await dbV2.count('recallQuestions')).toBe(1);
    expect(await dbV2.count('recallAttempts')).toBe(1);

    // Synthesized records: 1 learning unit and 1 processing record per legacy document
    expect(await dbV2.count('learningUnits')).toBe(2);
    expect(await dbV2.count('processing')).toBe(2);

    // 5. Spot-check record equality & backfilled materialId linkage
    const doc1 = await dbV2.get('documents', 'doc-legacy-1');
    expect(doc1).toBeDefined();
    expect(doc1?.materialId).toBe('doc-legacy-1');
    expect(doc1?.filename).toBe('OS_Processes.pdf');
    expect(doc1?.fileHash).toBeDefined();

    const chunk1 = await dbV2.get('documentChunks', 'chunk-os-1');
    expect(chunk1).toBeDefined();
    expect(chunk1?.materialId).toBe('doc-legacy-1');

    const concept1 = await dbV2.get('concepts', 'concept-pcb');
    expect(concept1).toBeDefined();
    expect(concept1?.materialId).toBe('doc-legacy-1');
    expect(concept1?.unitId).toBeDefined();
    expect(concept1?.status).toBe('available');

    const question1 = await dbV2.get('recallQuestions', 'q-legacy-1');
    expect(question1?.materialId).toBe('doc-legacy-1');

    const attempt1 = await dbV2.get('recallAttempts', 'att-legacy-1');
    expect(attempt1?.materialId).toBe('doc-legacy-1');

    // Verify synthesized learning unit
    const units = await dbV2.getAll('learningUnits');
    const osUnit = units.find((u) => u.materialId === 'doc-legacy-1');
    expect(osUnit).toBeDefined();
    expect(osUnit?.title).toBe('OS_Processes.pdf - Core Concepts');
    expect(osUnit?.conceptIds).toContain('concept-pcb');

    // Verify synthesized processing record
    const proc = await dbV2.get('processing', 'doc-legacy-1');
    expect(proc).toBeDefined();
    expect(proc?.stage).toBe('COMPLETE');
    expect(proc?.counts?.totalChunks).toBe(1);

    // 6. Verify index queries by material
    const tx = dbV2.transaction('documentChunks');
    const chunksByMaterial = await tx.objectStore('documentChunks').index('by-material').getAll('doc-legacy-1');
    expect(chunksByMaterial).toHaveLength(1);
    expect(chunksByMaterial[0].id).toBe('chunk-os-1');
  });

  it('is idempotent: running migration twice produces identical schema and counts', async () => {
    await seedV1Database();

    // Run migration v2
    const dbFirst = await openDatabase(testDbName, 2, [migrationV1, migrationV2]);
    const unitsCount1 = await dbFirst.count('learningUnits');
    const procCount1 = await dbFirst.count('processing');
    closeDatabase(testDbName);

    // Reopen at v2 with same migrations (should skip or re-evaluate idempotently)
    const dbSecond = await openDatabase(testDbName, 2, [migrationV1, migrationV2]);
    const unitsCount2 = await dbSecond.count('learningUnits');
    const procCount2 = await dbSecond.count('processing');

    expect(unitsCount2).toBe(unitsCount1);
    expect(procCount2).toBe(procCount1);
    expect(unitsCount2).toBe(2);
    expect(procCount2).toBe(2);
  });

  it('preserves data at v1 if migration fails mid-way', async () => {
    await seedV1Database();

    const failingMigration: Migration = {
      version: 2,
      description: 'Failing v2 migration',
      apply: () => {
        throw new Error('Simulated failure during store index creation');
      },
    };

    let caughtError: unknown;
    try {
      await openDatabase(testDbName, 2, [migrationV1, failingMigration]);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(StorageError);
    expect((caughtError as StorageError).code).toBe('MIGRATION_FAILED');

    // Confirm that database remains readable at v1 and data is intact
    closeDatabase(testDbName);
    const dbV1 = await openDB(testDbName, 1);
    expect(await dbV1.count('documents')).toBe(2);
    expect(await dbV1.count('concepts')).toBe(2);
    const doc = await dbV1.get('documents', 'doc-legacy-1');
    expect(doc?.filename).toBe('OS_Processes.pdf');
    dbV1.close();
  });
});
