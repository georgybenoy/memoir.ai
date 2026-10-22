import { describe, it, expect } from 'vitest';
import {
  transition,
  canTransition,
  resolveRecoveryState,
  isTransientState,
} from '@/features/conversation/machine';
import {
  ALL_MACHINE_STATES,
  TRANSIENT_STATES,
  type MachineState,
  type MachineEvent,
} from '@/features/conversation/types';

describe('13-State Conversation Machine (machine.ts)', () => {
  describe('State Categorization & Recovery Mapping', () => {
    it('defines exactly the 13 states from PRD FR-12', () => {
      expect(ALL_MACHINE_STATES).toHaveLength(13);
      expect(ALL_MACHINE_STATES).toEqual([
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
      ]);
    });

    it('identifies the 4 transient states correctly', () => {
      expect(TRANSIENT_STATES).toEqual([
        'NOTE_UPLOADING',
        'ANALYZING_NOTES',
        'GENERATING_QUESTION',
        'EVALUATING',
      ]);
      expect(isTransientState('NOTE_UPLOADING')).toBe(true);
      expect(isTransientState('ANALYZING_NOTES')).toBe(true);
      expect(isTransientState('GENERATING_QUESTION')).toBe(true);
      expect(isTransientState('EVALUATING')).toBe(true);
      expect(isTransientState('STUDYING_CONCEPT')).toBe(false);
      expect(isTransientState('WAITING_FOR_ANSWER')).toBe(false);
    });

    it('resolves transient in-flight states to deterministic recovery states', () => {
      expect(resolveRecoveryState('NOTE_UPLOADING')).toBe('IDLE');
      expect(resolveRecoveryState('ANALYZING_NOTES')).toBe('IDLE');
      expect(resolveRecoveryState('GENERATING_QUESTION')).toBe('WAITING_FOR_RECALL');
      expect(resolveRecoveryState('EVALUATING')).toBe('WAITING_FOR_ANSWER');

      // Stable states resolve to themselves
      expect(resolveRecoveryState('IDLE')).toBe('IDLE');
      expect(resolveRecoveryState('STUDY_PATH_READY')).toBe('STUDY_PATH_READY');
      expect(resolveRecoveryState('STUDYING_CONCEPT')).toBe('STUDYING_CONCEPT');
      expect(resolveRecoveryState('WAITING_FOR_RECALL')).toBe('WAITING_FOR_RECALL');
      expect(resolveRecoveryState('WAITING_FOR_ANSWER')).toBe('WAITING_FOR_ANSWER');
      expect(resolveRecoveryState('FEEDBACK')).toBe('FEEDBACK');
      expect(resolveRecoveryState('NEXT_CONCEPT')).toBe('NEXT_CONCEPT');
      expect(resolveRecoveryState('REVISION_DUE')).toBe('REVISION_DUE');
      expect(resolveRecoveryState('COMPLETED')).toBe('COMPLETED');
    });
  });

  describe('Happy-Path State Transitions', () => {
    it('executes the full standard study lifecycle from IDLE to COMPLETED', () => {
      // 1. IDLE -> NOTE_UPLOADING
      const r1 = transition('IDLE', { type: 'UPLOAD_START' });
      expect(r1.ok).toBe(true);
      if (r1.ok) expect(r1.next).toBe('NOTE_UPLOADING');

      // 2. NOTE_UPLOADING -> ANALYZING_NOTES
      const r2 = transition('NOTE_UPLOADING', { type: 'UPLOAD_SUCCESS' });
      expect(r2.ok).toBe(true);
      if (r2.ok) expect(r2.next).toBe('ANALYZING_NOTES');

      // 3. ANALYZING_NOTES -> STUDY_PATH_READY
      const r3 = transition('ANALYZING_NOTES', { type: 'ANALYSIS_SUCCESS' });
      expect(r3.ok).toBe(true);
      if (r3.ok) expect(r3.next).toBe('STUDY_PATH_READY');

      // 4. STUDY_PATH_READY -> STUDYING_CONCEPT
      const r4 = transition(
        'STUDY_PATH_READY',
        { type: 'SELECT_CONCEPT', conceptId: 'c1' },
        { isConceptEligible: true },
      );
      expect(r4.ok).toBe(true);
      if (r4.ok) expect(r4.next).toBe('STUDYING_CONCEPT');

      // 5. STUDYING_CONCEPT -> WAITING_FOR_RECALL
      const r5 = transition('STUDYING_CONCEPT', { type: 'READY_FOR_RECALL' });
      expect(r5.ok).toBe(true);
      if (r5.ok) expect(r5.next).toBe('WAITING_FOR_RECALL');

      // 6. WAITING_FOR_RECALL -> GENERATING_QUESTION
      const r6 = transition('WAITING_FOR_RECALL', { type: 'REQUEST_QUESTION' });
      expect(r6.ok).toBe(true);
      if (r6.ok) {
        expect(r6.next).toBe('GENERATING_QUESTION');
        expect(r6.effects.some((e) => e.type === 'TRIGGER_QUESTION_GENERATION')).toBe(true);
      }

      // 7. GENERATING_QUESTION -> WAITING_FOR_ANSWER
      const r7 = transition('GENERATING_QUESTION', {
        type: 'QUESTION_GENERATED',
        questionId: 'q-123',
      });
      expect(r7.ok).toBe(true);
      if (r7.ok) expect(r7.next).toBe('WAITING_FOR_ANSWER');

      // 8. WAITING_FOR_ANSWER -> EVALUATING
      const r8 = transition('WAITING_FOR_ANSWER', {
        type: 'SUBMIT_ANSWER',
        answerText: 'Variables hold values in memory.',
        confidence: 3,
      });
      expect(r8.ok).toBe(true);
      if (r8.ok) {
        expect(r8.next).toBe('EVALUATING');
        expect(r8.effects.some((e) => e.type === 'TRIGGER_EVALUATION')).toBe(true);
      }

      // 9. EVALUATING -> FEEDBACK
      const r9 = transition('EVALUATING', {
        type: 'EVALUATION_SUCCESS',
        qualityGrade: 4,
      });
      expect(r9.ok).toBe(true);
      if (r9.ok) expect(r9.next).toBe('FEEDBACK');

      // 10. FEEDBACK -> NEXT_CONCEPT (hasMoreConcepts = true)
      const r10 = transition(
        'FEEDBACK',
        { type: 'CONTINUE' },
        { lastQualityGrade: 4, hasMoreConcepts: true },
      );
      expect(r10.ok).toBe(true);
      if (r10.ok) expect(r10.next).toBe('NEXT_CONCEPT');

      // 11. FEEDBACK -> COMPLETED (hasMoreConcepts = false)
      const r11 = transition(
        'FEEDBACK',
        { type: 'CONTINUE' },
        { lastQualityGrade: 4, hasMoreConcepts: false },
      );
      expect(r11.ok).toBe(true);
      if (r11.ok) expect(r11.next).toBe('COMPLETED');
    });

    it('transitions EVALUATING -> REVISION_DUE on weak quality grades (q < 3)', () => {
      const weakRes = transition('EVALUATING', {
        type: 'EVALUATION_SUCCESS',
        qualityGrade: 2,
      });
      expect(weakRes.ok).toBe(true);
      if (weakRes.ok) {
        expect(weakRes.next).toBe('REVISION_DUE');
        expect(weakRes.effects.some((e) => e.type === 'LOG_LEARNING_EVENT' && e.eventType === 'REVISION_FLAGGED')).toBe(true);
      }

      // From REVISION_DUE, REVISE returns to STUDYING_CONCEPT
      const reviseRes = transition('REVISION_DUE', { type: 'REVISE' });
      expect(reviseRes.ok).toBe(true);
      if (reviseRes.ok) {
        expect(reviseRes.next).toBe('STUDYING_CONCEPT');
        expect(reviseRes.effects.some((e) => e.type === 'LOG_LEARNING_EVENT' && e.eventType === 'REVISION_STARTED')).toBe(true);
      }
    });

    it('supports switching concepts from STUDY_PATH_READY or FEEDBACK', () => {
      const res = transition(
        'STUDY_PATH_READY',
        { type: 'SELECT_CONCEPT', conceptId: 'c2' },
        { isConceptEligible: true },
      );
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.next).toBe('STUDYING_CONCEPT');
    });

    it('supports direct topic selection from IDLE', () => {
      const res = transition(
        'IDLE',
        { type: 'SELECT_CONCEPT', conceptId: 'topic-concept-1' },
        { isConceptEligible: true },
      );
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.next).toBe('STUDYING_CONCEPT');
    });
  });

  describe('Guards & Validation Checks', () => {
    it('blocks SELECT_CONCEPT if concept is locked', () => {
      const res = transition(
        'STUDY_PATH_READY',
        { type: 'SELECT_CONCEPT', conceptId: 'locked-c' },
        { isConceptEligible: false },
      );
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toMatch(/locked/i);
        expect(res.currentState).toBe('STUDY_PATH_READY');
      }
    });

    it('blocks SUBMIT_ANSWER if answerText is empty or whitespace', () => {
      const emptyRes = transition('WAITING_FOR_ANSWER', {
        type: 'SUBMIT_ANSWER',
        answerText: '   ',
        confidence: 2,
      });
      expect(emptyRes.ok).toBe(false);
      if (!emptyRes.ok) {
        expect(emptyRes.error).toMatch(/empty answer/i);
      }
    });

    it('blocks SUBMIT_ANSWER if confidence level is missing or out of bounds', () => {
      const noConfRes = transition('WAITING_FOR_ANSWER', {
        type: 'SUBMIT_ANSWER',
        answerText: 'A good answer.',
        confidence: 0 as unknown as number,
      });
      expect(noConfRes.ok).toBe(false);
      if (!noConfRes.ok) {
        expect(noConfRes.error).toMatch(/confidence/i);
      }
    });

    it('blocks CONTINUE from FEEDBACK if qualityGrade < 3', () => {
      const failRes = transition(
        'FEEDBACK',
        { type: 'CONTINUE' },
        { lastQualityGrade: 2 },
      );
      expect(failRes.ok).toBe(false);
      if (!failRes.ok) {
        expect(failRes.error).toMatch(/revision/i);
      }
    });

    it('blocks QUESTION_GENERATED if questionId is missing', () => {
      const res = transition('GENERATING_QUESTION', {
        type: 'QUESTION_GENERATED',
        questionId: '',
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toMatch(/questionId/i);
      }
    });
  });

  describe('Failure Recovery Paths', () => {
    it('recovers from UPLOAD_FAILURE back to IDLE', () => {
      const res = transition('NOTE_UPLOADING', { type: 'UPLOAD_FAILURE' });
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.next).toBe('IDLE');
    });

    it('recovers from ANALYSIS_FAILURE back to IDLE while preserving document', () => {
      const res = transition('ANALYZING_NOTES', { type: 'ANALYSIS_FAILURE' });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.next).toBe('IDLE');
        expect(res.effects.some((e) => e.type === 'NOTIFY_USER')).toBe(true);
      }
    });

    it('recovers from QUESTION_FAILED back to WAITING_FOR_RECALL with retry available', () => {
      const res = transition('GENERATING_QUESTION', { type: 'QUESTION_FAILED' });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.next).toBe('WAITING_FOR_RECALL');
        expect(res.effects.some((e) => e.type === 'NOTIFY_USER')).toBe(true);
      }
    });

    it('recovers from EVALUATION_FAILED back to WAITING_FOR_ANSWER preserving draft', () => {
      const res = transition('EVALUATING', { type: 'EVALUATION_FAILED' });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.next).toBe('WAITING_FOR_ANSWER');
        expect(res.effects.some((e) => e.type === 'NOTIFY_USER')).toBe(true);
      }
    });

    it('supports immediate USE_FALLBACK_QUESTION from WAITING_FOR_RECALL or GENERATING_QUESTION', () => {
      const r1 = transition('WAITING_FOR_RECALL', { type: 'USE_FALLBACK_QUESTION' });
      expect(r1.ok).toBe(true);
      if (r1.ok) expect(r1.next).toBe('WAITING_FOR_ANSWER');

      const r2 = transition('GENERATING_QUESTION', { type: 'USE_FALLBACK_QUESTION' });
      expect(r2.ok).toBe(true);
      if (r2.ok) expect(r2.next).toBe('WAITING_FOR_ANSWER');
    });

    it('supports global RESUME_SESSION from transient states to safe recovery states', () => {
      const r1 = transition('EVALUATING', { type: 'RESUME_SESSION' });
      expect(r1.ok).toBe(true);
      if (r1.ok) expect(r1.next).toBe('WAITING_FOR_ANSWER');

      const r2 = transition('GENERATING_QUESTION', { type: 'RESUME_SESSION' });
      expect(r2.ok).toBe(true);
      if (r2.ok) expect(r2.next).toBe('WAITING_FOR_RECALL');
    });

    it('supports global RESET_SESSION from any state back to IDLE', () => {
      for (const st of ALL_MACHINE_STATES) {
        const res = transition(st, { type: 'RESET_SESSION' });
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.next).toBe('IDLE');
      }
    });
  });

  describe('Exhaustive Disallowed Transitions', () => {
    it('safely rejects invalid events without throwing or mutating state', () => {
      const invalidPairs: Array<[MachineState, MachineEvent]> = [
        ['IDLE', { type: 'READY_FOR_RECALL' }],
        ['IDLE', { type: 'SUBMIT_ANSWER', answerText: 'test', confidence: 2 }],
        ['STUDYING_CONCEPT', { type: 'UPLOAD_SUCCESS' }],
        ['WAITING_FOR_ANSWER', { type: 'CONTINUE' }],
        ['EVALUATING', { type: 'REQUEST_QUESTION' }],
        ['COMPLETED', { type: 'UPLOAD_SUCCESS' }],
      ];

      for (const [st, ev] of invalidPairs) {
        const res = transition(st, ev);
        expect(res.ok).toBe(false);
        if (!res.ok) {
          expect(res.currentState).toBe(st);
          expect(res.error).toBeDefined();
        }
        expect(canTransition(st, ev)).toBe(false);
      }
    });
  });

  describe('Revision & Review Later Branching', () => {
    it('transitions to REVISION_DUE on REVISE event after weak recall', () => {
      const res = transition('FEEDBACK', { type: 'REVISE' });
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.next).toBe('REVISION_DUE');
    });

    it('allows re-trying concept explanation or question from REVISION_DUE', () => {
      const res = transition('REVISION_DUE', { type: 'TRY_AGAIN' });
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.next).toBe('STUDYING_CONCEPT');
    });

    it('allows REVIEW_LATER from multiple states to return to STUDY_PATH_READY', () => {
      const allowedStates: MachineState[] = [
        'STUDYING_CONCEPT',
        'WAITING_FOR_RECALL',
        'WAITING_FOR_ANSWER',
        'FEEDBACK',
        'NEXT_CONCEPT',
        'REVISION_DUE',
      ];

      for (const st of allowedStates) {
        const res = transition(st, { type: 'REVIEW_LATER' });
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.next).toBe('STUDY_PATH_READY');
      }
    });
  });
});
