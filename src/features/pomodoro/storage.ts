import { nowEpochMs } from '@/lib/utils/clock';
import {
  type PomodoroState,
  PomodoroStateSchema,
  POMODORO_STORAGE_KEY,
  INITIAL_POMODORO_STATE,
} from './types';
import { tickPomodoro } from './state-machine';

/**
 * Checks if localStorage is accessible in the current browser environment.
 */
export function isLocalStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const testKey = '__pomodoro_storage_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Loads and validates Pomodoro state from localStorage with Zod.
 * Detects "finished while away" if end time expired while closed.
 * Discards corrupted or invalid data safely.
 */
export function loadPomodoroState(nowFn: () => number = nowEpochMs): {
  state: PomodoroState;
  storageAvailable: boolean;
} {
  if (!isLocalStorageAvailable()) {
    return {
      state: { ...INITIAL_POMODORO_STATE },
      storageAvailable: false,
    };
  }

  try {
    const raw = window.localStorage.getItem(POMODORO_STORAGE_KEY);
    if (!raw) {
      return {
        state: { ...INITIAL_POMODORO_STATE },
        storageAvailable: true,
      };
    }

    const parsedJson = JSON.parse(raw);
    const parseResult = PomodoroStateSchema.safeParse(parsedJson);

    if (!parseResult.success) {
      console.warn('Discarding invalid/corrupted Pomodoro state from localStorage:', parseResult.error);
      window.localStorage.removeItem(POMODORO_STORAGE_KEY);
      return {
        state: { ...INITIAL_POMODORO_STATE },
        storageAvailable: true,
      };
    }

    const loaded = parseResult.data;

    // Discard future-timestamp anomaly (more than 1 day in the future)
    const now = nowFn();
    if (loaded.endsAt && loaded.endsAt > now + 24 * 60 * 60 * 1000) {
      console.warn('Discarding future-timestamped Pomodoro state.');
      window.localStorage.removeItem(POMODORO_STORAGE_KEY);
      return {
        state: { ...INITIAL_POMODORO_STATE },
        storageAvailable: true,
      };
    }

    // Finished while away detection
    if (loaded.status === 'running' && loaded.endsAt) {
      if (now >= loaded.endsAt) {
        const finishedAwayState: PomodoroState = {
          ...loaded,
          status: 'completed',
          remainingMs: 0,
          completedAt: loaded.endsAt,
          endsAt: undefined,
          finishedWhileAway: true,
          // Suppress retroactive alarm chime since user was away
          completionHandledAt: now,
        };
        // Persist the clean completed state back
        savePomodoroState(finishedAwayState);
        return {
          state: finishedAwayState,
          storageAvailable: true,
        };
      } else {
        // Recompute remaining from device clock without drift
        const updated = tickPomodoro(loaded, nowFn);
        savePomodoroState(updated);
        return {
          state: updated,
          storageAvailable: true,
        };
      }
    }

    return {
      state: loaded,
      storageAvailable: true,
    };
  } catch (err) {
    console.warn('Failed to load Pomodoro state from localStorage:', err);
    return {
      state: { ...INITIAL_POMODORO_STATE },
      storageAvailable: true,
    };
  }
}

/**
 * Saves Pomodoro state to localStorage.
 */
export function savePomodoroState(state: PomodoroState): boolean {
  if (!isLocalStorageAvailable()) return false;
  try {
    window.localStorage.setItem(POMODORO_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.warn('Could not persist Pomodoro state to localStorage:', err);
    return false;
  }
}

/**
 * Clears stored Pomodoro state.
 */
export function clearPomodoroState(): void {
  if (!isLocalStorageAvailable()) return;
  try {
    window.localStorage.removeItem(POMODORO_STORAGE_KEY);
  } catch {
    // ignore
  }
}
