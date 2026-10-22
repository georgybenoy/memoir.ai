/**
 * Answer Evaluator Implementation & Seams
 * Source of truth: PRD FR-08, FR-09, FR-10, TECH_STACK §8, §10
 *
 * Provides:
 * - HybridAnswerEvaluator (truthful hybrid evaluation combining browser embeddings + Gemini judge)
 * - FakeAnswerEvaluator (deterministic evaluator for tests)
 * - NotImplementedEvaluator (legacy seam)
 */

import { generateId } from '@/lib/utils/id';
import { nowIso } from '@/lib/utils/clock';
import { openDatabase, DB_NAME } from '@/lib/db/indexeddb';
import {
  type RecallAttemptRecord,
  type MasteryStateRecord,
  type SpacedRepetitionStateRecord,
  type ConfidenceLevel,
} from '@/types/domain';
import {
  type AnswerEvaluator,
  type AnswerEvaluationInput,
  type AnswerEvaluationOutput,
} from './types';
import {
  computeJudgeScore,
  computeComposite,
  toQualityGrade,
  cosineToSemanticScore,
} from './scoring';
import { getConfidenceCalibration } from './calibration';
import { saveAttemptAndMasteryAtomic } from '@/features/mastery/mastery-service';
import { fetchEvaluateAnswer } from '@/lib/ai/client';
import { type EvaluateAnswerResponse } from '@/lib/ai/schemas';
import {
  type EmbeddingProvider,
  BrowserEmbeddingProvider,
} from './embeddings';

function mapNumericConfidence(confidence: number): ConfidenceLevel {
  if (confidence === 1) return 'low';
  if (confidence === 3) return 'high';
  return 'medium';
}

/**
 * Truthful Hybrid Answer Evaluator
 * Runs semantic similarity (in-browser Web Worker) and LLM judge (Gemini) concurrently.
 * Handles degraded modes honestly without fabricating missing pillars.
 */
export class HybridAnswerEvaluator implements AnswerEvaluator {
  private embeddingProvider: EmbeddingProvider;
  private dbName: string;

  constructor(options: { embeddingProvider?: EmbeddingProvider; dbName?: string } = {}) {
    this.embeddingProvider = options.embeddingProvider ?? new BrowserEmbeddingProvider();
    this.dbName = options.dbName ?? DB_NAME;
  }

