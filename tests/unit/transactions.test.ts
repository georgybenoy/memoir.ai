import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  openDatabase,
  closeDatabase,
  removeDatabase,
  runTransaction,
} from '@/lib/db/indexeddb';
import { StorageError } from '@/lib/db/errors';
import {
  type RecallAttemptRecord,
  type MasteryStateRecord,
  type SpacedRepetitionStateRecord,
} from '@/types/domain';

describe('runTransaction helper & atomic rollback', () => {
  const testDbName = 'edumentor-tx-test';

  beforeEach(async () => {
    closeDatabase();
    await removeDatabase(testDbName);
    await openDatabase(testDbName);
  });

  afterEach(async () => {
    closeDatabase();
    await removeDatabase(testDbName);
  });

  it('atomically commits writes across multiple stores (attempt + mastery + SM-2)', async () => {
    const attempt: RecallAttemptRecord = {
      id: 'att-tx-1',
      sessionId: 'sess-1',
      questionId: 'q-1',
      conceptId: 'concept-1',
      answerText: 'Atomic transactions guarantee ACID properties.',
      confidence: 'high',
      semanticScore: 95,
      judgeScore: 92,
      compositeScore: 94,
      qualityGrade: 5,
      evaluationMode: 'hybrid',
      pendingEvaluation: false,
      createdAt: '2026-05-01T10:00:00.000Z',
    };

    const mastery: MasteryStateRecord = {
      id: 'm-tx-1',
      conceptId: 'concept-1',
      level: 4,
      percentage: 95,
      bestScore: 95,
      attemptCount: 3,
      updatedAt: '2026-05-01T10:00:00.000Z',
    };

    const sm2: SpacedRepetitionStateRecord = {
      id: 'sr-tx-1',
      conceptId: 'concept-1',
      repetitions: 3,
      easinessFactor: 2.6,
      intervalDays: 12,
      nextDueAt: '2026-05-13T10:00:00.000Z',
      weak: false,
      updatedAt: '2026-05-01T10:00:00.000Z',
    };

    // Execute multi-store write in ONE transaction
    await runTransaction(
      ['recallAttempts', 'masteryStates', 'spacedRepetitionStates'],
      'readwrite',
      async (tx) => {
        await tx.objectStore('recallAttempts').put(attempt);
        await tx.objectStore('masteryStates').put(mastery);
        await tx.objectStore('spacedRepetitionStates').put(sm2);
      },
      testDbName,
    );

    // Verify all 3 records were committed
    const db = await openDatabase(testDbName);
    const savedAttempt = await db.get('recallAttempts', 'att-tx-1');
    const savedMastery = await db.get('masteryStates', 'm-tx-1');
    const savedSm2 = await db.get('spacedRepetitionStates', 'sr-tx-1');

    expect(savedAttempt?.compositeScore).toBe(94);
    expect(savedMastery?.level).toBe(4);
    expect(savedSm2?.intervalDays).toBe(12);
  });

  it('rolls back all writes if any error occurs inside the transaction', async () => {
    const attempt: RecallAttemptRecord = {
      id: 'att-tx-fail',
      sessionId: 'sess-fail',
      questionId: 'q-fail',
      conceptId: 'concept-fail',
      answerText: 'Will be rolled back',
      confidence: 'low',
      qualityGrade: 1,
      evaluationMode: 'fallback',
      pendingEvaluation: false,
      createdAt: '2026-05-01T10:00:00.000Z',
    };

    const mastery: MasteryStateRecord = {
      id: 'm-tx-fail',
      conceptId: 'concept-fail',
      level: 1,
      percentage: 20,
      bestScore: 20,
      attemptCount: 1,
      updatedAt: '2026-05-01T10:00:00.000Z',
    };

    // Attempt multi-store write that fails midway
    await expect(
      runTransaction(
        ['recallAttempts', 'masteryStates'],
        'readwrite',
        async (tx) => {
          await tx.objectStore('recallAttempts').put(attempt);
          await tx.objectStore('masteryStates').put(mastery);
          throw new Error('Simulated failure during evaluation write');
        },
        testDbName,
      ),
    ).rejects.toThrow(StorageError);

    // Verify neither record was committed to the database
    const db = await openDatabase(testDbName);
    const savedAttempt = await db.get('recallAttempts', 'att-tx-fail');
    const savedMastery = await db.get('masteryStates', 'm-tx-fail');

    expect(savedAttempt).toBeUndefined();
    expect(savedMastery).toBeUndefined();
  });
});
