/**
 * Conversation State Machine Types
 * Source of truth: PRD FR-12, FR-14, TECH_STACK §9.2
 */

export type MachineState =
  | 'IDLE'
  | 'NOTE_UPLOADING'
  | 'ANALYZING_NOTES'
  | 'STUDY_PATH_READY'
  | 'STUDYING_CONCEPT'
  | 'WAITING_FOR_RECALL'
  | 'GENERATING_QUESTION'
  | 'WAITING_FOR_ANSWER'
  | 'EVALUATING'
  | 'FEEDBACK'
  | 'NEXT_CONCEPT'
  | 'REVISION_DUE'
  | 'COMPLETED';

export const ALL_MACHINE_STATES: readonly MachineState[] = [
  'IDLE',
  'NOTE_UPLOADING',
  'ANALYZING_NOTES',
  'STUDY_PATH_READY',
  'STUDYING_CONCEPT',
  'WAITING_FOR_RECALL',
  'GENERATING_QUESTION',
  'WAITING_FOR_ANSWER',
  'EVALUATING',
  'FEEDBACK',
  'NEXT_CONCEPT',
  'REVISION_DUE',
  'COMPLETED',
] as const;

/**
 * Transient states are in-flight async operations that must restore
 * to safe, deterministic recovery states if interrupted by reload or crash.
 */
export const TRANSIENT_STATES: readonly MachineState[] = [
  'NOTE_UPLOADING',
  'ANALYZING_NOTES',
  'GENERATING_QUESTION',
  'EVALUATING',
] as const;

export type MachineEventType =
  | 'UPLOAD_START'
  | 'UPLOAD_SUCCESS'
  | 'UPLOAD_FAILURE'
  | 'ANALYSIS_START'
  | 'ANALYSIS_SUCCESS'
  | 'ANALYSIS_FAILURE'
  | 'SELECT_CONCEPT'
  | 'READY_FOR_RECALL'
  | 'REQUEST_QUESTION'
  | 'QUESTION_GENERATED'
  | 'QUESTION_FAILED'
  | 'USE_FALLBACK_QUESTION'
  | 'SUBMIT_ANSWER'
  | 'EVALUATION_SUCCESS'
  | 'EVALUATION_FAILED'
  | 'CONTINUE'
  | 'REVISE'
  | 'TRY_AGAIN'
  | 'REVIEW_LATER'
  | 'COMPLETE_SESSION'
  | 'RESUME_SESSION'
  | 'RESET_SESSION';

export interface BaseMachineEvent {
  type: MachineEventType;
}

export interface SelectConceptEvent extends BaseMachineEvent {
  type: 'SELECT_CONCEPT';
  conceptId: string;
}

export interface QuestionGeneratedEvent extends BaseMachineEvent {
  type: 'QUESTION_GENERATED';
  questionId: string;
}

export interface SubmitAnswerEvent extends BaseMachineEvent {
  type: 'SUBMIT_ANSWER';
  answerText: string;
  confidence: number; // 1, 2, or 3
}

export interface EvaluationSuccessEvent extends BaseMachineEvent {
  type: 'EVALUATION_SUCCESS';
  qualityGrade: number; // 0-5
}

export interface GenericMachineEvent extends BaseMachineEvent {
  type: Exclude<
    MachineEventType,
    'SELECT_CONCEPT' | 'QUESTION_GENERATED' | 'SUBMIT_ANSWER' | 'EVALUATION_SUCCESS'
  >;
  payload?: Record<string, unknown>;
}

export type MachineEvent =
  | SelectConceptEvent
  | QuestionGeneratedEvent
  | SubmitAnswerEvent
  | EvaluationSuccessEvent
  | GenericMachineEvent;

export interface MachineContext {
  currentConceptId?: string;
  isConceptEligible?: boolean;
  questionPresent?: boolean;
  answerText?: string;
  confidenceSelected?: boolean;
  lastQualityGrade?: number;
  hasMoreConcepts?: boolean;
  allConceptsMastered?: boolean;
  isFallbackQuestionAvailable?: boolean;
  networkAvailable?: boolean;
}

export type MachineEffect =
  | { type: 'PERSIST_SESSION' }
  | { type: 'LOG_LEARNING_EVENT'; eventType: string; payload?: Record<string, unknown> }
  | { type: 'TRIGGER_QUESTION_GENERATION' }
  | { type: 'TRIGGER_EVALUATION' }
  | { type: 'NOTIFY_USER'; message: string; severity?: 'info' | 'warning' | 'error' | 'success' };

export type MachineTransitionResult =
  | {
      ok: true;
      next: MachineState;
      effects: MachineEffect[];
    }
  | {
      ok: false;
      error: string;
      currentState: MachineState;
    };
