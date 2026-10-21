import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryRepositories } from '@/lib/db/repositories/memory-repositories';
import { probeStorageAvailability } from '@/lib/db/probe';
import { useSaveStatusStore } from '@/lib/state/save-status-store';
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

describe('In-Memory Repository Adapter & Probe Parity', () => {
  let repos: ReturnType<typeof createMemoryRepositories>;

  beforeEach(() => {
    repos = createMemoryRepositories();
    useSaveStatusStore.getState().reset();
  });

  it('probes IndexedDB availability and detects functional environment', async () => {
    const probe = await probeStorageAvailability();
    expect(probe.available).toBe(true);
    expect(probe.mode).toBe('indexeddb');
  });

  it('falls back to memory mode when indexedDB is unavailable', async () => {
    const originalIndexedDB = globalThis.indexedDB;
    // Simulate private browsing with disabled or blocked IndexedDB
    // @ts-expect-error simulating missing indexedDB
    delete globalThis.indexedDB;

    try {
      const probe = await probeStorageAvailability();
      expect(probe.available).toBe(false);
      expect(probe.mode).toBe('memory');

      useSaveStatusStore.getState().setPersistenceMode(probe.mode);
      expect(useSaveStatusStore.getState().persistenceMode).toBe('memory');
    } finally {
      globalThis.indexedDB = originalIndexedDB;
    }
  });

  it('implements workspace CRUD and preference updates with parity', async () => {
    const defaultWs = await repos.workspace.getOrCreateDefault();
    expect(defaultWs).toBeDefined();
    expect(defaultWs.preferences.model).toBe('gemini-2.5-flash');

    const updated = await repos.workspace.updatePreferences({ difficulty: 'advanced' });
    expect(updated.preferences.difficulty).toBe('advanced');

    const fetched = await repos.workspace.getWorkspace();
    expect(fetched?.preferences.difficulty).toBe('advanced');
  });

  it('implements documents and chunks queries with parity', async () => {
    const doc: DocumentRecord = {
      id: 'mem-doc-1',
      subjectId: 'mem-subj-1',
      filename: 'test.pdf',
      fileType: 'pdf',
      fileSize: 500,
      extractedText: 'Memory document text',
      analysisStatus: 'completed',
      contentHash: 'hash-mem-1',
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
    };
    await repos.documents.put(doc);
    const bySubject = await repos.documents.listBySubject('mem-subj-1');
    expect(bySubject).toHaveLength(1);

    const chunk0: DocumentChunkRecord = {
      id: 'mem-chunk-0',
      documentId: 'mem-doc-1',
      chunkIndex: 0,
      text: 'First chunk',
      startOffset: 0,
      endOffset: 11,
      contentHash: 'hash-c0',
      createdAt: '2026-05-01T10:00:00.000Z',
    };
    const chunk1: DocumentChunkRecord = {
      id: 'mem-chunk-1',
      documentId: 'mem-doc-1',
      chunkIndex: 1,
      text: 'Second chunk',
      startOffset: 12,
      endOffset: 24,
      contentHash: 'hash-c1',
      createdAt: '2026-05-01T10:00:00.000Z',
    };
    await repos.chunks.putMany([chunk0, chunk1]);

    const docChunks = await repos.chunks.listByDocument('mem-doc-1');
    expect(docChunks).toHaveLength(2);

    const specificChunk = await repos.chunks.getByDocumentAndIndex('mem-doc-1', 1);
    expect(specificChunk?.id).toBe('mem-chunk-1');
  });

  it('implements subjects, concepts, dependencies queries with parity', async () => {
    const subj: SubjectRecord = {
      id: 'mem-subj-1',
      title: 'Operating Systems',
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
    };
    await repos.subjects.put(subj);
    expect((await repos.subjects.findByTitle('Operating Systems'))?.id).toBe('mem-subj-1');

    const c1: ConceptRecord = {
      id: 'mem-c-1',
      subjectId: 'mem-subj-1',
      title: 'Deadlocks',
      summary: 'Mutual exclusion deadlock conditions',
      canonicalExplanation: 'Coffman conditions',
      keyTerms: ['deadlock', 'mutex', 'hold and wait'],
      sourceChunkIds: ['mem-chunk-0'],
      tier: 1,
      status: 'review_due',
      confidence: 0.9,
      extractionOrder: 0,
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
    };
    await repos.concepts.put(c1);

    const dueConcepts = await repos.concepts.listByStatus('review_due');
    expect(dueConcepts).toHaveLength(1);

    const dep: ConceptDependencyRecord = {
      id: 'mem-dep-1',
      prerequisiteId: 'mem-c-0',
      dependentConceptId: 'mem-c-1',
      confidence: 0.95,
      removed: false,
      createdAt: '2026-05-01T10:00:00.000Z',
    };
    await repos.dependencies.put(dep);
    expect(await repos.dependencies.listByEndpoint('mem-c-1')).toHaveLength(1);
    expect(await repos.dependencies.listByPrerequisite('mem-c-0')).toHaveLength(1);
    expect(await repos.dependencies.listByDependent('mem-c-1')).toHaveLength(1);
  });

  it('implements sessions, recall attempts, SM-2, and messages with parity', async () => {
    const session: StudySessionRecord = {
      id: 'mem-sess-1',
      machineState: 'STUDYING_CONCEPT',
      sourceMode: 'topic',
      startedAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
    };
    await repos.sessions.put(session);
    expect((await repos.sessions.getActiveSession())?.id).toBe('mem-sess-1');

    const spi: StudyPathItemRecord = {
      id: 'mem-spi-1',
      sessionId: 'mem-sess-1',
      conceptId: 'mem-c-1',
      orderIndex: 0,
      status: 'available',
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
    };
    await repos.studyPath.put(spi);
    expect(await repos.studyPath.listBySession('mem-sess-1')).toHaveLength(1);

    const q: RecallQuestionRecord = {
      id: 'mem-q-1',
      conceptId: 'mem-c-1',
      prompt: 'What are the 4 Coffman conditions?',
      questionStyle: 'explanation',
      referencePoints: ['Coffman conditions'],
      sourceChunkIds: ['mem-chunk-0'],
      difficulty: 3,
      expectedKeyPoints: ['mutual exclusion', 'hold and wait', 'no preemption', 'circular wait'],
      createdAt: '2026-05-01T10:00:00.000Z',
    };
    await repos.questions.put(q);
    expect(await repos.questions.listByConcept('mem-c-1')).toHaveLength(1);

    const attempt: RecallAttemptRecord = {
      id: 'mem-att-1',
      sessionId: 'mem-sess-1',
      questionId: 'mem-q-1',
      conceptId: 'mem-c-1',
      answerText: 'Mutual exclusion, hold and wait, no preemption, circular wait.',
      confidence: 'high',
      qualityGrade: 5,
      evaluationMode: 'hybrid',
      pendingEvaluation: false,
      createdAt: '2026-05-01T10:05:00.000Z',
    };
    await repos.attempts.put(attempt);
    expect(await repos.attempts.listByConcept('mem-c-1')).toHaveLength(1);

    const mastery: MasteryStateRecord = {
      id: 'mem-m-1',
      conceptId: 'mem-c-1',
      level: 4,
      percentage: 100,
      bestScore: 100,
      attemptCount: 1,
      updatedAt: '2026-05-01T10:05:00.000Z',
    };
    await repos.mastery.put(mastery);
    expect((await repos.mastery.getByConcept('mem-c-1'))?.level).toBe(4);

    const sr: SpacedRepetitionStateRecord = {
      id: 'mem-sr-1',
      conceptId: 'mem-c-1',
      repetitions: 1,
      easinessFactor: 2.5,
      intervalDays: 1,
      nextDueAt: '2026-05-02T10:00:00.000Z',
      weak: false,
      updatedAt: '2026-05-01T10:05:00.000Z',
    };
    await repos.spacedRepetition.put(sr);
    expect(await repos.spacedRepetition.listDue('2026-05-03T00:00:00.000Z')).toHaveLength(1);
    expect(await repos.spacedRepetition.listDue('2026-05-01T00:00:00.000Z')).toHaveLength(0);

    const msg: ConversationMessageRecord = {
      id: 'mem-msg-1',
      sessionId: 'mem-sess-1',
      role: 'user',
      content: 'Can we practice deadlocks?',
      createdAt: '2026-05-01T10:00:00.000Z',
    };
    await repos.messages.put(msg);
    expect(await repos.messages.listBySession('mem-sess-1')).toHaveLength(1);

    const event: LearningEventRecord = {
      id: 'mem-ev-1',
      eventType: 'PROMPT_ANSWERED',
      payload: { grade: 5 },
      createdAt: '2026-05-01T10:05:00.000Z',
    };
    await repos.events.put(event);
    expect(await repos.events.listByType('PROMPT_ANSWERED')).toHaveLength(1);
  });
});
