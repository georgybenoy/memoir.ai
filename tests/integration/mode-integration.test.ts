import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, closeDatabase, removeDatabase } from '@/lib/db/indexeddb';
import { studyMode } from '@/features/modes/study-mode';
import { recallMode } from '@/features/modes/recall-mode';
import { revisionMode } from '@/features/modes/revision-mode';
import { buildSessionSummaryFromDatabase } from '@/features/modes/summary-service';
import { saveAttemptAndMasteryAtomic } from '@/features/mastery/mastery-service';
import {
  type ConceptRecord,
  type LearningUnitRecord,
  type ConceptDependencyRecord,
  type DocumentChunkRecord,
  type DocumentRecord,
  type StudySessionRecord,
  type RecallAttemptRecord,
  type SpacedRepetitionStateRecord,
} from '@/types/domain';
import { type ModeContext } from '@/features/modes/types';

describe('Phase R4 Mode Integration Tests (Real IndexedDB, Mocked AI)', () => {
  const TEST_DB = 'test-r4-integration-db';

  beforeEach(async () => {
    closeDatabase();
    await removeDatabase(TEST_DB);
    await openDatabase(TEST_DB);
  });

  const materialId = 'mat-ai-fundamentals';
  const docId = 'doc-neural-nets';

  const mockMaterialDoc: DocumentRecord = {
    id: docId,
    materialId,
    filename: 'neural-networks.pdf',
    extractedText: 'Full extracted text of neural networks guide.',
    analysisStatus: 'completed',
    fileType: 'pdf',
    fileSize: 45000,
    fileHash: 'sha256-abc123456',
    contentHash: 'sha256-def789012',
    contentVersion: 'v1.0',
    createdAt: '2026-10-25T08:00:00Z',
    updatedAt: '2026-10-25T08:00:00Z',
  };

  const mockConcepts: ConceptRecord[] = [
    {
      id: 'concept-activation',
      materialId,
      unitId: 'unit-1',
      title: 'Activation Functions',
      summary: 'Non-linear transformations applied to neuron weighted inputs.',
      canonicalExplanation: 'Activation functions introduce non-linearity, enabling universal approximation.',
      keyTerms: ['ReLU', 'Sigmoid', 'Non-linearity'],
      sourceChunkIds: ['chunk-1'],
      tier: 1,
      status: 'available',
      confidence: 0.85,
      extractionOrder: 0,
      contentVersion: 'v1.0',
      createdAt: '2026-10-25T08:00:00Z',
      updatedAt: '2026-10-25T08:00:00Z',
    },
    {
      id: 'concept-loss',
      materialId,
      unitId: 'unit-1',
      title: 'Loss Functions',
      summary: 'Quantification of model prediction error.',
      canonicalExplanation: 'Loss functions measure the discrepancy between predictions and targets.',
      keyTerms: ['Cross-Entropy', 'MSE', 'Objective'],
      sourceChunkIds: ['chunk-2'],
      tier: 2,
      status: 'available',
      confidence: 0.75,
      extractionOrder: 1,
      contentVersion: 'v1.0',
      createdAt: '2026-10-25T08:00:00Z',
      updatedAt: '2026-10-25T08:00:00Z',
    },
  ];

  const mockUnits: LearningUnitRecord[] = [
    {
      id: 'unit-1',
      materialId,
      order: 0,
      title: 'Unit 1: Forward Propagation',
      summary: 'Architecture and initial activations',
      conceptIds: ['concept-activation', 'concept-loss'],
      sourceChunkIds: ['chunk-1', 'chunk-2'],
      contentVersion: 'v1.0',
      createdAt: '2026-10-25T08:00:00Z',
      updatedAt: '2026-10-25T08:00:00Z',
    },
  ];

  const mockChunks: DocumentChunkRecord[] = [
    {
      id: 'chunk-1',
      documentId: docId,
      materialId,
      chunkIndex: 0,
      text: 'Activation functions decide whether a neuron should be activated or not.',
      startOffset: 0,
      endOffset: 72,
      contentHash: 'hash-chunk-1',
      pageStart: 1,
      createdAt: '2026-10-25T08:00:00Z',
    },
    {
      id: 'chunk-2',
      documentId: docId,
      materialId,
      chunkIndex: 1,
      text: 'Loss functions quantify how far predictions are from ground truth targets.',
      startOffset: 73,
      endOffset: 147,
      contentHash: 'hash-chunk-2',
      pageStart: 2,
      createdAt: '2026-10-25T08:00:00Z',
    },
  ];

  const mockDeps: ConceptDependencyRecord[] = [
    {
      id: 'dep-1',
      prerequisiteId: 'concept-activation',
      dependentConceptId: 'concept-loss',
      confidence: 0.8,
      removed: false,
      createdAt: '2026-10-25T08:00:00Z',
    },
  ];

  async function seedMaterialData(db: Awaited<ReturnType<typeof openDatabase>>) {
    await db.put('documents', mockMaterialDoc);
    for (const c of mockConcepts) await db.put('concepts', c);
    for (const u of mockUnits) await db.put('learningUnits', u);
    for (const ch of mockChunks) await db.put('documentChunks', ch);
    for (const d of mockDeps) await db.put('conceptDependencies', d);
  }

  it('1. Study a concept → pause → reload → resume exactly', async () => {
    const db = await openDatabase(TEST_DB);
    await seedMaterialData(db);

    const ctx: ModeContext = {
      materialId,
      sessionId: 'study-session-1',
      mode: 'study',
      selection: { kind: 'UNITS', unitIds: ['unit-1'] },
      concepts: mockConcepts,
      units: mockUnits,
      dependencies: mockDeps,
      chunks: mockChunks,
    };

    // 1. Start study session
    const started = await studyMode.start(ctx);
    expect(started.id).toBe('study-session-1');
    expect(started.mode).toBe('study');
    expect(started.status).toBe('active');
    expect(started.currentConceptId).toBe('concept-activation');

    // 2. User types draft answer and pauses
    started.status = 'paused';
    started.draftAnswer = 'Activation functions introduce non-linear mapping between layers.';
    started.machineState = 'EXPLORING';
    await db.put('studySessions', started);

    // 3. Reload from DB (simulating page reload)
    const stored = (await db.get('studySessions', 'study-session-1')) as StudySessionRecord;
    expect(stored).toBeDefined();
    expect(stored.status).toBe('paused');
    expect(stored.draftAnswer).toBe('Activation functions introduce non-linear mapping between layers.');

    // 4. Resume via mode module
    const resumed = await studyMode.resume(stored, ctx);
    expect(resumed.status).toBe('active');
    expect(resumed.draftAnswer).toBe('Activation functions introduce non-linear mapping between layers.');
    expect(resumed.currentConceptId).toBe('concept-activation');
  });

  it('2. Recall with a strong answer and a weak answer (loopback appears, mastery updated, SM-2 scheduled)', async () => {
    const db = await openDatabase(TEST_DB);
    await seedMaterialData(db);

    const sessionId = 'recall-session-test';

    // A. Strong Answer for concept-activation
    const strongAttempt: RecallAttemptRecord = {
      id: 'att-strong',
      sessionId,
      conceptId: 'concept-activation',
      materialId,
      unitId: 'unit-1',
      questionId: 'q-activation-1',
      answerText: 'ReLU outputs x for x > 0 and 0 otherwise, preventing gradient vanishing.',
      confidence: 3,
      compositeScore: 92,
      qualityGrade: 5,
      evaluationMode: 'hybrid',
      pendingEvaluation: false,
      createdAt: '2026-10-25T10:00:00Z',
    };

    const strongRes = await saveAttemptAndMasteryAtomic({
      attempt: strongAttempt,
      dbName: TEST_DB,
    });

    expect(strongRes.attempt.qualityGrade).toBe(5);
    expect(strongRes.mastery.percentage).toBe(92);
    expect(strongRes.mastery.masteryLevel).toBe('proficient'); // single attempt capped at proficient
    expect(strongRes.spacedRepetition.repetitions).toBe(1);
    expect(strongRes.spacedRepetition.intervalDays).toBe(1);
    expect(strongRes.spacedRepetition.weak).toBe(false);

    // B. Weak Answer for concept-loss (triggers remedial loopback)
    const weakAttempt: RecallAttemptRecord = {
      id: 'att-weak',
      sessionId,
      conceptId: 'concept-loss',
      materialId,
      unitId: 'unit-1',
      questionId: 'q-loss-1',
      answerText: 'Loss is something bad in neural networks.',
      confidence: 1,
      compositeScore: 30,
      qualityGrade: 1,
      evaluationMode: 'hybrid',
      pendingEvaluation: false,
      createdAt: '2026-10-25T10:05:00Z',
    };

    const weakRes = await saveAttemptAndMasteryAtomic({
      attempt: weakAttempt,
      dbName: TEST_DB,
    });

    // Quality grade 1 (< 3) must flag weak and reset repetitions in SM-2
    expect(weakRes.attempt.qualityGrade).toBe(1);
    expect(weakRes.mastery.percentage).toBe(30);
    expect(weakRes.mastery.reviewStatus).toBe('due');
    expect(weakRes.spacedRepetition.weak).toBe(true);
    expect(weakRes.spacedRepetition.repetitions).toBe(0);
  });

  it('3. Revision after advancing the clock shows the due item and reschedules correctly', async () => {
    const db = await openDatabase(TEST_DB);
    await seedMaterialData(db);

    // Seed initial review record scheduled for tomorrow: 2026-10-26T10:00:00Z
    const srInitial: SpacedRepetitionStateRecord = {
      id: 'sr-active-test',
      conceptId: 'concept-activation',
      materialId,
      intervalDays: 1,
      easinessFactor: 2.5,
      repetitions: 1,
      nextDueAt: '2026-10-26T10:00:00Z',
      weak: false,
      lastReviewedAt: '2026-10-25T10:00:00Z',
      updatedAt: '2026-10-25T10:00:00Z',
    };
    await db.put('spacedRepetitionStates', srInitial);

    const ctx: ModeContext = {
      materialId,
      sessionId: 'session-rev-flow',
      mode: 'revision',
      selection: { kind: 'WHOLE_MATERIAL' },
      concepts: mockConcepts,
      units: mockUnits,
      dependencies: mockDeps,
      chunks: mockChunks,
    };

    // At 2026-10-25T12:00:00Z: Not due yet
    const todayClock = new Date('2026-10-25T12:00:00Z');
    const queueBefore = await revisionMode.getReviewQueue(ctx, todayClock, TEST_DB);
    expect(queueBefore.dueItems.length).toBe(0);
    expect(queueBefore.nextUpcomingDueAt).toBe('2026-10-26T10:00:00Z');

    // Advance clock past due date: 2026-10-26T14:00:00Z
    const tomorrowClock = new Date('2026-10-26T14:00:00Z');
    const queueAfter = await revisionMode.getReviewQueue(ctx, tomorrowClock, TEST_DB);
    expect(queueAfter.dueItems.length).toBe(1);
    expect(queueAfter.dueItems[0].concept.id).toBe('concept-activation');
    expect(queueAfter.dueItems[0].category).toBe('dueToday');

    // Record completed review attempt (grade 4)
    const reviewAttempt: RecallAttemptRecord = {
      id: 'att-rev-1',
      sessionId: 'session-rev-flow',
      conceptId: 'concept-activation',
      materialId,
      unitId: 'unit-1',
      questionId: 'q-activation-1',
      answerText: 'Accurate review answer explaining non-linearity',
      confidence: 3,
      compositeScore: 82,
      qualityGrade: 4,
      evaluationMode: 'hybrid',
      pendingEvaluation: false,
      createdAt: '2026-10-26T14:05:00Z',
    };

    const reviewRes = await saveAttemptAndMasteryAtomic({
      attempt: reviewAttempt,
      dbName: TEST_DB,
    });

    // In SM-2, repetition 2 gives interval of 6 days
    expect(reviewRes.spacedRepetition.repetitions).toBe(2);
    expect(reviewRes.spacedRepetition.intervalDays).toBe(6);
  });

  it('4. Switching Study → Recall → Revision on the same material creates 0 new material records', async () => {
    const db = await openDatabase(TEST_DB);
    await seedMaterialData(db);

    const initialDocs = await db.getAll('documents');
    expect(initialDocs.length).toBe(1);

    const ctx: ModeContext = {
      materialId,
      sessionId: 'session-mode-switch',
      mode: 'study',
      selection: { kind: 'WHOLE_MATERIAL' },
      concepts: mockConcepts,
      units: mockUnits,
      dependencies: mockDeps,
      chunks: mockChunks,
    };

    // 1. Study
    await studyMode.start(ctx);
    // 2. Recall
    await recallMode.start({ ...ctx, mode: 'recall' });
    // 3. Revision
    await revisionMode.start({ ...ctx, mode: 'revision' });

    // Documents and materials table must remain untouched (exactly 1 record)
    const finalDocs = await db.getAll('documents');
    expect(finalDocs.length).toBe(1);
    expect(finalDocs[0].id).toBe(docId);
  });

  it('5. Progress from Recall appears in Revision queue as a weak item', async () => {
    const db = await openDatabase(TEST_DB);
    await seedMaterialData(db);

    // Simulate failing Recall attempt (q = 1)
    const failAttempt: RecallAttemptRecord = {
      id: 'att-fail-1',
      sessionId: 'recall-session-fail',
      conceptId: 'concept-loss',
      materialId,
      unitId: 'unit-1',
      questionId: 'q-loss-fail',
      answerText: 'I do not remember what cross-entropy is.',
      confidence: 1,
      compositeScore: 20,
      qualityGrade: 1,
      evaluationMode: 'hybrid',
      pendingEvaluation: false,
      createdAt: '2026-10-25T15:00:00Z',
    };

    await saveAttemptAndMasteryAtomic({
      attempt: failAttempt,
      dbName: TEST_DB,
    });

    // Now query Revision queue for this material
    const ctx: ModeContext = {
      materialId,
      sessionId: 'rev-check-session',
      mode: 'revision',
      selection: { kind: 'WHOLE_MATERIAL' },
      concepts: mockConcepts,
      units: mockUnits,
      dependencies: mockDeps,
      chunks: mockChunks,
    };

    const revQueue = await revisionMode.getReviewQueue(ctx, new Date('2026-10-25T15:05:00Z'), TEST_DB);

    // The weak concept must immediately be in the queue with category 'weak'
    expect(revQueue.dueItems.length).toBe(1);
    expect(revQueue.dueItems[0].concept.id).toBe('concept-loss');
    expect(revQueue.dueItems[0].category).toBe('weak');
  });

  it('6. Completion screen values match the database facts exactly', async () => {
    const db = await openDatabase(TEST_DB);
    await seedMaterialData(db);

    const sessionId = 'session-completed-verify';

    // Seed session record
    const session: StudySessionRecord = {
      id: sessionId,
      materialId,
      learningUnitId: 'unit-1',
      currentUnitId: 'unit-1',
      mode: 'recall',
      status: 'completed',
      machineState: 'IDLE',
      currentConceptId: 'concept-activation',
      sourceMode: 'document',
      startedAt: '2026-10-25T16:00:00Z',
      endedAt: '2026-10-25T16:20:00Z',
      updatedAt: '2026-10-25T16:20:00Z',
    };
    await db.put('studySessions', session);

    // Record an attempt
    const attempt: RecallAttemptRecord = {
      id: 'att-comp-1',
      sessionId,
      conceptId: 'concept-activation',
      materialId,
      unitId: 'unit-1',
      questionId: 'q-activation-1',
      answerText: 'Good explanation',
      confidence: 3,
      compositeScore: 84,
      qualityGrade: 4,
      evaluationMode: 'hybrid',
      pendingEvaluation: false,
      rubric: {
        strengths: ['Clear terminology', 'Correct mechanism'],
        missingKeyPoints: [],
      },
      createdAt: '2026-10-25T16:10:00Z',
    };
    await db.put('recallAttempts', attempt);

    // Compute summary from DB
    const summary = await buildSessionSummaryFromDatabase(sessionId, materialId, TEST_DB);

    // Assert exact facts
    expect(summary.sessionId).toBe(sessionId);
    expect(summary.durationSeconds).toBe(1200); // 20 minutes
    expect(summary.questionsAnswered).toBe(1);
    expect(summary.averageScore).toBe(84);
    expect(summary.evaluationResults[0].evaluationMode).toBe('hybrid');
    expect(summary.evaluationResults[0].strengths).toEqual(['Clear terminology', 'Correct mechanism']);
  });
});
