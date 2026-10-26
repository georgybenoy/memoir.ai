import { nowEpochMs } from '@/lib/utils/clock';
import {
  type PomodoroState,
  type PomodoroSettings,
  type PomodoroPhase,
  type PomodoroStatus,
  MIN_FOCUS_MINUTES,
  MAX_FOCUS_MINUTES,
  MIN_BREAK_MINUTES,
  MAX_BREAK_MINUTES,
} from './types';

export type ClockFn = () => number;

/**
 * Validates and clamps setting minutes into safe integer bounds.
 */
export function clampMinutes(value: number, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.round(value);
  return Math.min(Math.max(rounded, min), max);
}

/**
 * Validates settings object and returns a safe sanitized settings copy.
 */
export function sanitizeSettings(settings: Partial<PomodoroSettings>): PomodoroSettings {
  return {
    focusMinutes: clampMinutes(
      settings.focusMinutes ?? 25,
      MIN_FOCUS_MINUTES,
      MAX_FOCUS_MINUTES,
      25,
    ),
    breakMinutes: clampMinutes(
      settings.breakMinutes ?? 5,
      MIN_BREAK_MINUTES,
      MAX_BREAK_MINUTES,
      5,
    ),
    soundEnabled: Boolean(settings.soundEnabled),
    notificationsEnabled: Boolean(settings.notificationsEnabled),
  };
}

/**
 * Recomputes remaining time and completion state based on the current timestamp.
 * Detects clock anomalies (backward jumps) and transitions running -> completed when expired.
 */
export function tickPomodoro(state: PomodoroState, nowFn: ClockFn = nowEpochMs): PomodoroState {
  if (state.status !== 'running' || typeof state.endsAt !== 'number') {
    return state;
  }

  const now = nowFn();

  // Clock anomaly: Clock jumped backwards (endsAt - now exceeds durationMs)
  if (state.endsAt - now > state.durationMs) {
    const clampedEndsAt = now + state.durationMs;
    return {
      ...state,
      endsAt: clampedEndsAt,
      remainingMs: state.durationMs,
    };
  }

  // Completion check
  if (now >= state.endsAt) {
    return {
      ...state,
      status: 'completed',
      remainingMs: 0,
      endsAt: undefined,
      completedAt: state.completedAt ?? state.endsAt,
    };
  }

  const remaining = Math.max(0, state.endsAt - now);
  if (remaining === state.remainingMs) {
    return state;
  }

  return {
    ...state,
    remainingMs: remaining,
  };
}

/**
 * Starts an idle or completed timer into running state.
 */
export function startPomodoro(state: PomodoroState, nowFn: ClockFn = nowEpochMs): PomodoroState {
  if (state.status !== 'idle' && state.status !== 'completed') {
    return state;
  }

  const now = nowFn();
  const durationMs =
    state.status === 'completed'
      ? state.phase === 'focus'
        ? state.settings.focusMinutes * 60 * 1000
        : state.settings.breakMinutes * 60 * 1000
      : state.durationMs;

  return {
    ...state,
    status: 'running',
    durationMs,
    remainingMs: durationMs,
    endsAt: now + durationMs,
    startedAt: now,
    completedAt: undefined,
    completionHandledAt: undefined,
    finishedWhileAway: false,
  };
}

/**
 * Pauses a running timer. Stores remainingMs and clears endsAt.
 */
export function pausePomodoro(state: PomodoroState, nowFn: ClockFn = nowEpochMs): PomodoroState {
  if (state.status !== 'running') {
    return state;
  }

  const now = nowFn();
  const endsAt = state.endsAt ?? now;
  const remainingMs = Math.max(0, Math.min(state.durationMs, endsAt - now));

  if (remainingMs === 0) {
    return {
      ...state,
      status: 'completed',
      remainingMs: 0,
      endsAt: undefined,
      completedAt: endsAt,
    };
  }

  return {
    ...state,
    status: 'paused',
    remainingMs,
    endsAt: undefined,
  };
}

/**
 * Resumes a paused timer with fresh endsAt calculated from remainingMs.
 */
