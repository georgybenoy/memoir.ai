/**
 * Teacher Avatar Expressions & Types
 * Source of truth: PRD FR-13, DESIGN_DOC §5.3.D, AGENTS.md (Honesty Rules)
 *
 * All 11 expressions required by PRD FR-13:
 * 1. Greeting
 * 2. Idle
 * 3. Listening
 * 4. Thinking
 * 5. Explaining
 * 6. Encouraging
 * 7. Happy
 * 8. Almost correct
 * 9. Supportive
 * 10. Celebration
 * 11. Reminder
 */

export type AvatarExpression =
  | 'Greeting'
  | 'Idle'
  | 'Listening'
  | 'Thinking'
  | 'Explaining'
  | 'Encouraging'
  | 'Happy'
  | 'Almost correct'
  | 'Supportive'
  | 'Celebration'
  | 'Reminder';

export interface AvatarExpressionMeta {
  expression: AvatarExpression;
  label: string;
  accessibleDescription: string;
  badgeText: string;
}

export const AVATAR_EXPRESSION_META: Record<AvatarExpression, AvatarExpressionMeta> = {
  Greeting: {
    expression: 'Greeting',
    label: 'Greeting',
    accessibleDescription: 'Illustrated tutor avatar waving warmly with a welcoming smile.',
    badgeText: 'Welcome!',
  },
  Idle: {
    expression: 'Idle',
    label: 'At Rest',
    accessibleDescription: 'Illustrated tutor avatar at calm attention, ready to assist.',
    badgeText: 'Ready',
  },
  Listening: {
    expression: 'Listening',
    label: 'Listening',
    accessibleDescription: 'Illustrated tutor avatar attentively leaning in with open eyes while you answer.',
    badgeText: 'Listening…',
  },
  Thinking: {
    expression: 'Thinking',
    label: 'Thinking',
    accessibleDescription: 'Illustrated tutor avatar looking upward thoughtfully with subtle processing pulse.',
    badgeText: 'Reflecting…',
  },
  Explaining: {
    expression: 'Explaining',
    label: 'Explaining',
    accessibleDescription: 'Illustrated tutor avatar gesturing gently with an open, instructional expression.',
    badgeText: 'Explaining',
  },
  Encouraging: {
    expression: 'Encouraging',
    label: 'Encouraging',
    accessibleDescription: 'Illustrated tutor avatar offering a confident, reassuring nod.',
    badgeText: 'You can do this!',
  },
  Happy: {
    expression: 'Happy',
    label: 'Pleased',
    accessibleDescription: 'Illustrated tutor avatar beaming with a broad, genuine smile.',
    badgeText: 'Well done!',
  },
  'Almost correct': {
    expression: 'Almost correct',
    label: 'Almost There',
    accessibleDescription: 'Illustrated tutor avatar nodding thoughtfully with an encouraging squint.',
    badgeText: 'So close!',
  },
  Supportive: {
    expression: 'Supportive',
    label: 'Supportive',
    accessibleDescription: 'Illustrated tutor avatar with a gentle, patient expression guiding your next steps.',
    badgeText: 'Step by step',
  },
  Celebration: {
    expression: 'Celebration',
    label: 'Celebrating',
    accessibleDescription: 'Illustrated tutor avatar joyfully celebrating your conceptual mastery with sparkles.',
    badgeText: 'Outstanding!',
  },
  Reminder: {
    expression: 'Reminder',
    label: 'Review Reminder',
    accessibleDescription: 'Illustrated tutor avatar pointing constructively toward a prerequisite review.',
    badgeText: 'Let’s refresh',
  },
};
