import { describe, it, expect, beforeEach } from 'vitest';
import { ALLOWED_MODELS, isModelAllowed, getDefaultModel } from '@/lib/config/models';
import { calculateAdaptiveDifficulty } from '@/features/recall/difficulty';
import { WorkspaceMemoryRepository } from '@/lib/db/repositories/memory-repositories';

describe('Settings, Model Allowlist & Difficulty Preference', () => {
  describe('Model Allowlist Handling', () => {
    it('contains valid allowed Gemini models', () => {
      expect(ALLOWED_MODELS).toContain('gemini-2.5-flash');
      expect(ALLOWED_MODELS).toContain('gemini-2.0-flash');
      expect(ALLOWED_MODELS).toContain('gemini-1.5-pro');
      expect(ALLOWED_MODELS.length).toBeGreaterThanOrEqual(3);
    });

    it('correctly validates model IDs against the allowlist', () => {
      expect(isModelAllowed('gemini-2.5-flash')).toBe(true);
      expect(isModelAllowed('gemini-2.0-flash')).toBe(true);
      expect(isModelAllowed('gemini-1.5-flash')).toBe(true);
      expect(isModelAllowed('gemini-1.5-pro')).toBe(true);

      // Disallowed or arbitrary strings must be rejected
      expect(isModelAllowed('gpt-4o')).toBe(false);
      expect(isModelAllowed('claude-3-5-sonnet')).toBe(false);
      expect(isModelAllowed('gemini-ultra-fake')).toBe(false);
      expect(isModelAllowed('')).toBe(false);
    });

    it('falls back to default model gemini-2.5-flash if env is absent or invalid', () => {
      const originalEnv = process.env.GEMINI_MODEL;
      try {
        delete process.env.GEMINI_MODEL;
        expect(getDefaultModel()).toBe('gemini-2.5-flash');

        process.env.GEMINI_MODEL = 'gemini-1.5-pro';
        expect(getDefaultModel()).toBe('gemini-1.5-pro');

        process.env.GEMINI_MODEL = 'invalid-model-name';
        expect(getDefaultModel()).toBe('gemini-2.5-flash');
      } finally {
        process.env.GEMINI_MODEL = originalEnv;
      }
    });
  });

  describe('Difficulty Preference Effect', () => {
    it('applies modifier offsets based on user preference', () => {
      // Base neutral calculation (all signals 0.5)
      const intermediateResult = calculateAdaptiveDifficulty({
        downstreamInfluence: 0.5,
        sessionMasteryRate: 0.5,
        previousQualityGrade: 2.5,
        attemptCount: 0,
        userPreference: 'intermediate', // Balanced (modifier = 0)
      });

      const beginnerResult = calculateAdaptiveDifficulty({
        downstreamInfluence: 0.5,
        sessionMasteryRate: 0.5,
        previousQualityGrade: 2.5,
        attemptCount: 0,
        userPreference: 'beginner', // Easier (modifier = -0.15)
      });

      const advancedResult = calculateAdaptiveDifficulty({
        downstreamInfluence: 0.5,
        sessionMasteryRate: 0.5,
        previousQualityGrade: 2.5,
        attemptCount: 0,
        userPreference: 'advanced', // Harder (modifier = +0.15)
      });

      expect(beginnerResult.breakdown.preferenceOffset).toBe(-0.15);
      expect(intermediateResult.breakdown.preferenceOffset).toBe(0);
      expect(advancedResult.breakdown.preferenceOffset).toBe(0.15);

      // Raw difficulty must reflect the modifier ordering: beginner < intermediate < advanced
      expect(beginnerResult.breakdown.rawScore).toBeLessThan(
        intermediateResult.breakdown.rawScore,
      );
      expect(intermediateResult.breakdown.rawScore).toBeLessThan(
        advancedResult.breakdown.rawScore,
      );
    });
  });

  describe('Workspace Preferences Persistence', () => {
    let repo: WorkspaceMemoryRepository;

    beforeEach(() => {
      repo = new WorkspaceMemoryRepository();
    });

    it('initializes default preferences and updates them reliably', async () => {
      const initialWs = await repo.getOrCreateDefault();
      expect(initialWs.preferences.difficulty).toBe('intermediate');
      expect(initialWs.preferences.reducedMotion).toBe(false);

      // Update difficulty
      const updatedDiff = await repo.updatePreferences({ difficulty: 'beginner' });
      expect(updatedDiff.preferences.difficulty).toBe('beginner');

      // Update model
      const updatedModel = await repo.updatePreferences({ model: 'gemini-2.0-flash' });
      expect(updatedModel.preferences.model).toBe('gemini-2.0-flash');
      expect(updatedModel.preferences.difficulty).toBe('beginner'); // preserved

      // Update reduced motion
      const updatedMotion = await repo.updatePreferences({ reducedMotion: true });
      expect(updatedMotion.preferences.reducedMotion).toBe(true);

      // Re-fetching from repository confirms durability
      const fetched = await repo.getOrCreateDefault();
      expect(fetched.preferences.difficulty).toBe('beginner');
      expect(fetched.preferences.model).toBe('gemini-2.0-flash');
      expect(fetched.preferences.reducedMotion).toBe(true);
    });
  });
});