  async evaluate(input: AnswerEvaluationInput): Promise<AnswerEvaluationOutput> {
    const attemptId = generateId();
    const createdAt = nowIso();

    // Construct reference text for semantic embedding comparison
    const keyPointsText = input.question.expectedKeyPoints.join('. ');
    const explanationText = input.concept.canonicalExplanation ?? input.concept.summary;
    const referenceText = `${keyPointsText}. ${explanationText}`.trim();

    // Run semantic similarity and LLM judge concurrently
    const [semanticResult, judgeResult] = await Promise.allSettled([
      this.embeddingProvider.computeCosineSimilarity(input.answerText, referenceText),
      fetchEvaluateAnswer({
        question: {
          id: input.question.id,
          prompt: input.question.prompt,
          questionStyle: input.question.questionStyle,
        },
        expectedKeyPoints: input.question.expectedKeyPoints,
        sourceChunks: input.sourceChunks ?? [],
        studentAnswer: input.answerText,
        confidence: input.confidence,
        concept: {
          id: input.concept.id,
          title: input.concept.title,
          summary: input.concept.summary,
          canonicalExplanation: input.concept.canonicalExplanation,
        },
      }),
    ]);

    // Extract Pillar 1: Semantic Embedding Score
    let semanticScore: number | null = null;
    if (semanticResult.status === 'fulfilled' && typeof semanticResult.value === 'number') {
      semanticScore = cosineToSemanticScore(semanticResult.value);
    }

    // Extract Pillar 2: LLM Judge Rubric
    let rubric: EvaluateAnswerResponse | null = null;
    let judgeScore: number | null = null;
    let judgeError: string | null = null;

    if (judgeResult.status === 'fulfilled') {
      rubric = judgeResult.value;
      judgeScore = computeJudgeScore(rubric);
    } else {
      judgeError =
        judgeResult.reason instanceof Error
          ? judgeResult.reason.message
          : String(judgeResult.reason);
    }

    // Determine Evaluation Mode & Final Grades
    let compositeScore: number | null = null;
    let qualityGrade = 0;
    let evaluationMode: 'hybrid' | 'judge_only' | 'pending';
    let pendingEvaluation = false;

    if (judgeScore !== null && rubric !== null) {
      if (semanticScore !== null) {
        // Mode 1: Full Hybrid Evaluation
        evaluationMode = 'hybrid';
        compositeScore = computeComposite(semanticScore, judgeScore);
        qualityGrade = toQualityGrade(compositeScore);
      } else {
        // Mode 2: Judge-Only Evaluation (Semantic check unavailable)
        evaluationMode = 'judge_only';
        compositeScore = null; // Stays strictly null per PRD FR-08
        qualityGrade = toQualityGrade(judgeScore);
      }
    } else {
      // Mode 3: Pending Evaluation (Gemini judge unavailable / network outage)
      evaluationMode = 'pending';
      pendingEvaluation = true;
      compositeScore = null;
      judgeScore = null;
      qualityGrade = 0; // No mastery or SM-2 change during pending state
    }

    // Compute Metacognitive Confidence Calibration
    const calibration = getConfidenceCalibration(input.confidence, qualityGrade, {
      misconceptions: rubric?.misconceptions.map((m) => m.description),
      strengths: rubric?.strengths,
    });

    // Create the persistent attempt record
    const attemptRecord: RecallAttemptRecord = {
      id: attemptId,
      sessionId: input.sessionId,
      questionId: input.question.id,
      conceptId: input.concept.id,
      answerText: input.answerText,
      confidence: mapNumericConfidence(input.confidence),
      semanticScore,
      judgeScore,
      compositeScore,
      qualityGrade,
      evaluationMode,
      rubric: rubric ? (rubric as unknown as Record<string, unknown>) : undefined,
      pendingEvaluation,
      createdAt,
    };

    let savedSr: SpacedRepetitionStateRecord | null = null;
    if (pendingEvaluation) {
      try {
        const db = await openDatabase(this.dbName);
        await db.put('recallAttempts', attemptRecord);
      } catch (err) {
        console.warn('Failed to persist pending recallAttempt to IndexedDB:', err);
      }
    } else {
      try {
        const db = await openDatabase(this.dbName);
        const currentMastery = (await db.getFromIndex(
          'masteryStates',
          'by-concept',
          input.concept.id,
        )) as MasteryStateRecord | undefined;
        const currentSr = (await db.getFromIndex(
          'spacedRepetitionStates',
          'by-concept',
          input.concept.id,
        )) as SpacedRepetitionStateRecord | undefined;
        const pastAttempts = (await db.getAllFromIndex(
          'recallAttempts',
          'by-concept',
          input.concept.id,
        )) as RecallAttemptRecord[];

        const saveRes = await saveAttemptAndMasteryAtomic({
          attempt: attemptRecord,
          currentMastery: currentMastery ?? null,
          currentSr: currentSr ?? null,
          pastAttempts,
          dbName: this.dbName,
        });
        savedSr = saveRes.spacedRepetition;
      } catch (err) {
        console.error('Failed to commit atomic attempt and mastery update:', err);
      }
    }

    // Build user-facing rationale and explanation
    let rationale = rubric?.rationale ?? '';
    if (evaluationMode === 'judge_only') {
      rationale = `[Judge-only evaluation: semantic check was unavailable] ${rationale}`.trim();
    } else if (evaluationMode === 'pending') {
      rationale =
        judgeError && judgeError.includes('AI_NOT_CONFIGURED')
          ? 'Answer checking is temporarily pending (Gemini API key is not configured on this server). Your answer is saved locally.'
          : 'Answer checking is temporarily pending due to a connection issue. Your answer is safely saved locally; you can retry when reconnected.';
    }

    const nextAction =
      rubric?.suggestedNextAction ??
      (pendingEvaluation
        ? 'You can retry evaluation now or continue and evaluate later.'
        : qualityGrade >= 3
          ? 'Ready to continue to the next concept.'
          : 'Revision recommended before moving forward.');

    return {
      attemptId,
      qualityGrade,
      compositeScore: compositeScore ?? undefined,
      semanticScore: semanticScore ?? undefined,
      judgeScore: judgeScore ?? undefined,
      evaluationMode,
      strengths: rubric?.strengths ?? (pendingEvaluation ? ['Answer saved locally on device.'] : []),
      missingKeyPoints: rubric?.missingKeyPoints ?? [],
      misconceptions: rubric?.misconceptions.map((m) => m.description) ?? [],
      misconceptionDetails: rubric?.misconceptions,
      rationale,
      nextAction,
      pendingEvaluation,
      confidenceFeedback: calibration.message,
      correctionGuidance: rubric?.correctionGuidance,
      nextReviewDue: savedSr?.nextDueAt,
      intervalDays: savedSr?.intervalDays,
    };
  }
}

