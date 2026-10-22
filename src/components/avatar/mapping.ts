/**
 * Central State-to-Avatar Expression Mapping Engine
 * Source of truth: PRD FR-13, TECH_STACK §9.2, DESIGN_DOC §5.3.D
 *
 * Explicit mapping from conversation state machine states and recall evaluation
 * results to the 11 teacher avatar expressions.
 *
 * Mapping Table:
 * | Conversation State   | Quality Grade / Condition | Avatar Expression | Rationale                                              |
 * |----------------------|---------------------------|-------------------|--------------------------------------------------------|
 * | IDLE                 | Any                       | Idle              | Calm, attentive baseline                               |
 * | NOTE_UPLOADING       | Any                       | Thinking          | Parsing documents locally                              |
 * | ANALYZING_NOTES      | Any                       | Thinking          | Synthesizing concept graph                             |
 * | STUDY_PATH_READY     | Any                       | Greeting          | Welcomes student to study path                         |
 * | STUDYING_CONCEPT     | Any                       | Explaining        | Active teaching & Socratic dialogue                    |
 * | WAITING_FOR_RECALL   | Any                       | Encouraging       | Prepares student to attempt retrieval                  |
 * | GENERATING_QUESTION  | Any                       | Thinking          | Calibrating grounded question                          |
 * | WAITING_FOR_ANSWER   | Any                       | Listening         | Patiently awaiting student explanation                 |
 * | EVALUATING           | Any                       | Thinking          | Hybrid evaluation in progress                          |
 * | FEEDBACK             | q = 5                     | Celebration       | Flawless conceptual recall                             |
 * | FEEDBACK             | q = 4                     | Happy             | Strong recall with minor terminology variance          |
 * | FEEDBACK             | q = 3                     | Almost correct    | Passing recall with missing non-critical details       |
 * | FEEDBACK             | q <= 2                    | Supportive        | Below threshold, constructive empathy                  |
 * | NEXT_CONCEPT         | Any                       | Encouraging       | Ready for the next topic in path                       |
 * | REVISION_DUE         | q <= 1                    | Supportive        | Misconception detected; gentle scaffolding             |
 * | REVISION_DUE         | q = 2                     | Reminder          | Prerequisite or simplified refresher due               |
 * | COMPLETED            | Any                       | Celebration       | Course or milestone successfully finished              |
 */

import { type AvatarExpression } from './types';
import { type MachineState } from '@/features/conversation/types';

export interface AvatarMappingInput {
  machineState?: MachineState | string | null;
  qualityGrade?: number | null;
  isWeakRevision?: boolean;
}

export function mapStateToAvatarExpression(input: AvatarMappingInput): AvatarExpression {
  const { machineState, qualityGrade, isWeakRevision } = input;

  if (!machineState) {
    return 'Idle';
  }

  switch (machineState) {
    case 'IDLE':
      return 'Idle';

    case 'NOTE_UPLOADING':
    case 'ANALYZING_NOTES':
      return 'Thinking';

    case 'STUDY_PATH_READY':
      return 'Greeting';

    case 'STUDYING_CONCEPT':
      return 'Explaining';

    case 'WAITING_FOR_RECALL':
      return 'Encouraging';

    case 'GENERATING_QUESTION':
      return 'Thinking';

    case 'WAITING_FOR_ANSWER':
      return 'Listening';

    case 'EVALUATING':
      return 'Thinking';

    case 'FEEDBACK': {
      if (qualityGrade === 5) return 'Celebration';
      if (qualityGrade === 4) return 'Happy';
      if (qualityGrade === 3) return 'Almost correct';
      if (typeof qualityGrade === 'number' && qualityGrade <= 2) return 'Supportive';
      return 'Encouraging';
    }

    case 'NEXT_CONCEPT':
      return 'Encouraging';

    case 'REVISION_DUE': {
      if (isWeakRevision || (typeof qualityGrade === 'number' && qualityGrade <= 1)) {
        return 'Supportive';
      }
      return 'Reminder';
    }

    case 'COMPLETED':
      return 'Celebration';

    default:
      return 'Idle';
  }
}
