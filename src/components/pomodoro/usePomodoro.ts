'use client';

import * as React from 'react';
import { nowEpochMs } from '@/lib/utils/clock';
import {
  type PomodoroState,
  type PomodoroSettings,
  loadPomodoroState,
  savePomodoroState,
  startPomodoro,
  pausePomodoro,
  resumePomodoro,
  resetPomodoro,
  startBreak,
  skipBreak,
  updateSettings,
  tickPomodoro,
  formatTimeRemaining,
  POMODORO_STORAGE_KEY,
} from '@/features/pomodoro';
import { useWorkspaceStore } from '@/lib/state/workspace-store';

/**
 * Play a gentle, quiet two-tone chime via Web Audio API.
 * Fails silently if blocked by browser autoplay policy.
 */
function playSoftChime(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Gentle two-tone sequence: C5 (523.25Hz) to E5 (659.25Hz)
    osc.frequency.setValueAtTime(523.25, now);
    osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.15);

    // Soft master gain fading out
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.65);
  } catch {
    // Fail silently if audio is blocked or unsupported
  }
}

/**
 * Trigger a native browser notification if permitted and tab is hidden.
 */
function showBrowserNotification(title: string, body: string): void {
  if (
    typeof window !== 'undefined' &&
    typeof Notification !== 'undefined' &&
    Notification.permission === 'granted' &&
    document.hidden
  ) {
    try {
      new Notification(title, {
        body,
        icon: '/icon.png',
        tag: 'edumentor-pomodoro',
      });
    } catch {
      // ignore
    }
  }
}