/**
 * Placeholder evaluator retained as a fallback seam.
 */
export class NotImplementedEvaluator implements AnswerEvaluator {
  constructor(private dbName = DB_NAME) {}

  async evaluate(input: AnswerEvaluationInput): Promise<AnswerEvaluationOutput> {
    const attemptId = generateId();
    const now = nowIso();

    const attemptRecord: RecallAttemptRecord = {
      id: attemptId,
      sessionId: input.sessionId,
      questionId: input.question.id,
      conceptId: input.concept.id,
      answerText: input.answerText,
      confidence: mapNumericConfidence(input.confidence),
      qualityGrade: 3,
      evaluationMode: 'fallback',
      pendingEvaluation: true,
      createdAt: now,
    };

    try {
      const db = await openDatabase(this.dbName);
      await db.put('recallAttempts', attemptRecord);
    } catch (err) {
      console.warn('Failed to persist pending recallAttempt to IndexedDB:', err);
    }

    return {
      attemptId,
      qualityGrade: 3,
      compositeScore: 60,
      evaluationMode: 'fallback',
      strengths: ['Answer safely recorded on this device.'],
      missingKeyPoints: [],
      misconceptions: [],
      rationale:
        'Answer checking arrives in the next update. Your answer and confidence rating are saved locally.',
      nextAction: 'You can continue to explore or try another question.',
      pendingEvaluation: true,
      confidenceFeedback:
        input.confidence === 3
          ? 'High confidence noted.'
          : input.confidence === 1
            ? 'Low confidence noted — keep practicing!'
            : 'Moderate confidence noted.',
    };
  }
}

/**
 * Fake evaluator for unit and integration testing.
 */
export class FakeAnswerEvaluator implements AnswerEvaluator {
  public qualityGrade: number;
  public compositeScore: number;
  public strengths: string[];
  public missingKeyPoints: string[];
  public misconceptions: string[];
  public rationale: string;
  public nextAction: string;

  constructor(
    options: {
      qualityGrade?: number;
      compositeScore?: number;
      strengths?: string[];
      missingKeyPoints?: string[];
      misconceptions?: string[];
      rationale?: string;
      nextAction?: string;
    } = {},
  ) {
    this.qualityGrade = options.qualityGrade ?? 4;
    this.compositeScore = options.compositeScore ?? 75;
    this.strengths = options.strengths ?? ['Clear conceptual definition', 'Accurate vocabulary'];
    this.missingKeyPoints = options.missingKeyPoints ?? [];
    this.misconceptions = options.misconceptions ?? [];
    this.rationale = options.rationale ?? 'Demonstrated good conceptual grasp of core principles.';
    this.nextAction = options.nextAction ?? 'Ready for the next concept.';
  }

  async evaluate(input: AnswerEvaluationInput): Promise<AnswerEvaluationOutput> {
    const attemptId = generateId();
    return {
      attemptId,
      qualityGrade: this.qualityGrade,
      compositeScore: this.compositeScore,
      semanticScore: this.compositeScore,
      judgeScore: this.compositeScore,
      evaluationMode: 'hybrid',
      strengths: this.strengths,
      missingKeyPoints: this.missingKeyPoints,
      misconceptions: this.misconceptions,
      rationale: this.rationale,
      nextAction: this.nextAction,
      pendingEvaluation: false,
      confidenceFeedback:
        input.confidence === 3 && this.qualityGrade >= 4
          ? 'Confidence well calibrated with strong conceptual grasp.'
          : input.confidence === 3 && this.qualityGrade < 3
            ? 'High confidence despite misconceptions; revision recommended.'
            : 'Feedback calibrated to answer accuracy.',
    };
  }
}
