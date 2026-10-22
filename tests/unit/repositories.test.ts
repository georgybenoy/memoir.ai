import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDatabase, closeDatabase, removeDatabase } from '@/lib/db/indexeddb';
import { createIdbRepositories } from '@/lib/db/repositories/idb-repositories';
import { type StorageRepositories } from '@/lib/db/repositories/types';
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

describe('IdbRepositories CRUD & Index Queries', () => {
  const testDbName = 'edumentor-repos-test';
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

  it('handles workspace bootstrap and preference updates', async () => {
    const ws = await repos.workspace.getOrCreateDefault();
    expect(ws).toBeDefined();
    expect(ws.id).toBe('default-workspace');
    expect(ws.preferences.model).toBe('gemini-3.8-flash');
    expect(ws.preferences.difficulty).toBe('intermediate');

    const updated = await repos.workspace.updatePreferences({ difficulty: 'advanced' });
    expect(updated.preferences.difficulty).toBe('advanced');

    const retrieved = await repos.workspace.getWorkspace();
    expect(retrieved?.preferences.difficulty).toBe('advanced');
  });

  it('handles documents and documentChunks with compound index queries', async () => {
    const doc1: DocumentRecord = {
      id: 'doc-1',
      subjectId: 'subj-1',
      filename: 'lecture1.pdf',
      fileType: 'pdf',
      fileSize: 1024,
      extractedText: 'Distributed Systems overview',
      analysisStatus: 'completed',
      contentHash: 'hash-doc-1',
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
    };
    await repos.documents.put(doc1);

    const doc2: DocumentRecord = {
      id: 'doc-2',
      subjectId: 'subj-2',
      filename: 'lecture2.pdf',
      fileType: 'pdf',
      fileSize: 2048,
      extractedText: 'Compilers overview',
      analysisStatus: 'completed',
      contentHash: 'hash-doc-2',
      createdAt: '2026-05-02T10:00:00.000Z',
      updatedAt: '2026-05-02T10:00:00.000Z',
    };
    await repos.documents.put(doc2);

    const bySubject = await repos.documents.listBySubject('subj-1');
    expect(bySubject).toHaveLength(1);
    expect(bySubject[0].id).toBe('doc-1');

    // Chunks
    const chunk0: DocumentChunkRecord = {
      id: 'chunk-0',
      documentId: 'doc-1',
      chunkIndex: 0,
      text: 'First chunk of doc 1',
      startOffset: 0,
      endOffset: 20,
      contentHash: 'hash-c0',
      createdAt: '2026-05-01T10:00:00.000Z',
    };
    const chunk1: DocumentChunkRecord = {
      id: 'chunk-1',
      documentId: 'doc-1',
      chunkIndex: 1,
      text: 'Second chunk of doc 1',
      startOffset: 21,
      endOffset: 42,
      contentHash: 'hash-c1',
      createdAt: '2026-05-01T10:00:00.000Z',
    };
    await repos.chunks.putMany([chunk0, chunk1]);

    const doc1Chunks = await repos.chunks.listByDocument('doc-1');
    expect(doc1Chunks).toHaveLength(2);

    const specificChunk = await repos.chunks.getByDocumentAndIndex('doc-1', 1);
    expect(specificChunk).toBeDefined();
    expect(specificChunk?.id).toBe('chunk-1');
  });

  it('handles subjects and findByTitle', async () => {
    const subj: SubjectRecord = {
      id: 'subj-cs101',
      title: 'Introduction to Algorithms',
      description: 'Sorting, searching, and complexity',
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
    };
    await repos.subjects.put(subj);

    const found = await repos.subjects.findByTitle('Introduction to Algorithms');
    expect(found).toBeDefined();
    expect(found?.id).toBe('subj-cs101');

    const notFound = await repos.subjects.findByTitle('Non-existent');
    expect(notFound).toBeNull();
  });

  it('handles concepts with status and subject filters', async () => {
    const concept1: ConceptRecord = {
      id: 'c-1',
      subjectId: 'subj-algo',
      title: 'Quicksort',
      summary: 'Divide and conquer sorting algorithm',
      canonicalExplanation: 'Pivots and partitioning',
      keyTerms: ['pivot', 'partition'],
      sourceChunkIds: ['chunk-0'],
      tier: 1,
      status: 'available',
      confidence: 0.9,
      extractionOrder: 0,
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
    };
    const concept2: ConceptRecord = {
      id: 'c-2',
      subjectId: 'subj-algo',
      title: 'Mergesort',
      summary: 'Stable divide and conquer sorting algorithm',
      canonicalExplanation: 'Recursive merge step',
      keyTerms: ['merge', 'recursion'],
      sourceChunkIds: ['chunk-1'],
      tier: 1,
      status: 'mastered',
      confidence: 0.95,
      extractionOrder: 1,
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
    };
    await repos.concepts.putMany([concept1, concept2]);

    const available = await repos.concepts.listByStatus('available');
    expect(available).toHaveLength(1);
    expect(available[0].id).toBe('c-1');

    const bySubject = await repos.concepts.listBySubject('subj-algo');
    expect(bySubject).toHaveLength(2);
  });

  it('handles conceptDependencies endpoint queries', async () => {
    const dep: ConceptDependencyRecord = {
      id: 'dep-1',
      prerequisiteId: 'c-recursion',
      dependentConceptId: 'c-mergesort',
      confidence: 0.98,
      removed: false,
      createdAt: '2026-05-01T10:00:00.000Z',
    };
    await repos.dependencies.put(dep);

    const endpointsRecursion = await repos.dependencies.listByEndpoint('c-recursion');
    expect(endpointsRecursion).toHaveLength(1);

    const endpointsMergesort = await repos.dependencies.listByEndpoint('c-mergesort');
    expect(endpointsMergesort).toHaveLength(1);

    const prereqs = await repos.dependencies.listByPrerequisite('c-recursion');
    expect(prereqs).toHaveLength(1);

    const deps = await repos.dependencies.listByDependent('c-mergesort');
    expect(deps).toHaveLength(1);
  });

  it('handles studySessions and active session query', async () => {
    const session1: StudySessionRecord = {
      id: 'sess-1',
      machineState: 'STUDYING_CONCEPT',
      sourceMode: 'document',
      startedAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:30:00.000Z',
    };
    await repos.sessions.put(session1);

    const active = await repos.sessions.getActiveSession();
    expect(active).toBeDefined();
    expect(active?.id).toBe('sess-1');

    // Mark ended
    session1.endedAt = '2026-05-01T11:00:00.000Z';
    session1.machineState = 'SESSION_SUMMARY';
    await repos.sessions.put(session1);

    const noActive = await repos.sessions.getActiveSession();
    expect(noActive).toBeNull();
  });

  it('handles studyPathItems, recallQuestions, attempts, and mastery', async () => {
    const item: StudyPathItemRecord = {
      id: 'spi-1',
      sessionId: 'sess-1',
      conceptId: 'c-1',
      orderIndex: 0,
      status: 'available',
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
    };
    await repos.studyPath.put(item);
    const pathItems = await repos.studyPath.listBySession('sess-1');
    expect(pathItems).toHaveLength(1);

    const q: RecallQuestionRecord = {
      id: 'q-1',
      conceptId: 'c-1',
      prompt: 'How does quicksort choose its pivot?',
      questionStyle: 'explanation',
      referencePoints: ['pivot selection'],
      sourceChunkIds: ['chunk-0'],
      difficulty: 3,
      expectedKeyPoints: ['median of three', 'randomized'],
      createdAt: '2026-05-01T10:00:00.000Z',
    };
    await repos.questions.put(q);
    const questions = await repos.questions.listByConcept('c-1');
    expect(questions).toHaveLength(1);

    const attempt: RecallAttemptRecord = {
      id: 'att-1',
      sessionId: 'sess-1',
      questionId: 'q-1',
      conceptId: 'c-1',
      answerText: 'Random pivot avoids worst case O(n^2).',
      confidence: 'high',
      semanticScore: 92,
      judgeScore: 90,
      compositeScore: 91,
      qualityGrade: 5,
      evaluationMode: 'hybrid',
      pendingEvaluation: false,
      createdAt: '2026-05-01T10:15:00.000Z',
    };
    await repos.attempts.put(attempt);
    const attemptsByConcept = await repos.attempts.listByConcept('c-1');
    expect(attemptsByConcept).toHaveLength(1);

    const mastery: MasteryStateRecord = {
      id: 'm-1',
      conceptId: 'c-1',
      level: 3,
      percentage: 85,
      bestScore: 91,
      attemptCount: 1,
      updatedAt: '2026-05-01T10:15:00.000Z',
    };
    await repos.mastery.put(mastery);
    const retrievedMastery = await repos.mastery.getByConcept('c-1');
    expect(retrievedMastery?.level).toBe(3);
  });

  it('handles spacedRepetitionStates with listDue date filtering', async () => {
    const sr1: SpacedRepetitionStateRecord = {
      id: 'sr-1',
      conceptId: 'c-1',
      repetitions: 2,
      easinessFactor: 2.5,
      intervalDays: 6,
      nextDueAt: '2026-05-01T12:00:00.000Z',
      weak: false,
      updatedAt: '2026-04-25T12:00:00.000Z',
    };
    const sr2: SpacedRepetitionStateRecord = {
      id: 'sr-2',
      conceptId: 'c-2',
      repetitions: 4,
      easinessFactor: 2.6,
      intervalDays: 14,
      nextDueAt: '2026-05-15T12:00:00.000Z',
      weak: false,
      updatedAt: '2026-05-01T12:00:00.000Z',
    };
    await repos.spacedRepetition.putMany([sr1, sr2]);

    const dueMay5 = await repos.spacedRepetition.listDue('2026-05-05T00:00:00.000Z');
    expect(dueMay5).toHaveLength(1);
    expect(dueMay5[0].id).toBe('sr-1');

    const dueMay20 = await repos.spacedRepetition.listDue('2026-05-20T00:00:00.000Z');
    expect(dueMay20).toHaveLength(2);
  });

  it('handles conversationMessages and learningEvents', async () => {
    const msg1: ConversationMessageRecord = {
      id: 'msg-1',
      sessionId: 'sess-1',
      role: 'user',
      content: 'Can you explain Dijkstra algorithm?',
      createdAt: '2026-05-01T10:00:00.000Z',
    };
    const msg2: ConversationMessageRecord = {
      id: 'msg-2',
      sessionId: 'sess-1',
      role: 'assistant',
      content: 'Sure! Dijkstra finds shortest paths from a source vertex.',
      expressionState: 'EXPLAINING',
      createdAt: '2026-05-01T10:00:05.000Z',
    };
    await repos.messages.putMany([msg1, msg2]);

    const sessionMessages = await repos.messages.listBySession('sess-1');
    expect(sessionMessages).toHaveLength(2);
    expect(sessionMessages[0].role).toBe('user');
    expect(sessionMessages[1].role).toBe('assistant');

    const event: LearningEventRecord = {
      id: 'ev-1',
      eventType: 'SESSION_COMPLETED',
      payload: { sessionId: 'sess-1', score: 95 },
      createdAt: '2026-05-01T10:30:00.000Z',
    };
    await repos.events.put(event);
    const events = await repos.events.listByType('SESSION_COMPLETED');
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('ev-1');
  });
});
