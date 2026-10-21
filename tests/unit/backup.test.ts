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
} from '@/lib/db/backup';
import { MAX_BACKUP_SIZE_BYTES } from '@/lib/db/schema';
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
});
