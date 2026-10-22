import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  formatHumanDueText,
  buildReviewQueue,
  getDueReviewQueue,
} from '@/features/spaced-repetition/queue';
import { openDatabase, closeDatabase, removeDatabase } from '@/lib/db/indexeddb';
import {
  type ConceptRecord,
  type SpacedRepetitionStateRecord,
} from '@/types/domain';

describe('Due-Review Queue Service (review-queue.test.ts)', () => {
  const TEST_DB = 'test-review-queue-db';

  beforeEach(async () => {
    closeDatabase();
    await removeDatabase(TEST_DB);
  });

  describe('formatHumanDueText', () => {
    it('returns "Due today" when diffDays is 0', () => {
      expect(formatHumanDueText(0)).toBe('Due today');
    });

    it('returns "Due tomorrow" when diffDays is 1 and not weak', () => {
      expect(formatHumanDueText(1, false)).toBe('Due tomorrow');
    });

    it('returns "Overdue by 1 day" when diffDays is -1', () => {
      expect(formatHumanDueText(-1)).toBe('Overdue by 1 day');
    });

    it('returns "Overdue by N days" when diffDays < -1', () => {
      expect(formatHumanDueText(-2)).toBe('Overdue by 2 days');
      expect(formatHumanDueText(-7)).toBe('Overdue by 7 days');
    });

    it('returns "In N days" for positive intervals > 1', () => {
      expect(formatHumanDueText(6)).toBe('In 6 days');
      expect(formatHumanDueText(3)).toBe('In 3 days');
    });

    it('returns "Revision recommended" if flagged weak and not yet due', () => {
      expect(formatHumanDueText(2, true)).toBe('Revision recommended');
    });
  });

  describe('buildReviewQueue Grouping & Deterministic Ordering', () => {
    const fixedNow = new Date('2026-10-22T10:00:00.000Z');

    const makeConcept = (id: string, title: string): ConceptRecord => ({
      id,
      title,
      summary: `${title} summary`,
      canonicalExplanation: `${title} canonical explanation`,
      keyTerms: [title.toLowerCase()],
      sourceChunkIds: [],
      tier: 0,
      status: 'available',
      confidence: 1,
      extractionOrder: 0,
      createdAt: '2026-10-20T00:00:00.000Z',
      updatedAt: '2026-10-20T00:00:00.000Z',
    });

    const concepts = [
      makeConcept('c-weak', 'Weak Concept'),
      makeConcept('c-overdue-1', 'Overdue Concept 1'),
      makeConcept('c-overdue-3', 'Overdue Concept 3'),
      makeConcept('c-today', 'Due Today Concept'),
      makeConcept('c-upcoming', 'Upcoming Concept'),
      makeConcept('c-distant', 'Distant Concept'),
    ];

    const srList: SpacedRepetitionStateRecord[] = [
      {
        id: 'sr-weak',
        conceptId: 'c-weak',
        repetitions: 0,
        easinessFactor: 2.5,
        intervalDays: 1,
        lastReviewedAt: '2026-10-21T10:00:00.000Z',
        nextDueAt: '2026-10-22T00:00:00.000Z',
        lastQuality: 1,
        weak: true,
        updatedAt: '2026-10-21T10:00:00.000Z',
      },
      {
        id: 'sr-overdue-1',
        conceptId: 'c-overdue-1',
        repetitions: 1,
        easinessFactor: 2.5,
        intervalDays: 1,
        lastReviewedAt: '2026-10-20T10:00:00.000Z',
        nextDueAt: '2026-10-21T00:00:00.000Z', // 1 day overdue
        lastQuality: 4,
        weak: false,
        updatedAt: '2026-10-20T10:00:00.000Z',
      },
      {
        id: 'sr-overdue-3',
        conceptId: 'c-overdue-3',
        repetitions: 1,
        easinessFactor: 2.5,
        intervalDays: 1,
        lastReviewedAt: '2026-10-18T10:00:00.000Z',
        nextDueAt: '2026-10-19T00:00:00.000Z', // 3 days overdue
        lastQuality: 4,
        weak: false,
        updatedAt: '2026-10-18T10:00:00.000Z',
      },
      {
        id: 'sr-today',
        conceptId: 'c-today',
        repetitions: 2,
        easinessFactor: 2.5,
        intervalDays: 6,
        lastReviewedAt: '2026-10-16T10:00:00.000Z',
        nextDueAt: '2026-10-22T00:00:00.000Z', // Due today
        lastQuality: 4,
        weak: false,
        updatedAt: '2026-10-16T10:00:00.000Z',
      },
      {
        id: 'sr-upcoming',
        conceptId: 'c-upcoming',
        repetitions: 2,
        easinessFactor: 2.5,
        intervalDays: 6,
        lastReviewedAt: '2026-10-18T10:00:00.000Z',
        nextDueAt: '2026-10-24T00:00:00.000Z', // In 2 days
        lastQuality: 5,
        weak: false,
        updatedAt: '2026-10-18T10:00:00.000Z',
      },
      {
        id: 'sr-distant',
        conceptId: 'c-distant',
        repetitions: 3,
        easinessFactor: 2.5,
        intervalDays: 15,
        lastReviewedAt: '2026-10-20T10:00:00.000Z',
        nextDueAt: '2026-11-04T00:00:00.000Z', // Outside 7-day window
        lastQuality: 5,
        weak: false,
        updatedAt: '2026-10-20T10:00:00.000Z',
      },
    ];

    it('categorizes items accurately into weak, overdue, dueToday, and upcoming', () => {
      const queue = buildReviewQueue({
        concepts,
        srList,
        nowUtc: fixedNow,
        timeZone: 'UTC',
      });

      expect(queue.weak.map((i) => i.concept.id)).toEqual(['c-weak']);
      expect(queue.overdue.map((i) => i.concept.id)).toEqual(['c-overdue-3', 'c-overdue-1']);
      expect(queue.dueToday.map((i) => i.concept.id)).toEqual(['c-today']);
      expect(queue.upcoming.map((i) => i.concept.id)).toEqual(['c-upcoming']);
      // Distant item is not in upcoming (outside 7 days)
      expect(queue.upcoming.some((i) => i.concept.id === 'c-distant')).toBe(false);
    });

    it('orders all actionable items deterministically: weak items first, then most overdue', () => {
      const queue = buildReviewQueue({
        concepts,
        srList,
        nowUtc: fixedNow,
        timeZone: 'UTC',
      });

      // allItemsOrdered should put weak first, then oldest due dates (most overdue)
      expect(queue.allItemsOrdered[0].concept.id).toBe('c-weak');
      expect(queue.allItemsOrdered[1].concept.id).toBe('c-overdue-3');
      expect(queue.allItemsOrdered[2].concept.id).toBe('c-overdue-1');
      expect(queue.allItemsOrdered[3].concept.id).toBe('c-today');

      // totalDueCount includes weak + overdue + dueToday = 1 + 2 + 1 = 4
      expect(queue.totalDueCount).toBe(4);
    });
  });

  describe('Startup Due Detection with fake-indexeddb', () => {
    it('queries and returns queue groups directly from IndexedDB', async () => {
      const db = await openDatabase(TEST_DB);

      const concept: ConceptRecord = {
        id: 'c-db-1',
        title: 'Action Potential',
        summary: 'Depolarization waves',
        canonicalExplanation: 'Depolarization waves across axon',
        keyTerms: ['depolarization', 'axon'],
        sourceChunkIds: [],
        tier: 0,
        status: 'available',
        confidence: 1,
        extractionOrder: 0,
        createdAt: '2026-10-20T00:00:00.000Z',
        updatedAt: '2026-10-20T00:00:00.000Z',
      };

      const sr: SpacedRepetitionStateRecord = {
        id: 'sr-db-1',
        conceptId: 'c-db-1',
        repetitions: 1,
        easinessFactor: 2.5,
        intervalDays: 1,
        lastReviewedAt: '2026-10-20T10:00:00.000Z',
        nextDueAt: '2026-10-21T00:00:00.000Z',
        lastQuality: 4,
        weak: false,
        updatedAt: '2026-10-20T10:00:00.000Z',
      };

      await db.put('concepts', concept);
      await db.put('spacedRepetitionStates', sr);

      const queue = await getDueReviewQueue({
        dbName: TEST_DB,
        nowUtc: '2026-10-22T10:00:00.000Z',
        timeZone: 'UTC',
      });

      expect(queue.totalDueCount).toBe(1);
      expect(queue.overdue.length).toBe(1);
      expect(queue.overdue[0].concept.title).toBe('Action Potential');
      expect(queue.overdue[0].humanDueText).toBe('Overdue by 1 day');
    });
  });
});
