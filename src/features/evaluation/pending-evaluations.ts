/**
 * Pending Evaluations Service
 * Source of truth: PRD FR-10, FR-15, TECH_STACK §8.2
 *
 * Discovers and re-evaluates student answers that were saved locally
 * during offline periods or when Gemini connection was interrupted.
 */

import { openDatabase, DB_NAME } from '@/lib/db/indexeddb';
import {
  type RecallAttemptRecord,
  type RecallQuestionRecord,
  type DocumentChunkRecord,
} from '@/types/domain';
import { HybridAnswerEvaluator } from './evaluator';
import { type AnswerEvaluationOutput } from './types';

export interface PendingEvaluationProgress {
  current: number;
  total: number;
  conceptName: string;
}

export interface PendingEvaluationResult {
  total: number;
  evaluated: number;
  failed: number;
  results: AnswerEvaluationOutput[];
}

/**
 * Lists all recall attempts currently pending evaluation.
 */
export async function getPendingAttempts(dbName = DB_NAME): Promise<RecallAttemptRecord[]> {
  const db = await openDatabase(dbName);
  const attempts = await db.getAll('recallAttempts');
  return attempts.filter((a) => a.pendingEvaluation || a.evaluationMode === 'pending');
}

/**
 * Re-evaluates all pending attempts sequentially using the hybrid evaluator.
 */
export async function evaluateAllPendingAttempts(
  options: {
    dbName?: string;
    onProgress?: (progress: PendingEvaluationProgress) => void;
  } = {},
): Promise<PendingEvaluationResult> {
  const { dbName = DB_NAME, onProgress } = options;
  const pending = await getPendingAttempts(dbName);

  if (pending.length === 0) {
    return { total: 0, evaluated: 0, failed: 0, results: [] };
  }

  const db = await openDatabase(dbName);
  const evaluator = new HybridAnswerEvaluator({ dbName });
  const results: AnswerEvaluationOutput[] = [];
  let evaluated = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i++) {
    const attempt = pending[i];

    try {
      // 1. Fetch related concept
      const concept = await db.get('concepts', attempt.conceptId);
      if (!concept) {
        failed++;
        continue;
      }

      onProgress?.({
        current: i + 1,
        total: pending.length,
        conceptName: concept.title,
      });

      // 2. Fetch related question
      const question = await db.get('recallQuestions', attempt.questionId);
      const fallbackQuestion: RecallQuestionRecord = question ?? {
        id: attempt.questionId,
        conceptId: concept.id,
        prompt: `Explain the core principles and mechanisms of "${concept.title}".`,
        questionType: 'explain_mechanisms',
        difficulty: 3,
        referencePoints: concept.keyTerms ?? [],
        sourceChunkIds: concept.sourceChunkIds ?? [],
        expectedKeyPoints: concept.keyTerms ?? [],
        createdAt: attempt.createdAt,
      };

      // 3. Fetch source chunks
      const allChunks = await db.getAll('documentChunks');
      const chunkIdSet = new Set(concept.sourceChunkIds ?? []);
      const sourceChunks = allChunks.filter((c: DocumentChunkRecord) => chunkIdSet.has(c.id));

      // 4. Run hybrid evaluation
      const output = await evaluator.evaluate({
        sessionId: attempt.sessionId,
        question: fallbackQuestion,
        concept,
        answerText: attempt.answerText,
        confidence: typeof attempt.confidence === 'number' ? (attempt.confidence as 1 | 2 | 3) : 2,
        sourceChunks,
      });

      if (!output.pendingEvaluation) {
        evaluated++;
        results.push(output);
      } else {
        // Still pending (e.g. offline or still unconfigured)
        failed++;
      }
    } catch (err) {
      console.warn(`Failed to re-evaluate attempt ${attempt.id}:`, err);
      failed++;
    }
  }

  return {
    total: pending.length,
    evaluated,
    failed,
    results,
  };
}
