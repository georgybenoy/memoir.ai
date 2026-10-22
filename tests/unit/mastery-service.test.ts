import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeMasteryPercentage,
  determineMasteryLevel,
  calculateMasteryUpdate,
  saveAttemptAndMasteryAtomic,
} from '@/features/mastery/mastery-service';
import { openDatabase, closeDatabase, removeDatabase, runTransaction } from '@/lib/db/indexeddb';
import {
  type ConceptRecord,
  type RecallAttemptRecord,
  type MasteryStateRecord,
} from '@/types/domain';

describe('Concept Mastery Service (mastery-service.test.ts)', () => {
  const TEST_DB = 'test-mastery-service-db';

  beforeEach(async () => {
    closeDatabase();
    await removeDatabase(TEST_DB);
    await openDatabase(TEST_DB);
  });

  describe('computeMasteryPercentage (recency-weighted)', () => {
    it('returns 0 for empty score array', () => {
      expect(computeMasteryPercentage([])).toBe(0);
    });

    it('returns exact score when only 1 attempt exists (re-normalized weight = 1.0)', () => {
      expect(computeMasteryPercentage([80])).toBe(80);
      expect(computeMasteryPercentage([100])).toBe(100);
      expect(computeMasteryPercentage([45])).toBe(45);
    });

    it('weights recent attempts higher using configured weights [0.45, 0.25, 0.15, 0.10, 0.05]', () => {
      // 2 attempts: weights are 0.45 and 0.25 (sum = 0.70)
      // Scores: [90, 50]
      // (0.45 / 0.70) * 90 + (0.25 / 0.70) * 50 = 57.857 + 17.857 = 75.7
      const res = computeMasteryPercentage([90, 50]);
      expect(res).toBe(75.7);
    });
  });

  describe('determineMasteryLevel & "Single High Score is Not Mastered" Invariant', () => {
    it('returns level 0 (new) when there are no attempts', () => {
      expect(determineMasteryLevel(0, [])).toEqual({ level: 0, masteryLevel: 'new' });
    });

    it('CAPS at proficient (level 3) even if score is 100% on a single attempt', () => {
      const singlePerfectAttempt = [{ qualityGrade: 5, createdAt: '2026-10-22T10:00:00Z' }];
      const result = determineMasteryLevel(100, singlePerfectAttempt);
      expect(result.level).toBe(3);
      expect(result.masteryLevel).toBe('proficient');
    });

    it('CAPS at proficient (level 3) when 2 passing attempts occur on the SAME calendar day', () => {
      const sameDayAttempts = [
        { qualityGrade: 5, createdAt: '2026-10-22T09:00:00Z' },
        { qualityGrade: 4, createdAt: '2026-10-22T14:30:00Z' },
      ];
      const result = determineMasteryLevel(95, sameDayAttempts);
      expect(result.level).toBe(3);
      expect(result.masteryLevel).toBe('proficient');
    });

    it('AWARDS mastered (level 4) only when at least two attempts with q >= 4 occur on SEPARATE calendar days', () => {
      const separateDayAttempts = [
        { qualityGrade: 4, createdAt: '2026-10-23T10:00:00Z' },
        { qualityGrade: 5, createdAt: '2026-10-21T10:00:00Z' },
      ];
      const result = determineMasteryLevel(88, separateDayAttempts);
      expect(result.level).toBe(4);
      expect(result.masteryLevel).toBe('mastered');
    });

    it('assigns familiar and learning levels based on percentage bands', () => {
      const attempts = [{ qualityGrade: 2, createdAt: '2026-10-22T10:00:00Z' }];
      expect(determineMasteryLevel(60, attempts).masteryLevel).toBe('familiar');
      expect(determineMasteryLevel(35, attempts).masteryLevel).toBe('learning');
      expect(determineMasteryLevel(10, attempts).masteryLevel).toBe('new');
    });
  });

  describe('calculateMasteryUpdate', () => {
    it('tracks score and confidence history cleanly up to max length', () => {
      const prevMastery: MasteryStateRecord = {
        id: 'm-1',
        conceptId: 'c-1',
        level: 1,
        percentage: 40,
        bestScore: 40,
        attemptCount: 1,
        lastAttemptAt: '2026-10-21T00:00:00Z',
        scoreHistory: [40],
        confidenceHistory: [2],
        updatedAt: '2026-10-21T00:00:00Z',
      };

      const newAttempt = {
        score: 80,
        qualityGrade: 4,
        confidence: 3,
        createdAt: '2026-10-22T00:00:00Z',
      };

      const pastAttempts = [{ score: 40, qualityGrade: 2, confidence: 2, createdAt: '2026-10-21T00:00:00Z' }];

      const updated = calculateMasteryUpdate({
        conceptId: 'c-1',
        currentMastery: prevMastery,
        newAttempt,
        pastAttempts,
      });

      expect(updated.attemptCount).toBe(2);
      expect(updated.bestScore).toBe(80);
      expect(updated.scoreHistory).toEqual([80, 40]);
      expect(updated.confidenceHistory).toEqual([3, 2]);
    });
  });

  describe('saveAttemptAndMasteryAtomic Transaction & Rollback', () => {
    const mockConcept: ConceptRecord = {
      id: 'c-tx-test',
      title: 'Cell Membrane',
      summary: 'Lipid bilayer',
      canonicalExplanation: 'Fluid mosaic model',
      keyTerms: ['phospholipids'],
      sourceChunkIds: [],
      tier: 0,
      status: 'available',
      confidence: 1,
      extractionOrder: 0,
      createdAt: '2026-10-22T00:00:00Z',
      updatedAt: '2026-10-22T00:00:00Z',
    };

    const mockAttempt: RecallAttemptRecord = {
      id: 'att-atom-1',
      sessionId: 'sess-1',
      questionId: 'q-1',
      conceptId: 'c-tx-test',
      answerText: 'The membrane consists of amphipathic phospholipids.',
      confidence: 3,
      semanticScore: 85,
      judgeScore: 90,
      compositeScore: 88,
      qualityGrade: 5,
      evaluationMode: 'hybrid',
      pendingEvaluation: false,
      createdAt: '2026-10-22T10:00:00Z',
    };

    it('atomically commits attempt, mastery update, and learning event', async () => {
      const db = await openDatabase(TEST_DB);
      await db.put('concepts', mockConcept);

      const result = await saveAttemptAndMasteryAtomic({
        attempt: mockAttempt,
        currentMastery: null,
        pastAttempts: [],
        dbName: TEST_DB,
      });

      expect(result.mastery.percentage).toBe(88);
      expect(result.concept?.status).toBe('in_progress');
      expect(result.spacedRepetition.repetitions).toBe(1);
      expect(result.spacedRepetition.intervalDays).toBe(1);

      // Verify in DB
      const inDbAttempt = await db.get('recallAttempts', mockAttempt.id);
      expect(inDbAttempt).toBeDefined();
      expect(inDbAttempt?.compositeScore).toBe(88);

      const inDbMastery = await db.get('masteryStates', result.mastery.id);
      expect(inDbMastery).toBeDefined();
      expect(inDbMastery?.conceptId).toBe('c-tx-test');

      const inDbSr = await db.get('spacedRepetitionStates', result.spacedRepetition.id);
      expect(inDbSr).toBeDefined();
      expect(inDbSr?.conceptId).toBe('c-tx-test');
      expect(inDbSr?.weak).toBe(false);

      const events = await db.getAll('learningEvents');
      expect(events.some((e) => e.eventType === 'ATTEMPT_EVALUATED')).toBe(true);
    });

    it('aborts transaction and leaves database unmodified if an error is thrown', async () => {
      const db = await openDatabase(TEST_DB);
      await db.put('concepts', mockConcept);

      // Attempt to write inside a multi-store transaction that throws mid-execution
      const corruptAttempt = {
        ...mockAttempt,
        id: 'fail-attempt',
      };

      let threw = false;
      try {
        await runTransaction(['recallAttempts'], 'readwrite', async (tx) => {
          await tx.objectStore('recallAttempts').put(corruptAttempt);
          throw new Error('Disk quota full / simulated storage failure');
        });
      } catch {
        threw = true;
      }

      expect(threw).toBe(true);
      const attemptCheck = await db.get('recallAttempts', 'fail-attempt');
      expect(attemptCheck).toBeUndefined();
    });
  });
});