export function usePomodoro() {
  const addToast = useWorkspaceStore((state) => state.addToast);

  // 1. Initial State from Storage
  const [data, setData] = React.useState<{ state: PomodoroState; storageAvailable: boolean }>(() =>
    loadPomodoroState(nowEpochMs),
  );

  const state = data.state;
  const storageAvailable = data.storageAvailable;

  const stateRef = React.useRef(state);
  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Keep a reference to document title for tab-hidden updates
  const originalTitleRef = React.useRef<string | null>(null);

  // 2. Persist state changes
  const applyState = React.useCallback((nextState: PomodoroState) => {
    stateRef.current = nextState;
    setData((prev) => ({ ...prev, state: nextState }));
    savePomodoroState(nextState);
  }, []);

  // 3. Multi-Tab Storage Synchronization
  React.useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === POMODORO_STORAGE_KEY) {
        const fresh = loadPomodoroState(nowEpochMs);
        setData(fresh);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // 4. Lifecycle Event Listeners (visibilitychange, focus, pageshow, online)
  React.useEffect(() => {
    const handleSync = () => {
      if (stateRef.current.status === 'running') {
        const updated = tickPomodoro(stateRef.current, nowEpochMs);
        applyState(updated);
      }
    };

    document.addEventListener('visibilitychange', handleSync);
    window.addEventListener('focus', handleSync);
    window.addEventListener('pageshow', handleSync);
    window.addEventListener('online', handleSync);

    return () => {
      document.removeEventListener('visibilitychange', handleSync);
      window.removeEventListener('focus', handleSync);
      window.removeEventListener('pageshow', handleSync);
      window.removeEventListener('online', handleSync);
    };
  }, [applyState]);

  // 5. Active Tick Interval (~400ms for responsiveness)
  React.useEffect(() => {
    if (state.status !== 'running') return;

    const intervalId = setInterval(() => {
      const current = stateRef.current;
      if (current.status !== 'running') return;

      const ticked = tickPomodoro(current, nowEpochMs);
      if (ticked !== current) {
        applyState(ticked);
      }
    }, 400);

    return () => clearInterval(intervalId);
  }, [state.status, applyState]);

  const handledCompletionTimestampRef = React.useRef<number | null>(state.completionHandledAt ?? null);

  // 6. Handle Completion Alert (Idempotent single event: toast, chime, notification)
  React.useEffect(() => {
    if (
      state.status === 'completed' &&
      state.completedAt &&
      handledCompletionTimestampRef.current !== state.completedAt &&
      !state.finishedWhileAway
    ) {
      handledCompletionTimestampRef.current = state.completedAt;

      const isFocus = state.phase === 'focus';
      const toastTitle = isFocus ? 'Focus session complete!' : 'Break complete!';
      const toastDesc = isFocus
        ? 'Great work! Take a 5-minute break to recharge.'
        : 'Break is over. Ready to start your next focus session?';

      // 1. In-app non-blocking toast
      addToast({
        type: isFocus ? 'success' : 'info',
        title: toastTitle,
        description: toastDesc,
        durationMs: 7000,
      });

      // 2. Gentle chime if enabled
      if (state.settings.soundEnabled) {
        playSoftChime();
      }

      // 3. Browser notification if enabled & tab hidden
      if (state.settings.notificationsEnabled) {
        showBrowserNotification(toastTitle, toastDesc);
      }

      // Persist completionHandledAt to storage without triggering re-render
      savePomodoroState({
        ...state,
        completionHandledAt: nowEpochMs(),
      });
    }
  }, [state, addToast]);

  // 7. Tab-Hidden Title Countdown
  React.useEffect(() => {
    if (typeof document === 'undefined') return;

    if (!originalTitleRef.current) {
      originalTitleRef.current = document.title;
    }

    const updateTitle = () => {
      if (state.status === 'running' && document.hidden) {
        const timeStr = formatTimeRemaining(state.remainingMs);
        const phaseStr = state.phase === 'focus' ? 'Focus' : 'Break';
        document.title = `(${timeStr}) ${phaseStr} | EduMentor`;
      } else if (originalTitleRef.current) {
        document.title = originalTitleRef.current;
      }
    };

    updateTitle();
    document.addEventListener('visibilitychange', updateTitle);

    return () => {
      document.removeEventListener('visibilitychange', updateTitle);
      if (originalTitleRef.current) {
        document.title = originalTitleRef.current;
      }
    };
  }, [state.status, state.phase, state.remainingMs]);

  // Actions
  const handleStart = React.useCallback(() => {
    const next = startPomodoro(stateRef.current, nowEpochMs);
    applyState(next);
  }, [applyState]);

  const handlePause = React.useCallback(() => {
    const next = pausePomodoro(stateRef.current, nowEpochMs);
    applyState(next);
  }, [applyState]);

  const handleResume = React.useCallback(() => {
    const next = resumePomodoro(stateRef.current, nowEpochMs);
    applyState(next);
  }, [applyState]);

  const handleReset = React.useCallback(() => {
    const next = resetPomodoro(stateRef.current);
    applyState(next);
  }, [applyState]);

  const handleStartBreak = React.useCallback(() => {
    const next = startBreak(stateRef.current, nowEpochMs);
    applyState(next);
  }, [applyState]);

  const handleSkipBreak = React.useCallback(() => {
    const next = skipBreak(stateRef.current);
    applyState(next);
  }, [applyState]);

  const handleUpdateSettings = React.useCallback(
    (newSettings: Partial<PomodoroSettings>) => {
      const next = updateSettings(stateRef.current, newSettings);
      applyState(next);
    },
    [applyState],
  );

  const requestNotificationPermission = React.useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') {
      return false;
    }
    try {
      const permission = await Notification.requestPermission();
      const granted = permission === 'granted';
      handleUpdateSettings({ notificationsEnabled: granted });
      return granted;
    } catch {
      handleUpdateSettings({ notificationsEnabled: false });
      return false;
    }
  }, [handleUpdateSettings]);

  const dismissAwayNotice = React.useCallback(() => {
    if (stateRef.current.finishedWhileAway) {
      applyState({ ...stateRef.current, finishedWhileAway: false });
    }
  }, [applyState]);

  return {
    state,
    storageAvailable,
    start: handleStart,
    pause: handlePause,
    resume: handleResume,
    reset: handleReset,
    startBreakSession: handleStartBreak,
    skipBreakSession: handleSkipBreak,
    updateTimerSettings: handleUpdateSettings,
    requestNotificationPermission,
    dismissAwayNotice,
  };
}
