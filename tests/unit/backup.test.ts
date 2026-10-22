import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  openDatabase,
  closeDatabase,
  removeDatabase,
} from '@/lib/db/indexeddb';
import { createIdbRepositories } from '@/lib/db/repositories/idb-repositories';
import { type StorageRepositories } from '@/lib/db/repositories/types';
import {
  createBackupEnvelope,
  validateBackupFile,
  executeImport,
  restoreRollbackData,
} from '@/lib/db/backup';
import { MAX_BACKUP_SIZE_BYTES, MAX_RECORDS_PER_STORE } from '@/lib/db/schema';
import {
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
} from '@/types/domain';

describe('Backup Export, Validation, and Import Foundation', () => {
  const testDbName = 'edumentor-backup-test';
  let repos: StorageRepositories;

  beforeEach(async () => {
    closeDatabase();
    await removeDatabase(testDbName);
    await openDatabase(testDbName);
    repos = createIdbRepositories(testDbName);
  });

  afterEach(async () => {
    closeDatabase();
    await removeDatabase(testDbName);
  });

  async function seedFullDataset(): Promise<void> {
    await repos.workspace.getOrCreateDefault();
    await repos.workspace.updatePreferences({ difficulty: 'advanced', model: 'gemini-2.5-flash' });

    const doc: DocumentRecord = {
      id: 'doc-seed-1',
      subjectId: 'subj-seed-1',
      filename: 'operating-systems.pdf',
      fileType: 'pdf',
      fileSize: 4096,
      extractedText: 'Virtual memory and paging systems.',
      analysisStatus: 'completed',
      contentHash: 'hash-doc-seed-1',
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
    };
    await repos.documents.put(doc);

    const chunk: DocumentChunkRecord = {
      id: 'chunk-seed-1',
      documentId: 'doc-seed-1',
      chunkIndex: 0,
      text: 'Virtual memory provides an illusion of contiguous memory.',
      startOffset: 0,
      endOffset: 58,
      contentHash: 'hash-chunk-seed-1',
      createdAt: '2026-05-01T10:00:00.000Z',
    };
    await repos.chunks.put(chunk);

    const subj: SubjectRecord = {
      id: 'subj-seed-1',
      title: 'Computer Architecture',
      description: 'Memory hierarchy and processors',
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
    };
    await repos.subjects.put(subj);

    const c1: ConceptRecord = {
      id: 'concept-seed-1',
      subjectId: 'subj-seed-1',
      title: 'Paging',
      summary: 'Memory management scheme dividing physical memory into frames.',
      canonicalExplanation: 'Pages map to frames via page tables.',
      keyTerms: ['page table', 'frame', 'TLB'],
      sourceChunkIds: ['chunk-seed-1'],
      tier: 1,
      status: 'available',
      confidence: 0.96,
      extractionOrder: 0,
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
    };
    const c2: ConceptRecord = {
      id: 'concept-seed-2',
      subjectId: 'subj-seed-1',
      title: 'TLB',
      summary: 'Translation Lookaside Buffer caching page table lookups.',
      canonicalExplanation: 'Hardware cache for virtual to physical address translation.',
      keyTerms: ['cache hit', 'TLB miss'],
      sourceChunkIds: ['chunk-seed-1'],
      tier: 2,
      status: 'review_due',
      confidence: 0.92,
      extractionOrder: 1,
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
    };
    await repos.concepts.putMany([c1, c2]);

    const dep: ConceptDependencyRecord = {
      id: 'dep-seed-1',
      prerequisiteId: 'concept-seed-1',
      dependentConceptId: 'concept-seed-2',
      confidence: 0.99,
      removed: false,
      createdAt: '2026-05-01T10:00:00.000Z',
    };
    await repos.dependencies.put(dep);

    const session: StudySessionRecord = {
      id: 'sess-seed-1',
      machineState: 'STUDYING_CONCEPT',
      sourceMode: 'document',
      startedAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
    };
    await repos.sessions.put(session);

    const pathItem: StudyPathItemRecord = {
      id: 'spi-seed-1',
      sessionId: 'sess-seed-1',
      conceptId: 'concept-seed-1',
      orderIndex: 0,
      status: 'available',
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
    };
    await repos.studyPath.put(pathItem);

    const question: RecallQuestionRecord = {
      id: 'q-seed-1',
      conceptId: 'concept-seed-1',
      prompt: 'What is the purpose of a page table?',
      questionStyle: 'explanation',
      referencePoints: ['page mapping'],
      sourceChunkIds: ['chunk-seed-1'],
      difficulty: 3,
      expectedKeyPoints: ['mapping virtual pages to physical frames'],
      createdAt: '2026-05-01T10:00:00.000Z',
    };
    await repos.questions.put(question);

    const attempt: RecallAttemptRecord = {
      id: 'att-seed-1',
      sessionId: 'sess-seed-1',
      questionId: 'q-seed-1',
      conceptId: 'concept-seed-1',
      answerText: 'A page table maps virtual page numbers to physical frame numbers.',
      confidence: 'high',
      semanticScore: 95,
      judgeScore: 92,
      compositeScore: 94,
      qualityGrade: 5,
      evaluationMode: 'hybrid',
      pendingEvaluation: false,
      createdAt: '2026-05-01T10:05:00.000Z',
    };
    await repos.attempts.put(attempt);

    const mastery: MasteryStateRecord = {
      id: 'm-seed-1',
      conceptId: 'concept-seed-1',
      level: 3,
      percentage: 90,
      bestScore: 94,
      attemptCount: 1,
      updatedAt: '2026-05-01T10:05:00.000Z',
    };
    await repos.mastery.put(mastery);

    const sr: SpacedRepetitionStateRecord = {
      id: 'sr-seed-1',
      conceptId: 'concept-seed-1',
      repetitions: 1,
      easinessFactor: 2.5,
      intervalDays: 1,
      nextDueAt: '2026-05-02T10:00:00.000Z',
      weak: false,
      updatedAt: '2026-05-01T10:05:00.000Z',
    };
    await repos.spacedRepetition.put(sr);

    const msg: ConversationMessageRecord = {
      id: 'msg-seed-1',
      sessionId: 'sess-seed-1',
      role: 'user',
      content: 'Explain how TLB reduces memory lookup overhead.',
      createdAt: '2026-05-01T10:06:00.000Z',
    };
    await repos.messages.put(msg);

    const event: LearningEventRecord = {
      id: 'ev-seed-1',
      eventType: 'CONCEPT_MASTERED',
      payload: { conceptId: 'concept-seed-1' },
      createdAt: '2026-05-01T10:07:00.000Z',
    };
    await repos.events.put(event);
  }

  it('performs export -> clear -> replace-import with exact round-trip equality', async () => {
    // 1. Seed full dataset
    await seedFullDataset();

    // 2. Export backup envelope
    const envelope = await createBackupEnvelope(repos);
    expect(envelope.format).toBe('edumentor-backup');
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.documents).toHaveLength(1);
    expect(envelope.concepts).toHaveLength(2);
    expect(envelope.preferences.difficulty).toBe('advanced');

    // 3. Validate export string representation
    const jsonStr = JSON.stringify(envelope);
    const validation = validateBackupFile(jsonStr, Buffer.byteLength(jsonStr));
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    expect(validation.preview?.counts.documents).toBe(1);
    expect(validation.preview?.counts.concepts).toBe(2);

    // 4. Clear data across all stores
    await Promise.all([
      repos.documents.clear(),
      repos.chunks.clear(),
      repos.subjects.clear(),
      repos.concepts.clear(),
      repos.dependencies.clear(),
      repos.sessions.clear(),
      repos.studyPath.clear(),
      repos.questions.clear(),
      repos.attempts.clear(),
      repos.mastery.clear(),
      repos.spacedRepetition.clear(),
      repos.messages.clear(),
      repos.events.clear(),
      repos.workspace.clear(),
    ]);

    expect(await repos.concepts.list()).toHaveLength(0);
    expect(await repos.documents.list()).toHaveLength(0);

    // 5. Execute import in replace mode
    const importResult = await executeImport(envelope, 'replace', repos);
    expect(importResult.mode).toBe('replace');
    expect(importResult.importedCounts.documents).toBe(1);
    expect(importResult.importedCounts.concepts).toBe(2);

    // 6. Verify round-trip equality
    const restoredDocs = await repos.documents.list();
    const restoredConcepts = await repos.concepts.list();
    const restoredAttempts = await repos.attempts.list();
    const restoredMastery = await repos.mastery.getByConcept('concept-seed-1');

    expect(restoredDocs[0].filename).toBe('operating-systems.pdf');
    expect(restoredConcepts).toHaveLength(2);
    expect(restoredAttempts[0].compositeScore).toBe(94);
    expect(restoredMastery?.percentage).toBe(90);
  });

  it('handles Merge mode: keeps existing records on ID conflict and imports new ones', async () => {
    await seedFullDataset();
    const envelope = await createBackupEnvelope(repos);

    // Add a new unique document and concept to the envelope
    envelope.documents.push({
      id: 'doc-new-2',
      filename: 'compilers.pdf',
      fileType: 'pdf',
      fileSize: 1024,
      extractedText: 'Lexing and parsing',
      analysisStatus: 'completed',
      contentHash: 'hash-doc-2',
      createdAt: '2026-05-02T10:00:00.000Z',
      updatedAt: '2026-05-02T10:00:00.000Z',
    });

    // Execute import in merge mode
    const result = await executeImport(envelope, 'merge', repos);
    expect(result.mode).toBe('merge');
    // Existing records were skipped, new document was inserted
    expect(result.skippedCount).toBeGreaterThan(0);
    expect(result.importedCounts.documents).toBe(1);

    const allDocs = await repos.documents.list();
    expect(allDocs).toHaveLength(2);
  });

  it('creates automatic safety rollback export before replace execution', async () => {
    await seedFullDataset();
    const emptyBackup = await createBackupEnvelope(repos);
    emptyBackup.documents = [];
    emptyBackup.concepts = [];

    const result = await executeImport(emptyBackup, 'replace', repos);
    expect(result.rollbackExport).toBeDefined();
    expect(result.rollbackExport?.documents).toHaveLength(1);
    expect(result.rollbackExport?.concepts).toHaveLength(2);
  });

  it('rejects oversized backups before parsing', () => {
    const fakeContent = '{"format":"edumentor-backup"}';
    const oversizedBytes = MAX_BACKUP_SIZE_BYTES + 1024;

    const res = validateBackupFile(fakeContent, oversizedBytes);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain('too large');
  });

  it('rejects malformed JSON without touching storage', () => {
    const malformed = '{"format": "edumentor-backup", missingBrace: ';
    const res = validateBackupFile(malformed, malformed.length);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain('Malformed JSON');
  });

  it('rejects wrong format envelope', () => {
    const wrongFormat = JSON.stringify({
      format: 'anki-deck',
      schemaVersion: 1,
    });
    const res = validateBackupFile(wrongFormat, wrongFormat.length);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain('Invalid backup format');
  });

  it('rejects unsupported newer schema versions', () => {
    const futureBackup = JSON.stringify({
      format: 'edumentor-backup',
      schemaVersion: 999,
      exportedAt: '2026-05-01T10:00:00.000Z',
      appVersion: '99.0.0',
      workspace: { id: 'ws-1', createdAt: '2026', updatedAt: '2026', schemaVersion: 999, preferences: { model: 'm', difficulty: 'intermediate', reducedMotion: false } },
      documents: [],
      documentChunks: [],
      subjects: [],
      concepts: [],
      conceptDependencies: [],
      studySessions: [],
      studyPathItems: [],
      recallQuestions: [],
      recallAttempts: [],
      masteryStates: [],
      spacedRepetitionStates: [],
      conversationMessages: [],
      preferences: { model: 'm', difficulty: 'intermediate', reducedMotion: false },
    });
    const res = validateBackupFile(futureBackup, futureBackup.length);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain('Invalid backup format');
  });

  it('rejects backups with prototype-pollution keys (__proto__, constructor)', () => {
    const maliciousProto =
      '{"format":"edumentor-backup","schemaVersion":1,"__proto__":{"admin":true}}';
    const resProto = validateBackupFile(maliciousProto, maliciousProto.length);
    expect(resProto.valid).toBe(false);
    expect(resProto.errors[0]).toContain('Security violation');

    const maliciousConstructor =
      '{"format":"edumentor-backup","schemaVersion":1,"constructor":{"admin":true}}';
    const resConstructor = validateBackupFile(maliciousConstructor, maliciousConstructor.length);
    expect(resConstructor.valid).toBe(false);
    expect(resConstructor.errors[0]).toContain('Security violation');
  });

  it('rejects backups containing duplicate IDs within a store', async () => {
    await seedFullDataset();
    const envelope = await createBackupEnvelope(repos);

    // Inject duplicate concept ID
    envelope.concepts.push({
      ...envelope.concepts[0],
      title: 'Duplicate Concept Title',
    });

    const jsonStr = JSON.stringify(envelope);
    const res = validateBackupFile(jsonStr, jsonStr.length);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain('Duplicate ID detected in concepts');
  });

  it('rejects backups with dangling relationships (chunk -> non-existent doc)', async () => {
    await seedFullDataset();
    const envelope = await createBackupEnvelope(repos);

    // Inject dangling chunk
    envelope.documentChunks.push({
      id: 'dangling-chunk-99',
      documentId: 'non-existent-doc-id',
      chunkIndex: 99,
      text: 'Orphan chunk',
      startOffset: 0,
      endOffset: 12,
      contentHash: 'hash',
      createdAt: '2026-05-01T10:00:00.000Z',
    });

    const jsonStr = JSON.stringify(envelope);
    const res = validateBackupFile(jsonStr, jsonStr.length);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain('references non-existent documentId');
  });

  it('rejects backups with dangling dependencies (dep -> non-existent concept)', async () => {
    await seedFullDataset();
    const envelope = await createBackupEnvelope(repos);

    // Inject dangling dependency
    envelope.conceptDependencies.push({
      id: 'dangling-dep-99',
      prerequisiteId: 'concept-seed-1',
      dependentConceptId: 'non-existent-concept-id',
      confidence: 0.9,
      removed: false,
      createdAt: '2026-05-01T10:00:00.000Z',
    });

    const jsonStr = JSON.stringify(envelope);
    const res = validateBackupFile(jsonStr, jsonStr.length);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain('references non-existent dependentConceptId');
  });

  it('rejects backups exceeding MAX_RECORDS_PER_STORE (10,000 records)', async () => {
    await seedFullDataset();
    const envelope = await createBackupEnvelope(repos);

    // Inflate concepts store beyond 10,000 records
    const baseConcept = envelope.concepts[0];
    const dummyConcepts: ConceptRecord[] = [];
    for (let i = 0; i < MAX_RECORDS_PER_STORE + 5; i++) {
      dummyConcepts.push({
        ...baseConcept,
        id: `concept-overflow-${i}`,
      });
    }
    envelope.concepts = dummyConcepts;

    const jsonStr = JSON.stringify(envelope);
    const res = validateBackupFile(jsonStr, jsonStr.length);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain('exceeds maximum limit of 10000 records');
  });

  describe('Hardened Conflict Policies & Rollback Safety', () => {
    it('prefer_imported policy updates existing local records on ID collision', async () => {
      await seedFullDataset();
      const envelope = await createBackupEnvelope(repos);

      // Mutate title of concept in incoming backup
      envelope.concepts[0].title = 'Updated Memory Paging Title';

      const result = await executeImport(envelope, 'prefer_imported', repos);
      expect(result.updatedCount).toBeGreaterThanOrEqual(1);

      const loaded = await repos.concepts.get(envelope.concepts[0].id);
      expect(loaded?.title).toBe('Updated Memory Paging Title');
    });

    it('import_as_copy policy generates new IDs for collisions and remaps relational references', async () => {
      await seedFullDataset();
      const envelope = await createBackupEnvelope(repos);

      const origDocId = envelope.documents[0].id;
      const origConceptId = envelope.concepts[0].id;

      const result = await executeImport(envelope, 'import_as_copy', repos);
      expect(result.copiedCount).toBeGreaterThanOrEqual(1);

      // Verify that new documents exist alongside original
      const allDocs = await repos.documents.list();
      expect(allDocs.length).toBe(2);

      const copiedDoc = allDocs.find((d) => d.id !== origDocId);
      expect(copiedDoc).toBeDefined();

      // Verify chunks were copied and their documentId was remapped to the copied document
      const allChunks = await repos.chunks.list();
      expect(allChunks.length).toBe(2);
      const copiedChunk = allChunks.find((c) => c.documentId === copiedDoc!.id);
      expect(copiedChunk).toBeDefined();

      // Verify concepts were copied and remapped
      const allConcepts = await repos.concepts.list();
      expect(allConcepts.length).toBe(4); // 2 original + 2 copies
      const copiedConcept = allConcepts.find((c) => c.id !== origConceptId);
      expect(copiedConcept).toBeDefined();
      expect(copiedConcept?.sourceChunkIds).toContain(copiedChunk!.id);
    });

    it('replace_all generates a safety rollback snapshot and restoreRollbackData restores previous state', async () => {
      await seedFullDataset();
      const origConcepts = await repos.concepts.list();
      const origTitle = origConcepts[0].title;

      // Create an empty incoming backup
      const emptyEnvelope = await createBackupEnvelope(repos);
      emptyEnvelope.documents = [];
      emptyEnvelope.documentChunks = [];
      emptyEnvelope.concepts = [];
      emptyEnvelope.recallAttempts = [];

      // Replace all data
      const replaceResult = await executeImport(emptyEnvelope, 'replace_all', repos);
      expect(replaceResult.rollbackExport).toBeDefined();

      // Confirm local database was cleared
      const afterReplaceConcepts = await repos.concepts.list();
      expect(afterReplaceConcepts.length).toBe(0);

      // Restore safety rollback snapshot
      await restoreRollbackData(replaceResult.rollbackExport!, repos);

      // Confirm previous state was completely restored
      const restoredConcepts = await repos.concepts.list();
      expect(restoredConcepts.length).toBe(origConcepts.length);
      expect(restoredConcepts[0].title).toBe(origTitle);
    });
  });

  describe('Round-Trip Fidelity on Large Synthetic Dataset', () => {
    it('preserves 100% byte fidelity across export, clear, and restore on large synthetic dataset', async () => {
      // Build a realistic large dataset: 10 documents, 50 chunks, 30 concepts, 20 dependencies, 40 attempts
      await repos.workspace.getOrCreateDefault();

      const largeDocs: DocumentRecord[] = [];
      const largeChunks: DocumentChunkRecord[] = [];
      const largeConcepts: ConceptRecord[] = [];
      const largeDeps: ConceptDependencyRecord[] = [];
      const largeAttempts: RecallAttemptRecord[] = [];

      for (let d = 0; d < 10; d++) {
        const docId = `syn-doc-${d}`;
        largeDocs.push({
          id: docId,
          filename: `module-${d}.pdf`,
          fileType: 'pdf',
          fileSize: 1024 * (d + 1),
          extractedText: `Comprehensive chapter ${d} on systems engineering with in-depth analysis.`,
          analysisStatus: 'completed',
          contentHash: `hash-syn-doc-${d}`,
          createdAt: '2026-06-01T12:00:00.000Z',
          updatedAt: '2026-06-01T12:00:00.000Z',
        });

        for (let c = 0; c < 5; c++) {
          const chunkId = `syn-chunk-${d}-${c}`;
          largeChunks.push({
            id: chunkId,
            documentId: docId,
            chunkIndex: c,
            text: `Explanatory chunk ${c} for module ${d}. Core mechanism details.`,
            startOffset: c * 100,
            endOffset: (c + 1) * 100,
            contentHash: `hash-syn-chunk-${d}-${c}`,
            createdAt: '2026-06-01T12:00:00.000Z',
          });
        }
      }

      for (let k = 0; k < 30; k++) {
        const conceptId = `syn-concept-${k}`;
        const docIndex = k % 10;
        const chunkId = `syn-chunk-${docIndex}-${k % 5}`;

        largeConcepts.push({
          id: conceptId,
          title: `Synthetic Concept ${k}`,
          summary: `Summary explaining concept ${k} in depth.`,
          canonicalExplanation: `Canonical explanation of concept ${k} mechanisms and nuances.`,
          keyTerms: [`term-${k}a`, `term-${k}b`],
          sourceChunkIds: [chunkId],
          tier: (k % 3) as 0 | 1 | 2,
          status: 'available',
          confidence: 0.95,
          extractionOrder: k,
          createdAt: '2026-06-01T12:00:00.000Z',
          updatedAt: '2026-06-01T12:00:00.000Z',
        });

        if (k > 0 && k % 2 === 0) {
          largeDeps.push({
            id: `syn-dep-${k}`,
            prerequisiteId: `syn-concept-${k - 2}`,
            dependentConceptId: conceptId,
            confidence: 0.88,
            removed: false,
            createdAt: '2026-06-01T12:00:00.000Z',
          });
        }
      }

      for (let a = 0; a < 40; a++) {
        largeAttempts.push({
          id: `syn-attempt-${a}`,
          sessionId: 'syn-session-1',
          questionId: `syn-q-${a % 10}`,
          conceptId: `syn-concept-${a % 30}`,
          answerText: `Student comprehensive explanation for attempt ${a}. Demonstrating clear mastery.`,
          confidence: 'high',
          qualityGrade: 4,
          compositeScore: 85,
          semanticScore: 82,
          judgeScore: 87,
          evaluationMode: 'hybrid',
          pendingEvaluation: false,
          createdAt: '2026-06-01T12:00:00.000Z',
        });
      }

      // Write dataset to database
      await repos.documents.putMany(largeDocs);
      await repos.chunks.putMany(largeChunks);
      await repos.concepts.putMany(largeConcepts);
      await repos.dependencies.putMany(largeDeps);
      await repos.attempts.putMany(largeAttempts);

      // Export
      const exportedEnvelope = await createBackupEnvelope(repos);
      const exportedJson = JSON.stringify(exportedEnvelope);

      // Validate
      const validation = validateBackupFile(exportedJson, exportedJson.length);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      // Clear database completely
      await repos.documents.clear();
      await repos.chunks.clear();
      await repos.concepts.clear();
      await repos.dependencies.clear();
      await repos.attempts.clear();

      expect((await repos.documents.list()).length).toBe(0);
      expect((await repos.concepts.list()).length).toBe(0);

      // Re-import
      const importResult = await executeImport(validation.parsedEnvelope!, 'replace_all', repos);
      expect(importResult.importedCounts.documents).toBe(10);
      expect(importResult.importedCounts.documentChunks).toBe(50);
      expect(importResult.importedCounts.concepts).toBe(30);
      expect(importResult.importedCounts.recallAttempts).toBe(40);

      // Verify 100% round-trip fidelity
      const reimportedEnvelope = await createBackupEnvelope(repos);
      expect(reimportedEnvelope.documents.length).toBe(largeDocs.length);
      expect(reimportedEnvelope.documentChunks.length).toBe(largeChunks.length);
      expect(reimportedEnvelope.concepts.length).toBe(largeConcepts.length);
      expect(reimportedEnvelope.conceptDependencies.length).toBe(largeDeps.length);
      expect(reimportedEnvelope.recallAttempts.length).toBe(largeAttempts.length);

      // Deep compare first and last items by unique ID
      const reimportedDoc0 = reimportedEnvelope.documents.find((d) => d.id === largeDocs[0].id);
      expect(reimportedDoc0).toEqual(largeDocs[0]);

      const reimportedConcept29 = reimportedEnvelope.concepts.find(
        (c) => c.id === largeConcepts[29].id,
      );
      expect(reimportedConcept29).toEqual(largeConcepts[29]);

      const reimportedAttempt39 = reimportedEnvelope.recallAttempts.find(
        (a) => a.id === largeAttempts[39].id,
      );
      expect(reimportedAttempt39).toEqual(largeAttempts[39]);
    });
  });
});