export function resumePomodoro(state: PomodoroState, nowFn: ClockFn = nowEpochMs): PomodoroState {
  if (state.status !== 'paused') {
    return state;
  }

  const now = nowFn();
  const safeRemaining = Math.max(0, Math.min(state.durationMs, state.remainingMs));

  if (safeRemaining === 0) {
    return {
      ...state,
      status: 'completed',
      remainingMs: 0,
      endsAt: undefined,
      completedAt: now,
    };
  }

  return {
    ...state,
    status: 'running',
    remainingMs: safeRemaining,
    endsAt: now + safeRemaining,
  };
}

/**
 * Resets the timer to idle state within its current phase, restoring default duration.
 */
export function resetPomodoro(state: PomodoroState): PomodoroState {
  const durationMs =
    state.phase === 'focus'
      ? state.settings.focusMinutes * 60 * 1000
      : state.settings.breakMinutes * 60 * 1000;

  return {
    ...state,
    status: 'idle',
    durationMs,
    remainingMs: durationMs,
    endsAt: undefined,
    startedAt: undefined,
    completedAt: undefined,
    completionHandledAt: undefined,
    finishedWhileAway: false,
  };
}

/**
 * Transitions to break phase and immediately begins running.
 */
export function startBreak(state: PomodoroState, nowFn: ClockFn = nowEpochMs): PomodoroState {
  const now = nowFn();
  const durationMs = state.settings.breakMinutes * 60 * 1000;

  return {
    ...state,
    phase: 'break',
    status: 'running',
    durationMs,
    remainingMs: durationMs,
    endsAt: now + durationMs,
    startedAt: now,
    completedAt: undefined,
    completionHandledAt: undefined,
    finishedWhileAway: false,
  };
}

/**
 * Skips break (or returns from break) back to idle focus ready to start.
 */
export function skipBreak(state: PomodoroState): PomodoroState {
  const durationMs = state.settings.focusMinutes * 60 * 1000;

  return {
    ...state,
    phase: 'focus',
    status: 'idle',
    durationMs,
    remainingMs: durationMs,
    endsAt: undefined,
    startedAt: undefined,
    completedAt: undefined,
    completionHandledAt: undefined,
    finishedWhileAway: false,
  };
}

/**
 * Updates settings safely. If timer is idle, recalibrates duration and remainingMs.
 */
export function updateSettings(
  state: PomodoroState,
  newSettings: Partial<PomodoroSettings>,
): PomodoroState {
  const settings = sanitizeSettings({
    ...state.settings,
    ...newSettings,
  });

  if (state.status === 'idle') {
    const durationMs =
      state.phase === 'focus'
        ? settings.focusMinutes * 60 * 1000
        : settings.breakMinutes * 60 * 1000;

    return {
      ...state,
      settings,
      durationMs,
      remainingMs: durationMs,
    };
  }

  return {
    ...state,
    settings,
  };
}

/**
 * Marks a completion event as handled so audio/notifications/toasts do not fire again.
 */
export function markCompletionHandled(
  state: PomodoroState,
  nowFn: ClockFn = nowEpochMs,
): PomodoroState {
  if (state.status !== 'completed' || state.completionHandledAt) {
    return state;
  }
  return {
    ...state,
    completionHandledAt: nowFn(),
  };
}

/**
 * Formats milliseconds into MM:SS tabular string.
 */
export function formatTimeRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const paddedM = String(minutes).padStart(2, '0');
  const paddedS = String(seconds).padStart(2, '0');
  return `${paddedM}:${paddedS}`;
}

export function formatAccessibleLabel(
  phase: PomodoroPhase,
  remainingMs: number,
  status: PomodoroStatus,
): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const phaseTitle = phase === 'focus' ? 'Focus' : 'Break';
  const timeFormatted = formatTimeRemaining(remainingMs);

  if (status === 'completed') {
    return `${phaseTitle} Done ${timeFormatted} — Pomodoro timer, ${phaseTitle} complete. Open timer controls`;
  }

  const statusLabel = status === 'paused' ? 'Paused ' : '';
  const timeDesc = `${minutes} minute${minutes === 1 ? '' : 's'} ${seconds} second${seconds === 1 ? '' : 's'} remaining`;
  return `${phaseTitle} ${statusLabel}${timeFormatted} — Pomodoro timer, ${phaseTitle}, ${timeDesc}, ${status}. Open timer controls`;
}

