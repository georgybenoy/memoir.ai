import { describe, it, expect } from 'vitest';
import {
  getConfidenceCalibration,
  normalizeConfidenceNumber,
  type CalibrationCategory,
} from '@/features/evaluation/calibration';

describe('Confidence Calibration (calibration.test.ts)', () => {
  describe('normalizeConfidenceNumber', () => {
    it('normalizes string and number values accurately', () => {
      expect(normalizeConfidenceNumber(1)).toBe(1);
      expect(normalizeConfidenceNumber('low')).toBe(1);
      expect(normalizeConfidenceNumber(2)).toBe(2);
      expect(normalizeConfidenceNumber('medium')).toBe(2);
      expect(normalizeConfidenceNumber(3)).toBe(3);
      expect(normalizeConfidenceNumber('high')).toBe(3);
      expect(normalizeConfidenceNumber(null)).toBe(2);
      expect(normalizeConfidenceNumber(undefined)).toBe(2);
    });
  });

  describe('All 18 Confidence x Quality Grade Combinations', () => {
    const grades = [0, 1, 2, 3, 4, 5] as const;
    const confidences = [1, 2, 3] as const;

    const expectedCategories: Record<number, Record<number, CalibrationCategory>> = {
      // Confidence 1 (Low)
      1: {
        0: 'cautious_aligned',
        1: 'cautious_aligned',
        2: 'cautious_aligned',
        3: 'cautious_aligned',
        4: 'underconfident',
        5: 'underconfident',
      },
      // Confidence 2 (Medium)
      2: {
        0: 'moderate_balanced',
        1: 'moderate_balanced',
        2: 'moderate_balanced',
        3: 'moderate_balanced',
        4: 'moderate_balanced',
        5: 'moderate_balanced',
      },
      // Confidence 3 (High)
      3: {
        0: 'overconfident',
        1: 'overconfident',
        2: 'overconfident',
        3: 'calibrated_passing',
        4: 'calibrated_mastery',
        5: 'calibrated_mastery',
      },
    };

    for (const conf of confidences) {
      for (const q of grades) {
        it(`evaluates confidence=${conf} with q=${q} -> ${expectedCategories[conf][q]}`, () => {
          const res = getConfidenceCalibration(conf, q);
          expect(res.category).toBe(expectedCategories[conf][q]);
          expect(res.message.length).toBeGreaterThan(15);
          expect(res.suggestedAction.length).toBeGreaterThan(10);
          expect(['growth', 'reinforcing', 'supportive']).toContain(res.tone);
        });
      }
    }
  });

  describe('Non-shaming and personalized guidance', () => {
    it('gently names specific misconception when overconfident', () => {
      const res = getConfidenceCalibration(3, 1, {
        misconceptions: ['Protons pump outward rather than into matrix'],
      });
      expect(res.category).toBe('overconfident');
      expect(res.message).toContain('Protons pump outward rather than into matrix');
      expect(res.tone).toBe('growth');
      expect(res.message).not.toMatch(/foolish|wrong|bad|fail|careless/i);
    });

    it('reinforces confidence using specific evidence from answer when underconfident', () => {
      const res = getConfidenceCalibration(1, 5, {
        strengths: ['Accurate identification of ATP synthase rotational motor'],
      });
      expect(res.category).toBe('underconfident');
      expect(res.message).toContain('Accurate identification of ATP synthase rotational motor');
      expect(res.tone).toBe('reinforcing');
      expect(res.message).toMatch(/spot on|trust your/i);
    });
  });
});
