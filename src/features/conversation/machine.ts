/**
 * 13-State Conversation Machine
 * Source of truth: PRD FR-12, FR-14, TECH_STACK §9.2
 *
 * Implements a pure, deterministic state machine with:
 * - 13 explicit states
 * - Explicit typed transition table with guards
 * - Safe error handling (invalid transitions never throw)
 * - Deterministic failure recovery for transient states
 */

import {
  type MachineState,
  type MachineEvent,
  type MachineContext,
  type MachineTransitionResult,
  TRANSIENT_STATES,
} from './types';

/**
 * Returns the safe recovery state for any state if interrupted during an async operation.
 * Transient in-flight states restore to their recovery counterpart; stable states return as-is.
 */
export function resolveRecoveryState(state: MachineState): MachineState {
  switch (state) {
    case 'NOTE_UPLOADING':
    case 'ANALYZING_NOTES':
      return 'IDLE';
    case 'GENERATING_QUESTION':
      return 'WAITING_FOR_RECALL';
    case 'EVALUATING':
      return 'WAITING_FOR_ANSWER';
    default:
      return state;
  }
}

/**
 * Checks whether a given state is transient (in-flight network/async activity).
 */
export function isTransientState(state: MachineState): boolean {
  return (TRANSIENT_STATES as readonly string[]).includes(state);
}

/**
 * Pure transition function.
 * Evaluates the (state, event) pair against guards using the provided context.
 * Returns either ok: true with the next state and effects, or ok: false with an error message.
 */
