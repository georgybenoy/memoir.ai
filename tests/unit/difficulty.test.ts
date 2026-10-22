import { describe, it, expect } from 'vitest';
import {
  calculateAdaptiveDifficulty,
  normalizeAttempts,
  normalizeQuality,
  mapScoreToLevel,
} from '@/features/recall/difficulty';

describe('Adaptive Difficulty Module (difficulty.ts)', () => {
  describe('Term Normalization', () => {
    it('normalizes attempts via log2(n + 1) / log2(8) with bounds [0, 1]', () => {
      expect(normalizeAttempts(0)).toBe(0);
      expect(normalizeAttempts(1)).toBeCloseTo(Math.log2(2) / 3, 4); // 0.3333
      expect(normalizeAttempts(3)).toBeCloseTo(Math.log2(4) / 3, 4); // 0.6667
      expect(normalizeAttempts(7)).toBe(1); // log2(8)/3 = 1
      expect(normalizeAttempts(15)).toBe(1); // Clamped to 1
      expect(normalizeAttempts(-5)).toBe(0); // Clamped to 0
    });

    it('normalizes quality grade (5 - q) / 5 with neutral 0.5 when missing', () => {
      expect(normalizeQuality(5)).toBe(0); // Perfect quality -> 0 difficulty term
      expect(normalizeQuality(4)).toBeCloseTo(0.2, 4);
      expect(normalizeQuality(3)).toBeCloseTo(0.4, 4);
      expect(normalizeQuality(2)).toBeCloseTo(0.6, 4);
      expect(normalizeQuality(1)).toBeCloseTo(0.8, 4);
      expect(normalizeQuality(0)).toBe(1); // Worst quality -> 1.0 difficulty term

      // Neutral default when no previous attempt
      expect(normalizeQuality(null)).toBe(0.5);
      expect(normalizeQuality(undefined)).toBe(0.5);
    });
  });

  describe('Band Mapping', () => {
    it('maps continuous scores in [0, 1] to discrete levels 1-5 correctly', () => {
      expect(mapScoreToLevel(0.0)).toBe(1);
      expect(mapScoreToLevel(0.15)).toBe(1);
      expect(mapScoreToLevel(0.20)).toBe(1); // upper bound of level 1

      expect(mapScoreToLevel(0.21)).toBe(2);
      expect(mapScoreToLevel(0.40)).toBe(2);

      expect(mapScoreToLevel(0.41)).toBe(3);
      expect(mapScoreToLevel(0.60)).toBe(3);

      expect(mapScoreToLevel(0.61)).toBe(4);
      expect(mapScoreToLevel(0.80)).toBe(4);

      expect(mapScoreToLevel(0.81)).toBe(5);
      expect(mapScoreToLevel(1.0)).toBe(5);
    });
  });

  describe('Linear Model & Clamping', () => {
    it('computes exact baseline difficulty when all neutral signals are provided', () => {
      const output = calculateAdaptiveDifficulty({
        downstreamInfluence: 0.5,
        sessionMasteryRate: 0.5,
        previousQualityGrade: null, // neutral 0.5
        attemptCount: 0, // log2(1)/3 = 0
        userPreference: 'intermediate',
      });

      // Expected: 0.35 * 0.5 + 0.25 * 0.5 + 0.25 * 0.5 + 0.15 * 0 = 0.175 + 0.125 + 0.125 + 0 = 0.425
      expect(output.difficultyScore).toBeCloseTo(0.425, 3);
      expect(output.difficultyLevel).toBe(3);
      expect(output.levelName).toBe('Intermediate');
    });

    it('strictly clamps extreme scores to [0, 1]', () => {
      // Minimized signals with beginner preference (-0.15)
      const minOutput = calculateAdaptiveDifficulty({
        downstreamInfluence: 0,
        sessionMasteryRate: 0,
        previousQualityGrade: 5, // (5-5)/5 = 0
        attemptCount: 0,
        userPreference: 'beginner',
      });
      expect(minOutput.difficultyScore).toBe(0);
      expect(minOutput.difficultyLevel).toBe(1);

      // Maximized signals with advanced preference (+0.15)
      const maxOutput = calculateAdaptiveDifficulty({
        downstreamInfluence: 1,
        sessionMasteryRate: 1,
        previousQualityGrade: 0, // (5-0)/5 = 1
        attemptCount: 10,
        userPreference: 'advanced',
      });
      expect(maxOutput.difficultyScore).toBe(1);
      expect(maxOutput.difficultyLevel).toBe(5);
    });
  });

  describe('Single-Step Rise Guard', () => {
    it('limits upward rise to at most +1 above previous attempt level', () => {
      // Inputs that would compute to Level 5 (Mastery)
      const result = calculateAdaptiveDifficulty({
        downstreamInfluence: 1.0,
        sessionMasteryRate: 1.0,
        previousQualityGrade: 0,
        attemptCount: 7,
        userPreference: 'advanced',
        previousLevel: 2, // Student previously tested at Level 2
      });

      // Raw level would be 5, but rise guard limits it to Level 3 (2 + 1)
      expect(result.difficultyLevel).toBe(3);
      expect(result.riseGuarded).toBe(true);
      expect(result.levelName).toBe('Intermediate');
    });

    it('does not restrict downward steps (allows immediate scaffolding)', () => {
      const result = calculateAdaptiveDifficulty({
        downstreamInfluence: 0.0,
        sessionMasteryRate: 0.0,
        previousQualityGrade: 5,
        attemptCount: 0,
        userPreference: 'beginner',
        previousLevel: 4, // Student previously at Level 4
      });

      // Can freely drop to Level 1
      expect(result.difficultyLevel).toBe(1);
      expect(result.riseGuarded).toBe(false);
    });
  });

  describe('User Preference Adjustments', () => {
    it('applies negative offset for beginner preference and positive for advanced', () => {
      const baseInput = {
        downstreamInfluence: 0.5,
        sessionMasteryRate: 0.5,
        previousQualityGrade: 3,
        attemptCount: 2,
      };

      const beg = calculateAdaptiveDifficulty({ ...baseInput, userPreference: 'beginner' });
      const inter = calculateAdaptiveDifficulty({ ...baseInput, userPreference: 'intermediate' });
      const adv = calculateAdaptiveDifficulty({ ...baseInput, userPreference: 'advanced' });

      expect(beg.difficultyScore).toBeLessThan(inter.difficultyScore);
      expect(adv.difficultyScore).toBeGreaterThan(inter.difficultyScore);
      expect(inter.difficultyScore - beg.difficultyScore).toBeCloseTo(0.15, 2);
      expect(adv.difficultyScore - inter.difficultyScore).toBeCloseTo(0.15, 2);
    });
  });
});
