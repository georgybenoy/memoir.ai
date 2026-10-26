import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  INITIAL_POMODORO_STATE,
  startPomodoro,
  pausePomodoro,
  resumePomodoro,
  resetPomodoro,
  startBreak,
  skipBreak,
  updateSettings,
  tickPomodoro,
  markCompletionHandled,
  formatTimeRemaining,
  formatAccessibleLabel,
  loadPomodoroState,
  savePomodoroState,
  POMODORO_STORAGE_KEY,
  type PomodoroState,
} from '@/features/pomodoro';
import { _setNow, _resetNow } from '@/lib/utils/clock';

describe('Pomodoro Pure Logic & State Machine', () => {
  let mockTime = 1700000000000; // Fixed baseline timestamp
  const getMockTime = () => mockTime;

  beforeEach(() => {
    mockTime = 1700000000000;
    _setNow(() => new Date(mockTime));
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  afterEach(() => {
    _resetNow();
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  describe('Lifecycle & Transitions', () => {
    it('starts from idle into running state with exact endsAt', () => {
      const state = { ...INITIAL_POMODORO_STATE };
      const started = startPomodoro(state, getMockTime);

      expect(started.status).toBe('running');
      expect(started.phase).toBe('focus');
      expect(started.durationMs).toBe(25 * 60 * 1000);
      expect(started.remainingMs).toBe(25 * 60 * 1000);
      expect(started.endsAt).toBe(mockTime + 25 * 60 * 1000);
      expect(started.startedAt).toBe(mockTime);
    });

    it('pauses running timer, stores remainingMs, and clears endsAt', () => {
      const state = startPomodoro({ ...INITIAL_POMODORO_STATE }, getMockTime);

      // Advance 5 minutes
      mockTime += 5 * 60 * 1000;

      const paused = pausePomodoro(state, getMockTime);
      expect(paused.status).toBe('paused');
      expect(paused.remainingMs).toBe(20 * 60 * 1000);
      expect(paused.endsAt).toBeUndefined();
    });

    it('resumes paused timer with fresh endsAt', () => {
      const state = startPomodoro({ ...INITIAL_POMODORO_STATE }, getMockTime);
      mockTime += 5 * 60 * 1000;
      const paused = pausePomodoro(state, getMockTime);

      // User leaves it paused for 10 minutes
      mockTime += 10 * 60 * 1000;

      const resumed = resumePomodoro(paused, getMockTime);
      expect(resumed.status).toBe('running');
      expect(resumed.remainingMs).toBe(20 * 60 * 1000);
      expect(resumed.endsAt).toBe(mockTime + 20 * 60 * 1000);
    });

    it('resets timer back to idle within current phase', () => {
      const state = startPomodoro({ ...INITIAL_POMODORO_STATE }, getMockTime);
      mockTime += 10 * 60 * 1000;
      const reset = resetPomodoro(state);

      expect(reset.status).toBe('idle');
      expect(reset.phase).toBe('focus');
      expect(reset.remainingMs).toBe(25 * 60 * 1000);
      expect(reset.endsAt).toBeUndefined();
    });

    it('handles focus completion and transition to break', () => {
      let state = startPomodoro({ ...INITIAL_POMODORO_STATE }, getMockTime);

      // Fast-forward 25 minutes
      mockTime += 25 * 60 * 1000;
      state = tickPomodoro(state, getMockTime);

      expect(state.status).toBe('completed');
      expect(state.remainingMs).toBe(0);
      expect(state.endsAt).toBeUndefined();

      // Start break
      state = startBreak(state, getMockTime);
      expect(state.phase).toBe('break');
      expect(state.status).toBe('running');
      expect(state.durationMs).toBe(5 * 60 * 1000);
      expect(state.remainingMs).toBe(5 * 60 * 1000);
      expect(state.endsAt).toBe(mockTime + 5 * 60 * 1000);

      // Complete break
      mockTime += 5 * 60 * 1000;
      state = tickPomodoro(state, getMockTime);
      expect(state.status).toBe('completed');

      // Reset or skip break returns to idle focus
      state = skipBreak(state);
      expect(state.phase).toBe('focus');
      expect(state.status).toBe('idle');
      expect(state.remainingMs).toBe(25 * 60 * 1000);
    });

    it('allows skipping break at any point to return to focus', () => {
      let state = startBreak({ ...INITIAL_POMODORO_STATE }, getMockTime);
      expect(state.phase).toBe('break');

      state = skipBreak(state);
      expect(state.phase).toBe('focus');
      expect(state.status).toBe('idle');
      expect(state.remainingMs).toBe(25 * 60 * 1000);
    });

    it('returns unchanged state for illegal transitions without throwing', () => {
      const idleState = { ...INITIAL_POMODORO_STATE };
      expect(pausePomodoro(idleState, getMockTime)).toEqual(idleState);
      expect(resumePomodoro(idleState, getMockTime)).toEqual(idleState);

      const runningState = startPomodoro(idleState, getMockTime);
      expect(startPomodoro(runningState, getMockTime)).toEqual(runningState);
      expect(resumePomodoro(runningState, getMockTime)).toEqual(runningState);
    });
  });

  describe('Timestamp-Based Timing & Clock Anomalies', () => {
    it('simulates 25 minutes via a single large clock jump without drift', () => {
      let state = startPomodoro({ ...INITIAL_POMODORO_STATE }, getMockTime);

      // Single jump simulating throttled background tab
      mockTime += 25 * 60 * 1000;
      state = tickPomodoro(state, getMockTime);

      expect(state.status).toBe('completed');
      expect(state.remainingMs).toBe(0);
    });

    it('handles backward clock jump by clamping remainingMs to durationMs', () => {
      let state = startPomodoro({ ...INITIAL_POMODORO_STATE }, getMockTime);

      // System clock jumps backward 1 hour
      mockTime -= 60 * 60 * 1000;
      state = tickPomodoro(state, getMockTime);

      expect(state.remainingMs).toBe(state.durationMs);
      expect(state.endsAt).toBe(mockTime + state.durationMs);
    });

    it('treats forward clock jump beyond endsAt as completed', () => {
      let state = startPomodoro({ ...INITIAL_POMODORO_STATE }, getMockTime);

      // System clock jumps forward 2 hours
      mockTime += 2 * 60 * 60 * 1000;
      state = tickPomodoro(state, getMockTime);

      expect(state.status).toBe('completed');
      expect(state.remainingMs).toBe(0);
    });

    it('produces idempotent completion events via markCompletionHandled', () => {
      let state = startPomodoro({ ...INITIAL_POMODORO_STATE }, getMockTime);
      mockTime += 25 * 60 * 1000;
      state = tickPomodoro(state, getMockTime);

      expect(state.status).toBe('completed');
      expect(state.completionHandledAt).toBeUndefined();

      state = markCompletionHandled(state, getMockTime);
      const firstHandled = state.completionHandledAt;
      expect(firstHandled).toBe(mockTime);

      // Calling again does not overwrite or re-trigger
      mockTime += 5000;
      state = markCompletionHandled(state, getMockTime);
      expect(state.completionHandledAt).toBe(firstHandled);
    });
  });

  describe('Settings & Formatting', () => {
    it('clamps focus minutes to [1, 120] and break minutes to [1, 60]', () => {
      let state = { ...INITIAL_POMODORO_STATE };

      state = updateSettings(state, {
        focusMinutes: 150,
        breakMinutes: -10,
      });

      expect(state.settings.focusMinutes).toBe(120);
      expect(state.settings.breakMinutes).toBe(1);
      expect(state.durationMs).toBe(120 * 60 * 1000);
      expect(state.remainingMs).toBe(120 * 60 * 1000);
    });

    it('formats time remaining into MM:SS format with tabular padding', () => {
      expect(formatTimeRemaining(25 * 60 * 1000)).toBe('25:00');
      expect(formatTimeRemaining(4 * 60 * 1000 + 9 * 1000)).toBe('04:09');
      expect(formatTimeRemaining(59 * 1000)).toBe('00:59');
      expect(formatTimeRemaining(0)).toBe('00:00');
    });

    it('generates accessible label with status and remaining time', () => {
      const label = formatAccessibleLabel('focus', 18 * 60 * 1000 + 32 * 1000, 'running');
      expect(label).toBe('Focus 18:32 — Pomodoro timer, Focus, 18 minutes 32 seconds remaining, running. Open timer controls');

      const completedLabel = formatAccessibleLabel('focus', 0, 'completed');
      expect(completedLabel).toBe('Focus Done 00:00 — Pomodoro timer, Focus complete. Open timer controls');
    });
  });

  describe('Persistence Policy & Storage Invariants', () => {
    it('persists and restores running state recomputing remaining from device clock', () => {
      const state = startPomodoro({ ...INITIAL_POMODORO_STATE }, getMockTime);
      savePomodoroState(state);

      // 5 minutes elapse while navigating
      mockTime += 5 * 60 * 1000;

      const loaded = loadPomodoroState(getMockTime);
      expect(loaded.storageAvailable).toBe(true);
      expect(loaded.state.status).toBe('running');
      expect(loaded.state.remainingMs).toBe(20 * 60 * 1000);
    });

    it('detects "finished while away" when end time passed while app was closed', () => {
      const state = startPomodoro({ ...INITIAL_POMODORO_STATE }, getMockTime);
      savePomodoroState(state);

      // App is closed for 30 minutes
      mockTime += 30 * 60 * 1000;

      const loaded = loadPomodoroState(getMockTime);
      expect(loaded.state.status).toBe('completed');
      expect(loaded.state.remainingMs).toBe(0);
      expect(loaded.state.finishedWhileAway).toBe(true);
      // Suppresses retroactive alarm chime
      expect(loaded.state.completionHandledAt).toBeDefined();
    });

    it('discards corrupted JSON or invalid Zod schema safely and resets to initial state', () => {
      window.localStorage.setItem(POMODORO_STORAGE_KEY, 'invalid-json{{{');
      const loaded1 = loadPomodoroState(getMockTime);
      expect(loaded1.state.status).toBe('idle');
      expect(loaded1.state.remainingMs).toBe(25 * 60 * 1000);

      window.localStorage.setItem(POMODORO_STORAGE_KEY, JSON.stringify({ phase: 'invalid-phase' }));
      const loaded2 = loadPomodoroState(getMockTime);
      expect(loaded2.state.status).toBe('idle');
    });

    it('discards future-timestamped states', () => {
      const futureState: PomodoroState = {
        ...INITIAL_POMODORO_STATE,
        status: 'running',
        endsAt: mockTime + 10 * 24 * 60 * 60 * 1000, // 10 days in future
      };
      window.localStorage.setItem(POMODORO_STORAGE_KEY, JSON.stringify(futureState));

      const loaded = loadPomodoroState(getMockTime);
      expect(loaded.state.status).toBe('idle');
    });
  });
});
