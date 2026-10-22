import { describe, it, expect } from 'vitest';
import {
  normalizeScore,
  computeJudgeScore,
  computeComposite,
  toQualityGrade,
  cosineToSemanticScore,
  type JudgeRubricInput,
} from '@/features/evaluation/scoring';

describe('Scoring Module Pure Functions (scoring.test.ts)', () => {
  describe('normalizeScore', () => {
    it('clamps values within bounds', () => {
      expect(normalizeScore(50)).toBe(50);
      expect(normalizeScore(-10)).toBe(0);
      expect(normalizeScore(150)).toBe(100);
      expect(normalizeScore(75.556)).toBe(75.56);
    });

    it('handles invalid inputs (NaN, null, undefined, Infinity) safely', () => {
      expect(normalizeScore(NaN)).toBe(0);
      expect(normalizeScore(null)).toBe(0);
      expect(normalizeScore(undefined)).toBe(0);
      expect(normalizeScore(Infinity)).toBe(0);
      expect(normalizeScore(-Infinity)).toBe(0);
    });
  });

  describe('computeJudgeScore', () => {
    it('computes weighted rubric correctly for perfect scores', () => {
      const perfect: JudgeRubricInput = {
        correctness: 100,
        completeness: 100,
        reasoning: 100,
        terminology: 100,
        relevance: 100,
      };
      expect(computeJudgeScore(perfect)).toBe(100);
    });

    it('computes weighted rubric correctly with fractional components', () => {
      const rubric: JudgeRubricInput = {
        correctness: 80, // 80 * 0.35 = 28
        completeness: 60, // 60 * 0.25 = 15
        reasoning: 70, // 70 * 0.20 = 14
        terminology: 90, // 90 * 0.10 = 9
        relevance: 100, // 100 * 0.10 = 10
      };
      // Sum = 28 + 15 + 14 + 9 + 10 = 76
      expect(computeJudgeScore(rubric)).toBe(76);
    });

    it('applies misconception penalties and enforces max 25 point cap', () => {
      const rubricWithPenalties: JudgeRubricInput = {
        correctness: 80,
        completeness: 80,
        reasoning: 80,
        terminology: 80,
        relevance: 80, // Subtotal = 80
        misconceptions: [
          { description: 'Wrong location', severity: 'minor', correction: '...' }, // -5
          { description: 'Reversed flow', severity: 'critical', correction: '...' }, // -20
          { description: 'Another issue', severity: 'moderate', correction: '...' }, // -10 (total = 35 -> capped to 25)
        ],
      };
      // 80 - 25 = 55
      expect(computeJudgeScore(rubricWithPenalties)).toBe(55);
    });

    it('never allows judge score to drop below 0', () => {
      const lowRubric: JudgeRubricInput = {
        correctness: 10,
        completeness: 0,
        reasoning: 0,
        terminology: 0,
        relevance: 0,
        misconceptions: [{ description: 'Fatal', severity: 'critical', correction: '...' }],
      };
      expect(computeJudgeScore(lowRubric)).toBe(0);
    });
  });

  describe('computeComposite', () => {
    it('computes 0.40 * sem + 0.60 * judge when both pillars are valid', () => {
      // 0.40 * 80 + 0.60 * 90 = 32 + 54 = 86
      expect(computeComposite(80, 90)).toBe(86);
      // 0.40 * 100 + 0.60 * 100 = 100
      expect(computeComposite(100, 100)).toBe(100);
      // 0.40 * 0 + 0.60 * 0 = 0
      expect(computeComposite(0, 0)).toBe(0);
    });

    it('returns null if semantic score is missing or invalid', () => {
      expect(computeComposite(null, 85)).toBeNull();
      expect(computeComposite(undefined, 85)).toBeNull();
      expect(computeComposite(NaN, 85)).toBeNull();
      expect(computeComposite(-5, 85)).toBeNull();
      expect(computeComposite(105, 85)).toBeNull();
    });

    it('returns null if judge score is missing or invalid', () => {
      expect(computeComposite(85, null)).toBeNull();
      expect(computeComposite(85, undefined)).toBeNull();
      expect(computeComposite(85, NaN)).toBeNull();
      expect(computeComposite(85, -1)).toBeNull();
      expect(computeComposite(85, 110)).toBeNull();
    });
  });

  describe('toQualityGrade (exact boundary tests)', () => {
    it('maps 85+ to q5', () => {
      expect(toQualityGrade(100)).toBe(5);
      expect(toQualityGrade(85.0)).toBe(5);
    });

    it('maps 84.99 and 70 to q4', () => {
      expect(toQualityGrade(84.99)).toBe(4);
      expect(toQualityGrade(70.0)).toBe(4);
    });

    it('maps 69.99 and 55 to q3', () => {
      expect(toQualityGrade(69.99)).toBe(3);
      expect(toQualityGrade(55.0)).toBe(3);
    });

    it('maps 54.99 and 40 to q2', () => {
      expect(toQualityGrade(54.99)).toBe(2);
      expect(toQualityGrade(40.0)).toBe(2);
    });

    it('maps 39.99 and 25 to q1', () => {
      expect(toQualityGrade(39.99)).toBe(1);
      expect(toQualityGrade(25.0)).toBe(1);
    });

    it('maps <25 and negative scores to q0', () => {
      expect(toQualityGrade(24.99)).toBe(0);
      expect(toQualityGrade(10)).toBe(0);
      expect(toQualityGrade(0)).toBe(0);
      expect(toQualityGrade(-10)).toBe(0);
    });

    it('safely handles non-finite or missing scores', () => {
      expect(toQualityGrade(NaN)).toBe(0);
      expect(toQualityGrade(null)).toBe(0);
      expect(toQualityGrade(undefined)).toBe(0);
    });
  });

  describe('cosineToSemanticScore', () => {
    it('maps calibrated cosine boundaries [0.20, 0.85] to [0, 100]', () => {
      expect(cosineToSemanticScore(0.85)).toBe(100);
      expect(cosineToSemanticScore(0.2)).toBe(0);
      // Midpoint: (0.525 - 0.20) / (0.85 - 0.20) = 0.325 / 0.65 = 0.50 -> 50
      expect(cosineToSemanticScore(0.525)).toBe(50);
    });

    it('clamps values below minCosine or above maxCosine', () => {
      expect(cosineToSemanticScore(0.1)).toBe(0);
      expect(cosineToSemanticScore(-0.5)).toBe(0);
      expect(cosineToSemanticScore(0.95)).toBe(100);
      expect(cosineToSemanticScore(1.0)).toBe(100);
    });
  });
});
