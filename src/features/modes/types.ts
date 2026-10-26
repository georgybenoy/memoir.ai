/**
 * Mode Integration & Shared Session Controller Types (Phase R4)
 * Source of truth: docs/REFACTOR_RULES.md, docs/REFACTOR_DECISIONS.md, PRD §4
 *
 * Defines the core mode-module contract, session context, progress metrics,
 * and completion summary structures shared across Study, Recall, and Revision modes.
 */

import {
  type ConceptRecord,
  type LearningUnitRecord,
  type ConceptDependencyRecord,
  type DocumentChunkRecord,
  type StudySessionRecord,
  type SessionStatus,
  type EvaluationMode,
} from '@/types/domain';
import { type LearningMode, type WorkflowSelection } from '@/features/workflow/types';

export type { SessionStatus };

/**
 * Context provided to mode modules containing the bounded material bundle,
 * selected learning units, and prerequisite graph edges.
 */
export interface ModeContext {
  materialId: string;
  selection: WorkflowSelection;
  mode: LearningMode;
  sessionId: string;
  concepts: ConceptRecord[];
  units: LearningUnitRecord[];
  dependencies: ConceptDependencyRecord[];
  chunks: DocumentChunkRecord[];
}

/**
 * Real availability and readiness status for a mode given the current selection.
 */
export interface ModeAvailability {
  available: boolean;
  reason?: string;
  dueCount?: number;
  totalConcepts?: number;
  nextDueAt?: string;
}

/**
 * Granular progress for an active session.
 */
export interface ModeProgress {
  total: number;
  completed: number;
  percent: number;
  currentUnitTitle?: string;
  currentConceptTitle?: string;
  stageLabel: string;
}

/**
 * Attempt summary item within a completed session.
 */
export interface SessionAttemptSummary {
  id: string;
  conceptId: string;
  conceptTitle: string;
  score: number | null;
  qualityGrade: number;
  evaluationMode: EvaluationMode;
  strengths: string[];
  missingKeyPoints: string[];
}

/**
 * Scheduled spaced review update item.
 */
export interface ScheduledReviewSummary {
  conceptId: string;
  conceptTitle: string;
  intervalDays: number;
  nextDueAt: string;
  humanDueText: string;
}

/**
 * Recommended next action derived purely from stored session records.
 */
export interface RecommendedNextAction {
  type: 'CONTINUE_UNIT' | 'SWITCH_MODE' | 'REVIEW_WEAK' | 'WORKFLOW_HOME';
  title: string;
  description: string;
  targetUnitId?: string;
  targetMode?: LearningMode;
}

/**
 * Comprehensive session completion summary computed strictly from persisted records.
 * Zero hardcoded or in-memory numbers.
 */
export interface SessionSummary {
  sessionId: string;
  materialId: string;
  mode: LearningMode;
  status: SessionStatus;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  conceptsCovered: Array<{
    id: string;
    title: string;
    tier: number;
    masteryLevel: string;
    masteryPercentage: number;
  }>;
  questionsAnswered: number;
  averageScore: number | null;
  evaluationResults: SessionAttemptSummary[];
  conceptsNeedingPractice: Array<{
    id: string;
    title: string;
    reason: string;
  }>;
  newlyScheduledReviews: ScheduledReviewSummary[];
  recommendedNextAction: RecommendedNextAction;
}

/**
 * Configuration options for the Question Reuse Policy.
 */
export interface QuestionReuseConfig {
  maxRecentCooldown?: number; // How many recent attempts must not have used the question (default 3)
  enforceContentVersion?: boolean; // Must match concept contentVersion (default true)
  allowUnansweredReuse?: boolean; // Can reuse a previously generated question never answered (default true)
}

/**
 * Modular mode interface. Every learning mode implements this contract
 * in its own isolated module.
 */
export interface ModeModule {
  id: LearningMode;
  name: string;
  description: string;
  getAvailability(ctx: ModeContext): Promise<ModeAvailability>;
  getOrderedConcepts(ctx: ModeContext): ConceptRecord[];
  start(ctx: ModeContext): Promise<StudySessionRecord>;
  resume(session: StudySessionRecord, ctx: ModeContext): Promise<StudySessionRecord>;
  getProgress(session: StudySessionRecord, ctx: ModeContext): ModeProgress;
  buildSummary(sessionId: string, materialId: string): Promise<SessionSummary>;
}
