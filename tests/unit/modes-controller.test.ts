import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, closeDatabase, removeDatabase } from '@/lib/db/indexeddb';
import { studyMode } from '@/features/modes/study-mode';
import { recallMode } from '@/features/modes/recall-mode';
import { revisionMode } from '@/features/modes/revision-mode';
import {
  evaluateQuestionEligibility,
  findReusableQuestion,
} from '@/features/modes/question-policy';
import { buildSessionSummaryFromDatabase } from '@/features/modes/summary-service';
import { saveAttemptAndMasteryAtomic } from '@/features/mastery/mastery-service';
import {
  type ConceptRecord,
  type LearningUnitRecord,
  type ConceptDependencyRecord,
  type DocumentChunkRecord,
  type StudySessionRecord,
  type RecallQuestionRecord,
  type RecallAttemptRecord,
  type SpacedRepetitionStateRecord,
} from '@/types/domain';
import { type ModeContext } from '@/features/modes/types';

describe('Phase R4 Mode Controller & Modules Unit Tests', () => {
  const TEST_DB = 'test-r4-modes-db';

  beforeEach(async () => {
    closeDatabase();
    await removeDatabase(TEST_DB);
    await openDatabase(TEST_DB);
  });

  const mockConcepts: ConceptRecord[] = [
    {
      id: 'concept-1',
      materialId: 'mat-1',
      unitId: 'unit-1',
      title: 'Neural Networks 101',
      summary: 'Basics of neurons and activation functions.',
      canonicalExplanation: 'Neurons compute weighted sums and apply non-linear activations.',
      keyTerms: ['weight', 'bias', 'activation'],
      sourceChunkIds: ['chunk-1'],
      tier: 1,
      status: 'available',
      confidence: 0.8,
      extractionOrder: 0,
      contentVersion: 'v1.0',
      createdAt: '2026-10-20T10:00:00Z',
      updatedAt: '2026-10-20T10:00:00Z',
    },
    {
      id: 'concept-2',
      materialId: 'mat-1',
      unitId: 'unit-1',
      title: 'Backpropagation',
      summary: 'Gradient calculation using the chain rule.',
      canonicalExplanation: 'Errors are propagated backward to compute partial derivatives.',
      keyTerms: ['gradient', 'chain rule', 'error'],
      sourceChunkIds: ['chunk-2'],
      tier: 2,
      status: 'available',
      confidence: 0.7,
      extractionOrder: 1,
      contentVersion: 'v1.0',
      createdAt: '2026-10-20T10:00:00Z',
      updatedAt: '2026-10-20T10:00:00Z',
    },
    {
      id: 'concept-3',
      materialId: 'mat-1',
      unitId: 'unit-2',
      title: 'Transformers & Attention',
      summary: 'Self-attention mechanisms across sequence tokens.',
      canonicalExplanation: 'Attention weights determine contextual token representations.',
      keyTerms: ['query', 'key', 'value', 'attention'],
      sourceChunkIds: ['chunk-3'],
      tier: 3,
      status: 'available',
      confidence: 0.6,
      extractionOrder: 2,
      contentVersion: 'v1.0',
      createdAt: '2026-10-20T10:00:00Z',
      updatedAt: '2026-10-20T10:00:00Z',
    },
  ];

  const mockUnits: LearningUnitRecord[] = [
    {
      id: 'unit-1',
      materialId: 'mat-1',
      order: 0,
      title: 'Unit 1: Foundations',
      summary: 'Basic neural networks and optimization',
      conceptIds: ['concept-1', 'concept-2'],
      sourceChunkIds: ['chunk-1', 'chunk-2'],
      contentVersion: 'v1.0',
      createdAt: '2026-10-20T10:00:00Z',
      updatedAt: '2026-10-20T10:00:00Z',
    },
    {
      id: 'unit-2',
      materialId: 'mat-1',
      order: 1,
      title: 'Unit 2: Sequence Models',
      summary: 'Modern attention architectures',
      conceptIds: ['concept-3'],
      sourceChunkIds: ['chunk-3'],
      contentVersion: 'v1.0',
      createdAt: '2026-10-20T10:00:00Z',
      updatedAt: '2026-10-20T10:00:00Z',
    },
  ];

  const mockDependencies: ConceptDependencyRecord[] = [
    {
      id: 'dep-1',
      prerequisiteId: 'concept-1',
      dependentConceptId: 'concept-2',
      confidence: 0.9,
      removed: false,
      createdAt: '2026-10-20T10:00:00Z',
    },
  ];

  const mockChunks: DocumentChunkRecord[] = [
    {
      id: 'chunk-1',
      documentId: 'doc-1',
      materialId: 'mat-1',
      chunkIndex: 0,
      text: 'Neural networks are composed of artificial neurons.',
      startOffset: 0,
      endOffset: 51,
      contentHash: 'hash-chunk-1',
      pageStart: 1,
      createdAt: '2026-10-20T10:00:00Z',
    },
    {
      id: 'chunk-2',
      documentId: 'doc-1',
      materialId: 'mat-1',
      chunkIndex: 1,
      text: 'Backpropagation uses the chain rule to compute gradients.',
      startOffset: 52,
      endOffset: 109,
      contentHash: 'hash-chunk-2',
      pageStart: 2,
      createdAt: '2026-10-20T10:00:00Z',
    },
    {
      id: 'chunk-3',
      documentId: 'doc-1',
      materialId: 'mat-1',
      chunkIndex: 2,
      text: 'Transformers compute self-attention using queries, keys, and values.',
      startOffset: 110,
      endOffset: 178,
      contentHash: 'hash-chunk-3',
      pageStart: 3,
      createdAt: '2026-10-20T10:00:00Z',
    },
  ];

  describe('1. Scope Filtering (Unit Scoping & Whole Material)', () => {
    it('scopes study concepts to selected units only', () => {
      const ctx: ModeContext = {
        materialId: 'mat-1',
        sessionId: 'session-1',
        mode: 'study',
        selection: { kind: 'UNITS', unitIds: ['unit-1'] },
        concepts: mockConcepts,
        units: mockUnits,
        dependencies: mockDependencies,
        chunks: mockChunks,
      };

      const ordered = studyMode.getOrderedConcepts(ctx);
      expect(ordered.map((c) => c.id)).toEqual(['concept-1', 'concept-2']);
      expect(ordered.some((c) => c.id === 'concept-3')).toBe(false);
    });

    it('returns all concepts in topological prerequisite order when WHOLE_MATERIAL is selected', () => {
      const ctx: ModeContext = {
        materialId: 'mat-1',
        sessionId: 'session-1',
        mode: 'study',
        selection: { kind: 'WHOLE_MATERIAL' },
        concepts: mockConcepts,
        units: mockUnits,
        dependencies: mockDependencies,
        chunks: mockChunks,
      };

      const ordered = studyMode.getOrderedConcepts(ctx);
      expect(ordered.length).toBe(3);
      // concept-1 must come before concept-2
      const idx1 = ordered.findIndex((c) => c.id === 'concept-1');
      const idx2 = ordered.findIndex((c) => c.id === 'concept-2');
      expect(idx1).toBeLessThan(idx2);
    });

    it('scopes recall questions to concepts in the selected unit only', () => {
      const ctx: ModeContext = {
        materialId: 'mat-1',
        sessionId: 'session-recall',
        mode: 'recall',
        selection: { kind: 'UNITS', unitIds: ['unit-2'] },
        concepts: mockConcepts,
        units: mockUnits,
        dependencies: mockDependencies,
        chunks: mockChunks,
      };

      const ordered = recallMode.getOrderedConcepts(ctx);
      expect(ordered.map((c) => c.id)).toEqual(['concept-3']);
    });
  });

  describe('2. Question Reuse Policy', () => {
    const concept = mockConcepts[0]; // contentVersion = 'v1.0'

    const q1: RecallQuestionRecord = {
      id: 'q-1',
      conceptId: concept.id,
      prompt: 'Explain what an activation function does.',
      questionStyle: 'explanation',
      referencePoints: ['activation', 'non-linear'],
      sourceChunkIds: ['chunk-1'],
      difficulty: 2,
      expectedKeyPoints: ['introduces non-linearity'],
      contentVersion: 'v1.0',
      createdAt: '2026-10-20T10:00:00Z',
    };

    const q2: RecallQuestionRecord = {
      id: 'q-2',
      conceptId: concept.id,
      prompt: 'How do weights and biases affect the output of a neuron?',
      questionStyle: 'cause_effect',
      referencePoints: ['weight', 'bias'],
      sourceChunkIds: ['chunk-1'],
      difficulty: 2,
      expectedKeyPoints: ['scales inputs and shifts activation'],
      contentVersion: 'v1.0',
      createdAt: '2026-10-20T10:00:00Z',
    };

    const qOutdated: RecallQuestionRecord = {
      ...q1,
      id: 'q-outdated',
      contentVersion: 'v0.9', // outdated
    };

    it('rejects questions with contentVersion mismatch', () => {
      const res = evaluateQuestionEligibility({
        concept,
        candidateQuestion: qOutdated,
      });
      expect(res.eligible).toBe(false);
      expect(res.reason).toContain('Content version mismatch');
    });

    it('never allows asking the identical question twice in the same session', () => {
      const res = evaluateQuestionEligibility({
        concept,
        candidateQuestion: q1,
        sessionQuestionIds: ['q-1'],
      });
      expect(res.eligible).toBe(false);
      expect(res.reason).toContain('already presented in the current learning session');
    });

    it('never allows asking the identical question twice consecutively', () => {
      const pastAttempt: RecallAttemptRecord = {
        id: 'att-1',
        sessionId: 'prev-session',
        conceptId: concept.id,
        questionId: 'q-1',
        answerText: 'Sample answer',
        confidence: 2,
        qualityGrade: 4,
        evaluationMode: 'hybrid',
        pendingEvaluation: false,
        createdAt: '2026-10-21T10:00:00Z',
      };

      const res = evaluateQuestionEligibility({
        concept,
        candidateQuestion: q1,
        pastAttemptsForConcept: [pastAttempt],
      });
      expect(res.eligible).toBe(false);
      expect(res.reason).toContain('immediate previous attempt');
    });

    it('enforces recent attempt cooldown (N=3)', () => {
      const pastAttempts: RecallAttemptRecord[] = [
        {
          id: 'att-1',
          sessionId: 's-1',
          conceptId: concept.id,
          questionId: 'q-other-1',
          answerText: 'a',
          confidence: 2,
          qualityGrade: 3,
          evaluationMode: 'hybrid',
          pendingEvaluation: false,
          createdAt: '2026-10-20T10:00:00Z',
        },
        {
          id: 'att-2',
          sessionId: 's-2',
          conceptId: concept.id,
          questionId: 'q-1',
          answerText: 'b',
          confidence: 2,
          qualityGrade: 4,
          evaluationMode: 'hybrid',
          pendingEvaluation: false,
          createdAt: '2026-10-21T10:00:00Z',
        },
        {
          id: 'att-3',
          sessionId: 's-3',
          conceptId: concept.id,
          questionId: 'q-other-2',
          answerText: 'c',
          confidence: 2,
          qualityGrade: 4,
          evaluationMode: 'hybrid',
          pendingEvaluation: false,
          createdAt: '2026-10-22T10:00:00Z',
        },
      ];

      // q-1 is within the last 3 attempts
      const res = evaluateQuestionEligibility({
        concept,
        candidateQuestion: q1,
        pastAttemptsForConcept: pastAttempts,
      });
      expect(res.eligible).toBe(false);
      expect(res.reason).toContain('within the last 3 attempts');
    });

    it('findReusableQuestion prioritizes unanswered questions first over answered questions', () => {
      const pastAttempts: RecallAttemptRecord[] = [
        {
          id: 'att-old',
          sessionId: 's-old',
          conceptId: concept.id,
          questionId: 'q-1',
          answerText: 'ans',
          confidence: 2,
          qualityGrade: 4,
          evaluationMode: 'hybrid',
          pendingEvaluation: false,
          createdAt: '2026-10-10T10:00:00Z',
        },
      ];

      // q2 has never been attempted; q1 was attempted in the distant past
      const selected = findReusableQuestion({
        concept,
        availableQuestions: [q1, q2],
        pastAttemptsForConcept: pastAttempts,
      });

      expect(selected?.id).toBe('q-2');
    });

    it('returns null (cache exhausted) when no candidate satisfies policy', () => {
      const selected = findReusableQuestion({
        concept,
        availableQuestions: [q1],
        sessionQuestionIds: ['q-1'], // already asked in this session
      });
      expect(selected).toBeNull();
    });
  });

  describe('3. Revision Mode (SM-2) Queue Filtering & Controlled Clock', () => {
    it('filters and orders due items: weak concepts first, then most overdue', async () => {
      const db = await openDatabase(TEST_DB);

      // Seed Spaced Repetition states
      // concept-1: weak = true, nextDueAt = 2026-10-25T00:00:00Z
      const sr1: SpacedRepetitionStateRecord = {
        id: 'sr-1',
        conceptId: 'concept-1',
        materialId: 'mat-1',
        intervalDays: 1,
        easinessFactor: 2.1,
        repetitions: 1,
        nextDueAt: '2026-10-25T00:00:00Z',
        weak: true,
        lastReviewedAt: '2026-10-24T00:00:00Z',
        updatedAt: '2026-10-24T00:00:00Z',
      };

      // concept-2: not weak, overdue by 3 days (nextDueAt = 2026-10-22T00:00:00Z)
      const sr2: SpacedRepetitionStateRecord = {
        id: 'sr-2',
        conceptId: 'concept-2',
        materialId: 'mat-1',
        intervalDays: 3,
        easinessFactor: 2.5,
        repetitions: 2,
        nextDueAt: '2026-10-22T00:00:00Z',
        weak: false,
        lastReviewedAt: '2026-10-19T00:00:00Z',
        updatedAt: '2026-10-19T00:00:00Z',
      };

      // concept-3: future review (nextDueAt = 2026-10-30T00:00:00Z)
      const sr3: SpacedRepetitionStateRecord = {
        id: 'sr-3',
        conceptId: 'concept-3',
        materialId: 'mat-1',
        intervalDays: 6,
        easinessFactor: 2.5,
        repetitions: 3,
        nextDueAt: '2026-10-30T00:00:00Z',
        weak: false,
        lastReviewedAt: '2026-10-24T00:00:00Z',
        updatedAt: '2026-10-24T00:00:00Z',
      };

      await db.put('spacedRepetitionStates', sr1);
      await db.put('spacedRepetitionStates', sr2);
      await db.put('spacedRepetitionStates', sr3);

      const ctx: ModeContext = {
        materialId: 'mat-1',
        sessionId: 'session-rev',
        mode: 'revision',
        selection: { kind: 'WHOLE_MATERIAL' },
        concepts: mockConcepts,
        units: mockUnits,
        dependencies: mockDependencies,
        chunks: mockChunks,
      };

      // Simulated current time: 2026-10-25T12:00:00Z
      const simulatedNow = new Date('2026-10-25T12:00:00Z');

      const queueRes = await revisionMode.getReviewQueue(ctx, simulatedNow, TEST_DB);
      expect(queueRes.dueItems.length).toBe(2);

      // Weak concept (concept-1) must surface first even if concept-2 is more overdue
      expect(queueRes.dueItems[0].concept.id).toBe('concept-1');
      expect(queueRes.dueItems[0].category).toBe('weak');

      expect(queueRes.dueItems[1].concept.id).toBe('concept-2');
      expect(queueRes.dueItems[1].category).toBe('overdue');

      // Next upcoming review should be concept-3
      expect(queueRes.nextUpcomingDueAt).toBe('2026-10-30T00:00:00Z');
    });

    it('reports honest 0-due availability with next due date when nothing is due', async () => {
      const db = await openDatabase(TEST_DB);

      // Future review only
      const srFuture: SpacedRepetitionStateRecord = {
        id: 'sr-future',
        conceptId: 'concept-1',
        materialId: 'mat-1',
        intervalDays: 5,
        easinessFactor: 2.5,
        repetitions: 2,
        nextDueAt: '2026-10-30T00:00:00Z',
        weak: false,
        lastReviewedAt: '2026-10-25T00:00:00Z',
        updatedAt: '2026-10-25T00:00:00Z',
      };
      await db.put('spacedRepetitionStates', srFuture);

      const ctx: ModeContext = {
        materialId: 'mat-1',
        sessionId: 'session-rev',
        mode: 'revision',
        selection: { kind: 'UNITS', unitIds: ['unit-1'] },
        concepts: [mockConcepts[0]],
        units: [mockUnits[0]],
        dependencies: [],
        chunks: [],
      };

      const nowInstant = new Date('2026-10-25T10:00:00Z');
      const availability = await revisionMode.getAvailability(ctx, nowInstant, TEST_DB);

      expect(availability.available).toBe(false);
      expect(availability.dueCount).toBe(0);
      expect(availability.reason).toContain('No concepts are due today');
      expect(availability.nextDueAt).toBe('2026-10-30T00:00:00Z');
    });
  });

  describe('4. Atomic Persistence & Database Derivation', () => {
    it('commits attempt, mastery, and SM-2 records atomically with materialId and conceptId linkage', async () => {
      const db = await openDatabase(TEST_DB);

      // Seed concept in DB
      await db.put('concepts', mockConcepts[0]);

      const attempt: RecallAttemptRecord = {
        id: 'att-atomic-1',
        sessionId: 'session-atomic',
        conceptId: mockConcepts[0].id,
        materialId: 'mat-1',
        unitId: 'unit-1',
        questionId: 'q-atomic',
        answerText: 'Neurons compute linear sum and apply non-linearity',
        confidence: 3,
        compositeScore: 88,
        qualityGrade: 5,
        evaluationMode: 'hybrid',
        pendingEvaluation: false,
        createdAt: '2026-10-25T11:00:00Z',
      };

      const res = await saveAttemptAndMasteryAtomic({
        attempt,
        dbName: TEST_DB,
      });

      expect(res.attempt.id).toBe('att-atomic-1');
      expect(res.mastery.percentage).toBe(88);
      expect(res.spacedRepetition.repetitions).toBe(1);
      expect(res.spacedRepetition.intervalDays).toBe(1);

      // Verify all 3 stores have records in IndexedDB
      const savedAttempt = await db.get('recallAttempts', 'att-atomic-1');
      const savedMastery = await db.get('masteryStates', res.mastery.id);
      const savedSr = await db.get('spacedRepetitionStates', res.spacedRepetition.id);

      expect(savedAttempt).toBeDefined();
      expect(savedMastery).toBeDefined();
      expect(savedSr).toBeDefined();

      expect(savedAttempt?.materialId).toBe('mat-1');
      expect(savedMastery?.materialId).toBe('mat-1');
      expect(savedSr?.materialId).toBe('mat-1');
    });

    it('buildSessionSummaryFromDatabase derives exact numbers strictly from stored records', async () => {
      const db = await openDatabase(TEST_DB);

      const sessionId = 'session-summary-test';
      const materialId = 'mat-1';

      // Seed session
      const session: StudySessionRecord = {
        id: sessionId,
        materialId,
        learningUnitId: 'unit-1',
        currentUnitId: 'unit-1',
        mode: 'recall',
        status: 'completed',
        machineState: 'IDLE',
        currentConceptId: 'concept-1',
        sourceMode: 'document',
        startedAt: '2026-10-25T10:00:00Z',
        endedAt: '2026-10-25T10:15:00Z',
        updatedAt: '2026-10-25T10:15:00Z',
      };
      await db.put('studySessions', session);

      // Seed concepts & units
      for (const c of mockConcepts) await db.put('concepts', c);
      for (const u of mockUnits) await db.put('learningUnits', u);

      // Seed 2 attempts: one strong (q5, score 90), one weak (q2, score 40)
      const attempt1: RecallAttemptRecord = {
        id: 'att-1',
        sessionId,
        conceptId: 'concept-1',
        materialId,
        unitId: 'unit-1',
        questionId: 'q-1',
        answerText: 'Strong answer',
        confidence: 3,
        compositeScore: 90,
        qualityGrade: 5,
        evaluationMode: 'hybrid',
        pendingEvaluation: false,
        rubric: { strengths: ['Comprehensive explanation'], missingKeyPoints: [] },
        createdAt: '2026-10-25T10:05:00Z',
      };

      const attempt2: RecallAttemptRecord = {
        id: 'att-2',
        sessionId,
        conceptId: 'concept-2',
        materialId,
        unitId: 'unit-1',
        questionId: 'q-2',
        answerText: 'Vague answer',
        confidence: 1,
        compositeScore: 40,
        qualityGrade: 2,
        evaluationMode: 'judge-only',
        pendingEvaluation: false,
        rubric: { strengths: [], missingKeyPoints: ['Forgot chain rule derivation'] },
        createdAt: '2026-10-25T10:10:00Z',
      };

      await db.put('recallAttempts', attempt1);
      await db.put('recallAttempts', attempt2);

      // Seed spaced repetition state updated during this session
      const sr1: SpacedRepetitionStateRecord = {
        id: 'sr-sum-1',
        conceptId: 'concept-1',
        materialId,
        intervalDays: 1,
        easinessFactor: 2.6,
        repetitions: 1,
        nextDueAt: '2026-10-26T10:00:00Z',
        weak: false,
        lastReviewedAt: '2026-10-25T10:05:00Z',
        updatedAt: '2026-10-25T10:05:00Z',
      };
      await db.put('spacedRepetitionStates', sr1);

      const summary = await buildSessionSummaryFromDatabase(sessionId, materialId, TEST_DB);

      // Verify exact stored facts
      expect(summary.sessionId).toBe(sessionId);
      expect(summary.durationSeconds).toBe(900); // 15 mins = 900s
      expect(summary.questionsAnswered).toBe(2);
      expect(summary.averageScore).toBe(65); // (90 + 40) / 2 = 65
      expect(summary.conceptsCovered.length).toBe(2);

      // Honest evaluation mode reporting
      expect(summary.evaluationResults[0].evaluationMode).toBe('hybrid');
      expect(summary.evaluationResults[1].evaluationMode).toBe('judge-only');

      // Weak concept needing practice
      expect(summary.conceptsNeedingPractice.length).toBe(1);
      expect(summary.conceptsNeedingPractice[0].id).toBe('concept-2');

      // Newly scheduled review
      expect(summary.newlyScheduledReviews.length).toBe(1);
      expect(summary.newlyScheduledReviews[0].conceptId).toBe('concept-1');
      expect(summary.newlyScheduledReviews[0].intervalDays).toBe(1);

      // Recommended next action derived from data
      expect(summary.recommendedNextAction.type).toBe('REVIEW_WEAK');
      expect(summary.recommendedNextAction.title).toContain('Practice 1 Weak Concept');
    });
  });

  describe('5. Session Lifecycle & Persistence Disctinction (Active, Paused, Completed, Abandoned)', () => {
    it('distinguishes between completed, paused, and abandoned sessions in IndexedDB', async () => {
      const db = await openDatabase(TEST_DB);

      const baseSession: StudySessionRecord = {
        id: 'sess-life',
        materialId: 'mat-1',
        learningUnitId: 'unit-1',
        currentUnitId: 'unit-1',
        mode: 'study',
        status: 'active',
        machineState: 'IDLE',
        currentConceptId: 'concept-1',
        sourceMode: 'document',
        startedAt: '2026-10-25T10:00:00Z',
        updatedAt: '2026-10-25T10:00:00Z',
      };
      await db.put('studySessions', baseSession);

      // 1. Paused
      baseSession.status = 'paused';
      baseSession.draftAnswer = 'Unfinished draft explanation...';
      await db.put('studySessions', baseSession);

      const paused = await db.get('studySessions', 'sess-life');
      expect(paused?.status).toBe('paused');
      expect(paused?.draftAnswer).toBe('Unfinished draft explanation...');
      expect(paused?.endedAt).toBeUndefined();

      // 2. Abandoned (preserves all records, records endedAt)
      baseSession.status = 'abandoned';
      baseSession.endedAt = '2026-10-25T10:20:00Z';
      await db.put('studySessions', baseSession);

      const abandoned = await db.get('studySessions', 'sess-life');
      expect(abandoned?.status).toBe('abandoned');
      expect(abandoned?.endedAt).toBe('2026-10-25T10:20:00Z');
      expect(abandoned?.draftAnswer).toBe('Unfinished draft explanation...');

      // 3. Completed
      baseSession.status = 'completed';
      baseSession.endedAt = '2026-10-25T10:30:00Z';
      await db.put('studySessions', baseSession);

      const completed = await db.get('studySessions', 'sess-life');
      expect(completed?.status).toBe('completed');
      expect(completed?.endedAt).toBe('2026-10-25T10:30:00Z');
    });
  });
});
