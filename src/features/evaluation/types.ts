/**
 * Evaluator Seam Types
 * Source of truth: PRD FR-08, FR-09, TECH_STACK §10
 */

import {
  type ConceptRecord,
  type DocumentChunkRecord,
  type RecallQuestionRecord,
  type EvaluationMode,
} from '@/types/domain';

export interface AnswerEvaluationInput {
  sessionId: string;
  question: RecallQuestionRecord;
  concept: ConceptRecord;
  answerText: string;
  confidence: number; // 1, 2, or 3
  sourceChunks?: DocumentChunkRecord[];
}

export interface AnswerEvaluationOutput {
  attemptId: string;
  qualityGrade: number; // 0-5 for SM-2
  compositeScore?: number; // 0-100
  semanticScore?: number; // 0-100
  judgeScore?: number; // 0-100
  evaluationMode: EvaluationMode;
  strengths: string[];
  missingKeyPoints: string[];
  misconceptions: string[];
  rationale: string;
  nextAction: string;
  pendingEvaluation: boolean;
  confidenceFeedback?: string;
  correctionGuidance?: string;
  misconceptionDetails?: Array<{
    description: string;
    severity: 'minor' | 'moderate' | 'critical';
    correction: string;
  }>;
  nextReviewDue?: string;
  intervalDays?: number;
}

export interface AnswerEvaluator {
  evaluate(input: AnswerEvaluationInput): Promise<AnswerEvaluationOutput>;
}
