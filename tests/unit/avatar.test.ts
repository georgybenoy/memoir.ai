import { describe, it, expect } from 'vitest';
import {
  mapStateToAvatarExpression,
  AVATAR_EXPRESSION_META,
  type AvatarExpression,
} from '@/components/avatar';

describe('Avatar Expression Mapping Matrix', () => {
  it('maps IDLE state to Idle expression', () => {
    expect(mapStateToAvatarExpression({ machineState: 'IDLE' })).toBe('Idle');
  });

  it('maps STUDY_PATH_READY state to Greeting expression', () => {
    expect(mapStateToAvatarExpression({ machineState: 'STUDY_PATH_READY' })).toBe('Greeting');
  });

  it('maps STUDYING_CONCEPT state to Explaining expression', () => {
    expect(mapStateToAvatarExpression({ machineState: 'STUDYING_CONCEPT' })).toBe('Explaining');
  });

  it('maps WAITING_FOR_ANSWER state to Listening expression', () => {
    expect(mapStateToAvatarExpression({ machineState: 'WAITING_FOR_ANSWER' })).toBe('Listening');
  });

  it('maps GENERATING_QUESTION and EVALUATING states to Thinking expression', () => {
    expect(mapStateToAvatarExpression({ machineState: 'GENERATING_QUESTION' })).toBe('Thinking');
    expect(mapStateToAvatarExpression({ machineState: 'EVALUATING' })).toBe('Thinking');
  });

  it('maps FEEDBACK state strictly by quality grade (0 to 5)', () => {
    // q = 5 -> Celebration
    expect(mapStateToAvatarExpression({ machineState: 'FEEDBACK', qualityGrade: 5 })).toBe(
      'Celebration',
    );

    // q = 4 -> Happy
    expect(mapStateToAvatarExpression({ machineState: 'FEEDBACK', qualityGrade: 4 })).toBe('Happy');

    // q = 3 -> Almost correct
    expect(mapStateToAvatarExpression({ machineState: 'FEEDBACK', qualityGrade: 3 })).toBe(
      'Almost correct',
    );

    // q <= 2 -> Supportive
    expect(mapStateToAvatarExpression({ machineState: 'FEEDBACK', qualityGrade: 2 })).toBe(
      'Supportive',
    );
    expect(mapStateToAvatarExpression({ machineState: 'FEEDBACK', qualityGrade: 1 })).toBe(
      'Supportive',
    );
    expect(mapStateToAvatarExpression({ machineState: 'FEEDBACK', qualityGrade: 0 })).toBe(
      'Supportive',
    );

    // If grade is null or absent on FEEDBACK, defaults to Encouraging
    expect(mapStateToAvatarExpression({ machineState: 'FEEDBACK', qualityGrade: null })).toBe(
      'Encouraging',
    );
  });

  it('maps REVISION_DUE state to Reminder expression', () => {
    expect(mapStateToAvatarExpression({ machineState: 'REVISION_DUE' })).toBe('Reminder');
  });

  it('maps COMPLETED state to Celebration expression', () => {
    expect(mapStateToAvatarExpression({ machineState: 'COMPLETED' })).toBe('Celebration');
  });

  it('maps NOTE_UPLOADING and ANALYZING_NOTES to Thinking expression', () => {
    expect(mapStateToAvatarExpression({ machineState: 'NOTE_UPLOADING' })).toBe('Thinking');
    expect(mapStateToAvatarExpression({ machineState: 'ANALYZING_NOTES' })).toBe('Thinking');
  });

  it('maps WAITING_FOR_RECALL to Encouraging expression', () => {
    expect(mapStateToAvatarExpression({ machineState: 'WAITING_FOR_RECALL' })).toBe('Encouraging');
  });

  it('verifies that all 11 expressions have complete metadata and accessible descriptions', () => {
    const allExpressions: AvatarExpression[] = [
      'Greeting',
      'Idle',
      'Listening',
      'Thinking',
      'Explaining',
      'Encouraging',
      'Happy',
      'Almost correct',
      'Supportive',
      'Celebration',
      'Reminder',
    ];

    expect(allExpressions).toHaveLength(11);

    for (const expr of allExpressions) {
      const meta = AVATAR_EXPRESSION_META[expr];
      expect(meta).toBeDefined();
      expect(meta.expression).toBe(expr);
      expect(typeof meta.label).toBe('string');
      expect(typeof meta.accessibleDescription).toBe('string');
      expect(meta.accessibleDescription.length).toBeGreaterThan(10);
      expect(typeof meta.badgeText).toBe('string');
      expect(meta.badgeText.length).toBeGreaterThan(0);
    }
  });
});
