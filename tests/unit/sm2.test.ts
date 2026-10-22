import { describe, it, expect } from 'vitest';
import {
  calculateNextSm2State,
  computeNewEf,
  computeLocalStartOfDay,
  isReviewDue,
} from '@/features/spaced-repetition/sm2';
import { type SpacedRepetitionStateRecord } from '@/types/domain';

describe('SM-2 Pure Scheduling Engine (sm2.test.ts)', () => {
  const baseConceptId = 'concept-sm2-test';

  describe('computeNewEf Formula and Clamping', () => {
    it('increases EF for quality grade 5 (+0.10)', () => {
      expect(computeNewEf(2.5, 5)).toBe(2.6);
    });

    it('keeps EF constant for quality grade 4 (0.00)', () => {
      expect(computeNewEf(2.5, 4)).toBe(2.5);
    });

    it('decreases EF for quality grade 3 (-0.14)', () => {
      expect(computeNewEf(2.5, 3)).toBe(2.36);
    });

    it('decreases EF for failing grades (q=2: -0.32, q=1: -0.54, q=0: -0.80)', () => {
      expect(computeNewEf(2.5, 2)).toBe(2.18);
      expect(computeNewEf(2.5, 1)).toBe(1.96);
      expect(computeNewEf(2.5, 0)).toBe(1.7);
    });

    it('strictly clamps EF at the 1.30 floor after repeated low grades', () => {
      let ef = 2.5;
      for (let i = 0; i < 10; i++) {
        ef = computeNewEf(ef, 0);
      }
      expect(ef).toBe(1.3);

      let ef3 = 2.5;
      for (let i = 0; i < 15; i++) {
        ef3 = computeNewEf(ef3, 3);
      }
      expect(ef3).toBe(1.3);
    });
  });

  describe('Sequence Progression (Repetitions 0 -> 1 -> 2 -> 3+)', () => {
    const fixedReviewDate = new Date('2026-10-22T10:00:00.000Z');

    it('schedules Repetition 0 -> 1 with interval 1 day and weak = false for q >= 3', () => {
      const result = calculateNextSm2State({
        conceptId: baseConceptId,
        currentSr: null,
        qualityGrade: 4,
        reviewInstant: fixedReviewDate,
        timeZone: 'UTC',
      });

      expect(result.record.repetitions).toBe(1);
      expect(result.record.intervalDays).toBe(1);
      expect(result.record.easinessFactor).toBe(2.5);
      expect(result.record.weak).toBe(false);
      expect(result.record.nextDueAt).toBe('2026-10-23T00:00:00.000Z');
    });

    it('schedules Repetition 1 -> 2 with interval 6 days for q >= 3', () => {
      const existingSr: SpacedRepetitionStateRecord = {
        id: 'sr-1',
        conceptId: baseConceptId,
        repetitions: 1,
        easinessFactor: 2.5,
        intervalDays: 1,
        lastReviewedAt: '2026-10-21T10:00:00.000Z',
        nextDueAt: '2026-10-22T00:00:00.000Z',
        lastQuality: 4,
        weak: false,
        updatedAt: '2026-10-21T10:00:00.000Z',
      };

      const result = calculateNextSm2State({
        conceptId: baseConceptId,
        currentSr: existingSr,
        qualityGrade: 5,
        reviewInstant: fixedReviewDate,
        timeZone: 'UTC',
      });

      expect(result.record.repetitions).toBe(2);
      expect(result.record.intervalDays).toBe(6);
      expect(result.record.easinessFactor).toBe(2.6); // 2.5 + 0.10
      expect(result.record.weak).toBe(false);
      expect(result.record.nextDueAt).toBe('2026-10-28T00:00:00.000Z');
    });

    it('schedules Repetition 2 -> 3 with round(prevInterval * EF) days', () => {
      const existingSr: SpacedRepetitionStateRecord = {
        id: 'sr-2',
        conceptId: baseConceptId,
        repetitions: 2,
        easinessFactor: 2.6,
        intervalDays: 6,
        lastReviewedAt: '2026-10-16T10:00:00.000Z',
        nextDueAt: '2026-10-22T00:00:00.000Z',
        lastQuality: 5,
        weak: false,
        updatedAt: '2026-10-16T10:00:00.000Z',
      };

      // Quality 4 leaves EF at 2.60; next interval = round(6 * 2.60) = round(15.6) = 16 days
      const result = calculateNextSm2State({
        conceptId: baseConceptId,
        currentSr: existingSr,
        qualityGrade: 4,
        reviewInstant: fixedReviewDate,
        timeZone: 'UTC',
      });

      expect(result.record.repetitions).toBe(3);
      expect(result.record.intervalDays).toBe(16);
      expect(result.record.easinessFactor).toBe(2.6);
      expect(result.record.weak).toBe(false);
      expect(result.record.nextDueAt).toBe('2026-11-07T00:00:00.000Z');
    });
  });

  describe('Failure Handling (q < 3) and Flags', () => {
    const existingSr: SpacedRepetitionStateRecord = {
      id: 'sr-progressed',
      conceptId: baseConceptId,
      repetitions: 4,
      easinessFactor: 2.7,
      intervalDays: 25,
      lastReviewedAt: '2026-09-25T10:00:00.000Z',
      nextDueAt: '2026-10-20T00:00:00.000Z',
      lastQuality: 5,
      weak: false,
      updatedAt: '2026-09-25T10:00:00.000Z',
    };

    it('resets repetitions to 0, interval to 1 day, flags weak=true, and preserves EF by default', () => {
      const result = calculateNextSm2State({
        conceptId: baseConceptId,
        currentSr: existingSr,
        qualityGrade: 2, // Fail
        reviewInstant: '2026-10-22T10:00:00.000Z',
        timeZone: 'UTC',
      });

      expect(result.record.repetitions).toBe(0);
      expect(result.record.intervalDays).toBe(1);
      expect(result.record.weak).toBe(true);
      expect(result.record.easinessFactor).toBe(2.7); // EF preserved per default config
      expect(result.record.lastQuality).toBe(2);
      expect(result.record.nextDueAt).toBe('2026-10-23T00:00:00.000Z');
    });

    it('updates EF on failure when updateEfOnFailure config is set to true', () => {
      const result = calculateNextSm2State({
        conceptId: baseConceptId,
        currentSr: existingSr,
        qualityGrade: 1, // Severe failure
        reviewInstant: '2026-10-22T10:00:00.000Z',
        timeZone: 'UTC',
        config: { updateEfOnFailure: true },
      });

      expect(result.record.repetitions).toBe(0);
      expect(result.record.weak).toBe(true);
      // 2.70 - 0.54 = 2.16
      expect(result.record.easinessFactor).toBe(2.16);
    });
  });

  describe('Local Start-of-Day Due-Date Semantics across Timezones & DST', () => {
    it('computes exact local start-of-day in America/New_York (EDT UTC-4)', () => {
      // 2026-10-22 14:00:00 UTC = 10:00 AM EDT. +1 day = Oct 23 start of day = 2026-10-23T04:00:00.000Z
      const dueInstant = computeLocalStartOfDay(
        new Date('2026-10-22T14:00:00.000Z'),
        1,
        'America/New_York',
      );
      expect(dueInstant).toBe('2026-10-23T04:00:00.000Z');
    });

    it('computes exact local start-of-day in Asia/Tokyo (JST UTC+9)', () => {
      // 2026-10-22 14:00:00 UTC = 11:00 PM JST. +1 day = Oct 23 start of day = 2026-10-22T15:00:00.000Z
      const dueInstant = computeLocalStartOfDay(
        new Date('2026-10-22T14:00:00.000Z'),
        1,
        'Asia/Tokyo',
      );
      expect(dueInstant).toBe('2026-10-22T15:00:00.000Z');
    });

    it('handles Europe/London autumn DST transition (Fall Back on Oct 25, 2026)', () => {
      // Review on Oct 24; +1 day lands on Fall Back Sunday Oct 25
      const dueInstant = computeLocalStartOfDay(
        new Date('2026-10-24T12:00:00.000Z'),
        1,
        'Europe/London',
      );
      // Midnight BST on Oct 25 is 2026-10-24T23:00:00.000Z
      expect(dueInstant).toBe('2026-10-24T23:00:00.000Z');
    });

    it('handles US spring-forward DST transition (March 8, 2026)', () => {
      const dueInstant = computeLocalStartOfDay(
        new Date('2026-03-07T12:00:00.000Z'),
        1,
        'America/New_York',
      );
      expect(dueInstant).toBe('2026-03-08T05:00:00.000Z');
    });
  });

  describe('isReviewDue Comparison', () => {
    it('returns true when current time is at or after nextDueAt', () => {
      expect(isReviewDue('2026-10-22T04:00:00.000Z', '2026-10-22T04:00:00.000Z')).toBe(true);
      expect(isReviewDue('2026-10-22T04:00:00.000Z', '2026-10-22T05:30:00.000Z')).toBe(true);
    });

    it('returns false when current time is before nextDueAt', () => {
      expect(isReviewDue('2026-10-22T04:00:00.000Z', '2026-10-22T03:59:59.000Z')).toBe(false);
    });
  });

  describe('Clock Skew & Backwards Time Handling', () => {
    it('detects backwards clock, anchors review to current date, and avoids negative intervals', () => {
      const srWithFutureTimestamp: SpacedRepetitionStateRecord = {
        id: 'sr-skew',
        conceptId: baseConceptId,
        repetitions: 2,
        easinessFactor: 2.5,
        intervalDays: 6,
        lastReviewedAt: '2026-10-30T10:00:00.000Z', // In the future
        nextDueAt: '2026-11-05T00:00:00.000Z',
        lastQuality: 4,
        weak: false,
        updatedAt: '2026-10-30T10:00:00.000Z',
      };

      // Real clock is now Oct 22
      const result = calculateNextSm2State({
        conceptId: baseConceptId,
        currentSr: srWithFutureTimestamp,
        qualityGrade: 4,
        reviewInstant: '2026-10-22T10:00:00.000Z',
        timeZone: 'UTC',
      });

      expect(result.clockSkewDetected).toBe(true);
      expect(result.clockSkewNote).toBeDefined();
      expect(result.record.intervalDays).toBe(15);
      expect(result.record.nextDueAt).toBe('2026-11-06T00:00:00.000Z');
    });
  });

  describe('Early Review Semantics', () => {
    it('does not pull interval backward when reviewed early with high quality', () => {
      // Concept scheduled for 6 days (due Oct 28) is reviewed 4 days early on Oct 24
      const existingSr: SpacedRepetitionStateRecord = {
        id: 'sr-early',
        conceptId: baseConceptId,
        repetitions: 2,
        easinessFactor: 2.5,
        intervalDays: 6,
        lastReviewedAt: '2026-10-18T10:00:00.000Z',
        nextDueAt: '2026-10-28T00:00:00.000Z',
        lastQuality: 4,
        weak: false,
        updatedAt: '2026-10-18T10:00:00.000Z',
      };

      const result = calculateNextSm2State({
        conceptId: baseConceptId,
        currentSr: existingSr,
        qualityGrade: 4,
        reviewInstant: '2026-10-24T10:00:00.000Z',
        timeZone: 'UTC',
      });

      // Repetition advances to 3, interval expands to round(6 * 2.5) = 15 days
      expect(result.record.repetitions).toBe(3);
      expect(result.record.intervalDays).toBe(15);
      expect(result.record.nextDueAt).toBe('2026-11-08T00:00:00.000Z');
    });
  });
});
