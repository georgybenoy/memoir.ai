import { z } from 'zod';

export type PomodoroPhase = 'focus' | 'break';
export type PomodoroStatus = 'idle' | 'running' | 'paused' | 'completed';

export const POMODORO_ENABLED_MODES: readonly string[] = ['study'];

export const FOCUS_PRESETS = [15, 25, 50] as const;
export const BREAK_PRESETS = [5, 10, 15] as const;

export const MIN_FOCUS_MINUTES = 1;
export const MAX_FOCUS_MINUTES = 120;
export const MIN_BREAK_MINUTES = 1;
export const MAX_BREAK_MINUTES = 60;

export const DEFAULT_FOCUS_MINUTES = 25;
export const DEFAULT_BREAK_MINUTES = 5;

export const POMODORO_STORAGE_KEY = 'edumentor.pomodoro.v1';
export const CURRENT_POMODORO_VERSION = 1;

export const PomodoroSettingsSchema = z.object({
  focusMinutes: z.number().int().min(MIN_FOCUS_MINUTES).max(MAX_FOCUS_MINUTES),
  breakMinutes: z.number().int().min(MIN_BREAK_MINUTES).max(MAX_BREAK_MINUTES),
  soundEnabled: z.boolean(),
  notificationsEnabled: z.boolean(),
});

export type PomodoroSettings = z.infer<typeof PomodoroSettingsSchema>;

export const PomodoroStateSchema = z.object({
  phase: z.enum(['focus', 'break']),
  status: z.enum(['idle', 'running', 'paused', 'completed']),
  durationMs: z.number().positive(),
  endsAt: z.number().positive().optional(),
  remainingMs: z.number().min(0),
  startedAt: z.number().positive().optional(),
  completedAt: z.number().positive().optional(),
  completionHandledAt: z.number().positive().optional(),
  finishedWhileAway: z.boolean().optional(),
  settings: PomodoroSettingsSchema,
  version: z.literal(CURRENT_POMODORO_VERSION),
});

export type PomodoroState = z.infer<typeof PomodoroStateSchema>;

export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  focusMinutes: DEFAULT_FOCUS_MINUTES,
  breakMinutes: DEFAULT_BREAK_MINUTES,
  soundEnabled: false,
  notificationsEnabled: false,
};

export const INITIAL_POMODORO_STATE: PomodoroState = {
  phase: 'focus',
  status: 'idle',
  durationMs: DEFAULT_FOCUS_MINUTES * 60 * 1000,
  remainingMs: DEFAULT_FOCUS_MINUTES * 60 * 1000,
  settings: DEFAULT_POMODORO_SETTINGS,
  version: CURRENT_POMODORO_VERSION,
};