export function transition(
  currentState: MachineState,
  event: MachineEvent,
  ctx: MachineContext = {},
): MachineTransitionResult {
  // Global event: RESET_SESSION is allowed from any state
  if (event.type === 'RESET_SESSION') {
    return {
      ok: true,
      next: 'IDLE',
      effects: [
        { type: 'PERSIST_SESSION' },
        { type: 'LOG_LEARNING_EVENT', eventType: 'SESSION_RESET' },
      ],
    };
  }

  // Global event: RESUME_SESSION restores persistent or recovered state
  if (event.type === 'RESUME_SESSION') {
    const recovered = resolveRecoveryState(currentState);
    return {
      ok: true,
      next: recovered,
      effects: [
        { type: 'PERSIST_SESSION' },
        {
          type: 'LOG_LEARNING_EVENT',
          eventType: 'SESSION_RESTORED',
          payload: { fromState: currentState, recoveredState: recovered },
        },
        {
          type: 'NOTIFY_USER',
          message:
            currentState !== recovered
              ? `Session restored to ${recovered}. In-flight operation safely rolled back.`
              : `Session restored to ${recovered}.`,
          severity: 'info',
        },
      ],
    };
  }

  switch (currentState) {
    // ------------------------------------------------------------------------
    // 1. IDLE
    // ------------------------------------------------------------------------
    case 'IDLE': {
      if (event.type === 'UPLOAD_START') {
        return {
          ok: true,
          next: 'NOTE_UPLOADING',
          effects: [{ type: 'LOG_LEARNING_EVENT', eventType: 'UPLOAD_STARTED' }],
        };
      }
      if (event.type === 'SELECT_CONCEPT') {
        if (!event.conceptId) {
          return {
            ok: false,
            error: 'Cannot select concept: conceptId is required.',
            currentState,
          };
        }
        if (ctx.isConceptEligible === false) {
          return {
            ok: false,
            error: 'Selected concept is locked: prerequisites have not been met.',
            currentState,
          };
        }
        return {
          ok: true,
          next: 'STUDYING_CONCEPT',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'CONCEPT_SELECTED', payload: { conceptId: event.conceptId } },
          ],
        };
      }
      break;
    }

    // ------------------------------------------------------------------------
    // 2. NOTE_UPLOADING
    // ------------------------------------------------------------------------
    case 'NOTE_UPLOADING': {
      if (event.type === 'UPLOAD_SUCCESS') {
        return {
          ok: true,
          next: 'ANALYZING_NOTES',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'UPLOAD_SUCCEEDED' },
          ],
        };
      }
      if (event.type === 'UPLOAD_FAILURE') {
        return {
          ok: true,
          next: 'IDLE',
          effects: [
            { type: 'LOG_LEARNING_EVENT', eventType: 'UPLOAD_FAILED' },
            { type: 'NOTIFY_USER', message: 'Upload failed. Notes preserved locally.', severity: 'error' },
          ],
        };
      }
      break;
    }

    // ------------------------------------------------------------------------
    // 3. ANALYZING_NOTES
    // ------------------------------------------------------------------------
    case 'ANALYZING_NOTES': {
      if (event.type === 'ANALYSIS_SUCCESS') {
        return {
          ok: true,
          next: 'STUDY_PATH_READY',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'ANALYSIS_SUCCEEDED' },
            { type: 'NOTIFY_USER', message: 'Study path ready.', severity: 'success' },
          ],
        };
      }
      if (event.type === 'ANALYSIS_FAILURE') {
        return {
          ok: true,
          next: 'IDLE',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'ANALYSIS_FAILED' },
            {
              type: 'NOTIFY_USER',
              message: 'Analysis failed. Source document preserved; you can retry.',
              severity: 'error',
            },
          ],
        };
      }
      break;
    }

    // ------------------------------------------------------------------------
    // 4. STUDY_PATH_READY
    // ------------------------------------------------------------------------
    case 'STUDY_PATH_READY': {
      if (event.type === 'SELECT_CONCEPT') {
        if (!event.conceptId) {
          return {
            ok: false,
            error: 'Cannot select concept: conceptId is required.',
            currentState,
          };
        }
        if (ctx.isConceptEligible === false) {
          return {
            ok: false,
            error: 'Selected concept is locked: prerequisites have not been met.',
            currentState,
          };
        }
        return {
          ok: true,
          next: 'STUDYING_CONCEPT',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'CONCEPT_SELECTED', payload: { conceptId: event.conceptId } },
          ],
        };
      }
      break;
    }

    // ------------------------------------------------------------------------
    // 5. STUDYING_CONCEPT
    // ------------------------------------------------------------------------
    case 'STUDYING_CONCEPT': {
      if (event.type === 'READY_FOR_RECALL') {
        return {
          ok: true,
          next: 'WAITING_FOR_RECALL',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'STUDENT_READY_FOR_RECALL' },
          ],
        };
      }
      if (event.type === 'SELECT_CONCEPT') {
        if (!event.conceptId) {
          return {
            ok: false,
            error: 'Cannot select concept: conceptId is required.',
            currentState,
          };
        }
        if (ctx.isConceptEligible === false) {
          return {
            ok: false,
            error: 'Selected concept is locked: prerequisites have not been met.',
            currentState,
          };
        }
        return {
          ok: true,
          next: 'STUDYING_CONCEPT',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'CONCEPT_SWITCHED', payload: { conceptId: event.conceptId } },
          ],
        };
      }
      if (event.type === 'REVIEW_LATER') {
        return {
          ok: true,
          next: 'STUDY_PATH_READY',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'CONCEPT_POSTPONED' },
          ],
        };
      }
      break;
    }

    // ------------------------------------------------------------------------
    // 6. WAITING_FOR_RECALL
    // ------------------------------------------------------------------------
    case 'WAITING_FOR_RECALL': {
      if (event.type === 'REQUEST_QUESTION') {
        return {
          ok: true,
          next: 'GENERATING_QUESTION',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'TRIGGER_QUESTION_GENERATION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'QUESTION_REQUESTED' },
          ],
        };
      }
      if (event.type === 'USE_FALLBACK_QUESTION') {
        return {
          ok: true,
          next: 'WAITING_FOR_ANSWER',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'FALLBACK_QUESTION_USED' },
            {
              type: 'NOTIFY_USER',
              message: 'Using offline fallback question template.',
              severity: 'info',
            },
          ],
        };
      }
      if (event.type === 'SELECT_CONCEPT') {
        if (!event.conceptId) {
          return {
            ok: false,
            error: 'Cannot select concept: conceptId is required.',
            currentState,
          };
        }
        if (ctx.isConceptEligible === false) {
          return {
            ok: false,
            error: 'Selected concept is locked: prerequisites have not been met.',
            currentState,
          };
        }
        return {
          ok: true,
          next: 'STUDYING_CONCEPT',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'CONCEPT_SWITCHED', payload: { conceptId: event.conceptId } },
          ],
        };
      }
      if (event.type === 'REVIEW_LATER') {
        return {
          ok: true,
          next: 'STUDY_PATH_READY',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'RECALL_POSTPONED' },
          ],
        };
      }
      break;
    }

    // ------------------------------------------------------------------------
    // 7. GENERATING_QUESTION
    // ------------------------------------------------------------------------
    case 'GENERATING_QUESTION': {
      if (event.type === 'QUESTION_GENERATED') {
        if (!event.questionId) {
          return {
            ok: false,
            error: 'Cannot transition: questionId is missing.',
            currentState,
          };
        }
        return {
          ok: true,
          next: 'WAITING_FOR_ANSWER',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'QUESTION_DISPLAYED', payload: { questionId: event.questionId } },
          ],
        };
      }
      if (event.type === 'QUESTION_FAILED') {
        return {
          ok: true,
          next: 'WAITING_FOR_RECALL',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'QUESTION_GENERATION_FAILED' },
            {
              type: 'NOTIFY_USER',
              message: 'Question generation failed. You can retry or use a fallback question template.',
              severity: 'warning',
            },
          ],
        };
      }
      if (event.type === 'USE_FALLBACK_QUESTION') {
        return {
          ok: true,
          next: 'WAITING_FOR_ANSWER',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'FALLBACK_QUESTION_USED' },
            {
              type: 'NOTIFY_USER',
              message: 'Using offline fallback question template.',
              severity: 'info',
            },
          ],
        };
      }
      break;
    }

    // ------------------------------------------------------------------------
    // 8. WAITING_FOR_ANSWER
    // ------------------------------------------------------------------------
    case 'WAITING_FOR_ANSWER': {
      if (event.type === 'SUBMIT_ANSWER') {
        const trimmed = event.answerText?.trim();
        if (!trimmed) {
          return {
            ok: false,
            error: 'Cannot submit empty answer: please explain in your own words.',
            currentState,
          };
        }
        if (typeof event.confidence !== 'number' || event.confidence < 1 || event.confidence > 3) {
          return {
            ok: false,
            error: 'Cannot submit answer: please select a confidence level (1-3).',
            currentState,
          };
        }
        return {
          ok: true,
          next: 'EVALUATING',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'TRIGGER_EVALUATION' },
            {
              type: 'LOG_LEARNING_EVENT',
              eventType: 'ANSWER_SUBMITTED',
              payload: { confidence: event.confidence, answerLength: trimmed.length },
            },
          ],
        };
      }
      if (event.type === 'TRY_AGAIN') {
        return {
          ok: true,
          next: 'WAITING_FOR_RECALL',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'QUESTION_REROLLED' },
          ],
        };
      }
      if (event.type === 'REVIEW_LATER') {
        return {
          ok: true,
          next: 'STUDY_PATH_READY',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'ANSWER_POSTPONED' },
          ],
        };
      }
      break;
    }

    // ------------------------------------------------------------------------
    // 9. EVALUATING
    // ------------------------------------------------------------------------
    case 'EVALUATING': {
      if (event.type === 'EVALUATION_SUCCESS') {
        if (
          typeof event.qualityGrade !== 'number' ||
          event.qualityGrade < 0 ||
          event.qualityGrade > 5
        ) {
          return {
            ok: false,
            error: 'Cannot complete evaluation: invalid quality grade (must be 0-5).',
            currentState,
          };
        }
        const nextState = event.qualityGrade < 3 ? 'REVISION_DUE' : 'FEEDBACK';
        return {
          ok: true,
          next: nextState,
          effects: [
            { type: 'PERSIST_SESSION' },
            {
              type: 'LOG_LEARNING_EVENT',
              eventType: 'EVALUATION_COMPLETED',
              payload: { qualityGrade: event.qualityGrade },
            },
            ...(event.qualityGrade < 3
              ? [{ type: 'LOG_LEARNING_EVENT' as const, eventType: 'REVISION_FLAGGED' as const }]
              : []),
          ],
        };
      }
      if (event.type === 'EVALUATION_FAILED') {
        return {
          ok: true,
          next: 'WAITING_FOR_ANSWER',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'EVALUATION_FAILED' },
            {
              type: 'NOTIFY_USER',
              message: 'Evaluation failed. Your answer and confidence rating are preserved.',
              severity: 'error',
            },
          ],
        };
      }
      break;
    }

    // ------------------------------------------------------------------------
    // 10. FEEDBACK
    // ------------------------------------------------------------------------
    case 'FEEDBACK': {
      if (event.type === 'CONTINUE') {
        const grade = ctx.lastQualityGrade ?? 3;
        if (grade < 3) {
          return {
            ok: false,
            error: 'Concept recall requires revision (grade < 3). Please select Revise or Try Again.',
            currentState,
          };
        }
        if (ctx.hasMoreConcepts === false || ctx.allConceptsMastered === true) {
          return {
            ok: true,
            next: 'COMPLETED',
            effects: [
              { type: 'PERSIST_SESSION' },
              { type: 'LOG_LEARNING_EVENT', eventType: 'PATH_COMPLETED' },
              {
                type: 'NOTIFY_USER',
                message: 'Congratulations! All concepts in this study path are completed.',
                severity: 'success',
              },
            ],
          };
        }
        return {
          ok: true,
          next: 'NEXT_CONCEPT',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'PROCEEDED_TO_NEXT_CONCEPT' },
          ],
        };
      }
      if (event.type === 'REVISE') {
        return {
          ok: true,
          next: 'REVISION_DUE',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'REVISION_FLAGGED' },
          ],
        };
      }
      if (event.type === 'TRY_AGAIN') {
        return {
          ok: true,
          next: 'STUDYING_CONCEPT',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'REATTEMPT_REQUESTED' },
          ],
        };
      }
      if (event.type === 'COMPLETE_SESSION') {
        return {
          ok: true,
          next: 'COMPLETED',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'PATH_COMPLETED' },
          ],
        };
      }
      if (event.type === 'REVIEW_LATER') {
        return {
          ok: true,
          next: 'STUDY_PATH_READY',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'FEEDBACK_CLOSED' },
          ],
        };
      }
      if (event.type === 'SELECT_CONCEPT') {
        if (!event.conceptId) {
          return {
            ok: false,
            error: 'Cannot select concept: conceptId is required.',
            currentState,
          };
        }
        if (ctx.isConceptEligible === false) {
          return {
            ok: false,
            error: 'Selected concept is locked: prerequisites have not been met.',
            currentState,
          };
        }
        return {
          ok: true,
          next: 'STUDYING_CONCEPT',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'CONCEPT_SELECTED', payload: { conceptId: event.conceptId } },
          ],
        };
      }
      break;
    }

    // ------------------------------------------------------------------------
    // 11. NEXT_CONCEPT
    // ------------------------------------------------------------------------
    case 'NEXT_CONCEPT': {
      if (event.type === 'SELECT_CONCEPT') {
        if (!event.conceptId) {
          return {
            ok: false,
            error: 'Cannot select concept: conceptId is required.',
            currentState,
          };
        }
        if (ctx.isConceptEligible === false) {
          return {
            ok: false,
            error: 'Selected concept is locked: prerequisites have not been met.',
            currentState,
          };
        }
        return {
          ok: true,
          next: 'STUDYING_CONCEPT',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'CONCEPT_SELECTED', payload: { conceptId: event.conceptId } },
          ],
        };
      }
      if (event.type === 'COMPLETE_SESSION') {
        return {
          ok: true,
          next: 'COMPLETED',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'PATH_COMPLETED' },
          ],
        };
      }
      if (event.type === 'REVIEW_LATER') {
        return {
          ok: true,
          next: 'STUDY_PATH_READY',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'NEXT_CONCEPT_POSTPONED' },
          ],
        };
      }
      break;
    }

    // ------------------------------------------------------------------------
    // 12. REVISION_DUE
    // ------------------------------------------------------------------------
    case 'REVISION_DUE': {
      if (event.type === 'TRY_AGAIN' || event.type === 'REVISE') {
        return {
          ok: true,
          next: 'STUDYING_CONCEPT',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'REVISION_STARTED' },
          ],
        };
      }
      if (event.type === 'SELECT_CONCEPT') {
        if (!event.conceptId) {
          return {
            ok: false,
            error: 'Cannot select concept: conceptId is required.',
            currentState,
          };
        }
        if (ctx.isConceptEligible === false) {
          return {
            ok: false,
            error: 'Selected concept is locked: prerequisites have not been met.',
            currentState,
          };
        }
        return {
          ok: true,
          next: 'STUDYING_CONCEPT',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'CONCEPT_SELECTED', payload: { conceptId: event.conceptId } },
          ],
        };
      }
      if (event.type === 'REVIEW_LATER') {
        return {
          ok: true,
          next: 'STUDY_PATH_READY',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'REVISION_POSTPONED' },
          ],
        };
      }
      break;
    }

    // ------------------------------------------------------------------------
    // 13. COMPLETED
    // ------------------------------------------------------------------------
    case 'COMPLETED': {
      if (event.type === 'SELECT_CONCEPT') {
        return {
          ok: true,
          next: 'STUDYING_CONCEPT',
          effects: [
            { type: 'PERSIST_SESSION' },
            { type: 'LOG_LEARNING_EVENT', eventType: 'CONCEPT_REVISITED', payload: { conceptId: event.conceptId } },
          ],
        };
      }
      if (event.type === 'REVIEW_LATER') {
        return {
          ok: true,
          next: 'STUDY_PATH_READY',
          effects: [{ type: 'PERSIST_SESSION' }],
        };
      }
      break;
    }
  }

  // Fallback: Disallowed transition
  return {
    ok: false,
    error: `Invalid state transition: event '${event.type}' is not permitted from state '${currentState}'.`,
    currentState,
  };
}

/**
 * Convenience helper to query if a transition is valid without applying effects.
 */
export function canTransition(
  currentState: MachineState,
  event: MachineEvent,
  ctx: MachineContext = {},
): boolean {
  return transition(currentState, event, ctx).ok;
}
