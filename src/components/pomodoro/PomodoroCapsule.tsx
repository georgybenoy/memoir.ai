'use client';

import * as React from 'react';
import {
  Timer,
  Coffee,
  Play,
  Pause,
  RotateCcw,
  X,
  Volume2,
  VolumeX,
  Bell,
  BellOff,
  Sparkles,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  FOCUS_PRESETS,
  BREAK_PRESETS,
  MIN_FOCUS_MINUTES,
  MAX_FOCUS_MINUTES,
  MIN_BREAK_MINUTES,
  MAX_BREAK_MINUTES,
  formatTimeRemaining,
  formatAccessibleLabel,
} from '@/features/pomodoro';
import { usePomodoro } from './usePomodoro';
import { cn } from '@/lib/utils/cn';

export interface PomodoroCapsuleProps {
  className?: string;
}

export function PomodoroCapsule({ className }: PomodoroCapsuleProps) {
  const {
    state,
    storageAvailable,
    start,
    pause,
    resume,
    reset,
    startBreakSession,
    skipBreakSession,
    updateTimerSettings,
    requestNotificationPermission,
    dismissAwayNotice,
  } = usePomodoro();

  const [isOpen, setIsOpen] = React.useState(false);
  const [customMinutes, setCustomMinutes] = React.useState<string>('');
  const [customError, setCustomError] = React.useState<string | null>(null);

  // Announce only on major status changes (no per-second ticking spam)
  const statusAnnouncement = React.useMemo(() => {
    if (state.status === 'running') return `Timer started for ${state.phase} session.`;
    if (state.status === 'paused') return 'Timer paused.';
    if (state.status === 'completed') return `${state.phase === 'focus' ? 'Focus' : 'Break'} session complete.`;
    return 'Timer idle.';
  }, [state.status, state.phase]);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  // Click outside listener to close popover
  React.useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const formattedTime = formatTimeRemaining(state.remainingMs);
  const accessibleLabel = formatAccessibleLabel(state.phase, state.remainingMs, state.status);

  // Calculate percentage elapsed for the subtle progress bar
  const progressRatio =
    state.durationMs > 0
      ? Math.max(0, Math.min(1, (state.durationMs - state.remainingMs) / state.durationMs))
      : 0;
  const progressPercent = Math.round(progressRatio * 100);

  const isFocus = state.phase === 'focus';
  const isRunning = state.status === 'running';
  const isPaused = state.status === 'paused';
  const isCompleted = state.status === 'completed';

  const handleCustomApply = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(customMinutes, 10);
    const minLimit = isFocus ? MIN_FOCUS_MINUTES : MIN_BREAK_MINUTES;
    const maxLimit = isFocus ? MAX_FOCUS_MINUTES : MAX_BREAK_MINUTES;

    if (isNaN(val) || val < minLimit || val > maxLimit) {
      setCustomError(`Please enter a duration between ${minLimit} and ${maxLimit} minutes.`);
      return;
    }

    setCustomError(null);
    if (isFocus) {
      updateTimerSettings({ focusMinutes: val });
    } else {
      updateTimerSettings({ breakMinutes: val });
    }
    setCustomMinutes('');
  };

  return (
    <div ref={containerRef} className={cn('relative inline-block', className)}>
      {/* Screen-reader status announcement (only on status changes) */}
      <div role="status" aria-live="polite" className="sr-only">
        {statusAnnouncement}
      </div>

      {/* Capsule Pill Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setIsOpen((prev) => !prev);
        }}
        aria-label={accessibleLabel}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={cn(
          'relative flex items-center gap-1.5 sm:gap-2 px-3 py-1 rounded-full border transition-all duration-150 select-none cursor-pointer',
          'min-h-[44px] h-9 sm:h-8',
          'bg-[var(--surface-raised)] border-[var(--border-color)] text-[var(--text-primary)]',
          'hover:border-[var(--primary)]/70 hover:bg-[var(--surface-hover)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset)]',
          isCompleted && 'border-[var(--accent-cyan)] shadow-sm motion-safe:animate-pulse',
        )}
      >
        {/* Phase Indicator Icon */}
        <span
          className={cn(
            'flex items-center justify-center h-4 w-4 rounded-full text-xs shrink-0',
            isFocus ? 'text-[var(--primary)]' : 'text-[var(--accent-cyan)]',
          )}
        >
          {isFocus ? (
            <Timer className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Coffee className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </span>

        {/* Phase Label (hidden on narrow screens, kept for desktop) */}
        <span className="text-[11px] font-semibold text-[var(--text-secondary)] hidden sm:inline">
          {isFocus ? 'Focus ' : 'Break '}
        </span>

        {/* Paused Indicator Label */}
        {isPaused && (
          <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--warning)] px-1 rounded bg-[var(--warning)]/10">
            Paused{' '}
          </span>
        )}

        {/* Completed Indicator Label */}
        {isCompleted && (
          <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--accent-cyan)] px-1 rounded bg-[var(--accent-cyan)]/10">
            Done{' '}
          </span>
        )}

        {/* Time Digits (Tabular figures to prevent layout jitter) */}
        <span className="font-mono tabular-nums text-xs font-bold text-[var(--text-primary)]">
          {formattedTime}
        </span>

        {/* Subtle Violet Progress Under-Bar */}
        <div
          className="absolute bottom-0 left-0 h-[2px] bg-[var(--primary)] rounded-full transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
          aria-hidden="true"
        />
      </button>

      {/* Anchored Popover Dialog */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Pomodoro timer controls"
          className={cn(
            'absolute right-0 top-full mt-2 z-50 p-4 sm:p-5 rounded-2xl border shadow-2xl',
            'w-72 sm:w-80 max-w-[calc(100vw-24px)]',
            'bg-[var(--surface)] border-[var(--border-color)] text-[var(--text-primary)]',
            'animate-in fade-in-0 zoom-in-95 duration-150',
          )}
        >
          {/* Popover Header */}
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-color)]/60">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5',
                  isFocus
                    ? 'bg-[var(--primary)]/15 text-[var(--primary)]'
                    : 'bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)]',
                )}
              >
                {isFocus ? (
                  <Timer className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Coffee className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>{isFocus ? 'Focus Session' : 'Short Break'}</span>
              </span>

              <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted)]">
                {state.status}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] cursor-pointer"
              aria-label="Close timer controls"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Finished While Away Notice */}
          {state.finishedWhileAway && (
            <div className="mt-3 p-2.5 rounded-xl border border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/10 text-xs text-[var(--text-primary)] flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-[var(--accent-cyan)] shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <strong className="block font-semibold">Session finished while you were away</strong>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Your timer completed by device clock. You can now take a break or start another session.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={dismissAwayNotice}
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
                aria-label="Dismiss away notice"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Fallback Storage Warning */}
          {!storageAvailable && (
            <div className="mt-3 p-2 rounded-lg bg-[var(--warning)]/10 border border-[var(--warning)]/30 text-[11px] text-[var(--warning)]">
              Timer won’t be remembered after refresh.
            </div>
          )}

          {/* Big Time Display */}
          <div className="py-4 text-center">
            <span className="block text-4xl sm:text-5xl font-extrabold font-mono tabular-nums tracking-tight text-[var(--text-primary)]">
              {formattedTime}
            </span>
            <span className="text-xs text-[var(--text-muted)] mt-1 block">
              {isFocus ? `${state.settings.focusMinutes} min goal` : `${state.settings.breakMinutes} min break`}
            </span>
          </div>

          {/* Controls Bar */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {state.status === 'idle' && (
                <Button
                  variant="primary"
                  onClick={start}
                  className="flex-1 min-h-[44px] font-semibold text-xs sm:text-sm bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] cursor-pointer"
                  aria-label={`Start ${isFocus ? 'focus' : 'break'} timer`}
                >
                  <Play className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  <span>Start {isFocus ? 'Focus' : 'Break'}</span>
                </Button>
              )}

              {isRunning && (
                <Button
                  variant="secondary"
                  onClick={pause}
                  className="flex-1 min-h-[44px] font-semibold text-xs sm:text-sm cursor-pointer"
                  aria-label="Pause timer"
                >
                  <Pause className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  <span>Pause</span>
                </Button>
              )}

              {isPaused && (
                <Button
                  variant="primary"
                  onClick={resume}
                  className="flex-1 min-h-[44px] font-semibold text-xs sm:text-sm bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] cursor-pointer"
                  aria-label="Resume timer"
                >
                  <Play className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  <span>Resume</span>
                </Button>
              )}

              {isCompleted && isFocus && (
                <Button
                  variant="primary"
                  onClick={startBreakSession}
                  className="flex-1 min-h-[44px] font-semibold text-xs sm:text-sm bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] cursor-pointer"
                  aria-label={`Start ${state.settings.breakMinutes}-min break`}
                >
                  <Coffee className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  <span>Start {state.settings.breakMinutes}-min break</span>
                </Button>
              )}

              {isCompleted && !isFocus && (
                <Button
                  variant="primary"
                  onClick={skipBreakSession}
                  className="flex-1 min-h-[44px] font-semibold text-xs sm:text-sm bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] cursor-pointer"
                  aria-label="Start next focus session"
                >
                  <Timer className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  <span>Start Focus</span>
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={reset}
                className="min-h-[44px] px-3 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                aria-label="Reset timer to beginning"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            {/* Offer to Skip Break if in break or break offered */}
            {((isCompleted && isFocus) || !isFocus) && (
              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={skipBreakSession}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:underline cursor-pointer py-1"
                >
                  {isFocus ? 'Skip break & ready for next focus' : 'Skip break & return to focus'}
                </button>
              </div>
            )}
          </div>

          {/* Presets & Custom Duration Accordion / Section */}
          <div className="pt-3 mt-3 border-t border-[var(--border-color)]/60 space-y-2">
            <span className="text-[11px] font-semibold text-[var(--text-secondary)] block">
              {isFocus ? 'Focus Duration' : 'Break Duration'}
            </span>

            <div className="flex items-center gap-1.5">
              {(isFocus ? FOCUS_PRESETS : BREAK_PRESETS).map((preset) => {
                const currentVal = isFocus ? state.settings.focusMinutes : state.settings.breakMinutes;
                const isSelected = currentVal === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      if (isFocus) {
                        updateTimerSettings({ focusMinutes: preset });
                      } else {
                        updateTimerSettings({ breakMinutes: preset });
                      }
                    }}
                    className={cn(
                      'flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer',
                      isSelected
                        ? 'bg-[var(--primary)]/15 border-[var(--primary)] text-[var(--primary)]'
                        : 'bg-[var(--surface-raised)] border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                    )}
                  >
                    {preset}m
                  </button>
                );
              })}
            </div>

            {/* Custom Input */}
            <form noValidate onSubmit={handleCustomApply} className="flex items-center gap-2 pt-1">
              <input
                type="number"
                min={isFocus ? MIN_FOCUS_MINUTES : MIN_BREAK_MINUTES}
                max={isFocus ? MAX_FOCUS_MINUTES : MAX_BREAK_MINUTES}
                value={customMinutes}
                onChange={(e) => setCustomMinutes(e.target.value)}
                placeholder="Custom min"
                className="flex-1 px-2.5 py-1.5 rounded-lg text-xs bg-[var(--surface-raised)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)]"
                aria-label={`Custom ${isFocus ? 'focus' : 'break'} duration in minutes`}
              />
              <Button type="submit" variant="secondary" size="sm" className="h-8 text-xs px-3">
                Set
              </Button>
            </form>
            {customError && (
              <span className="text-[10px] text-[var(--danger)] block">{customError}</span>
            )}
          </div>

          {/* Sound & Notifications Toggles */}
          <div className="pt-3 mt-3 border-t border-[var(--border-color)]/60 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="pomodoro-sound-toggle" className="flex items-center gap-2 cursor-pointer">
                {state.settings.soundEnabled ? (
                  <Volume2 className="h-3.5 w-3.5 text-[var(--primary)]" aria-hidden="true" />
                ) : (
                  <VolumeX className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />
                )}
                <span className="text-[var(--text-secondary)]">Soft chime</span>
              </label>
              <input
                id="pomodoro-sound-toggle"
                type="checkbox"
                checked={state.settings.soundEnabled}
                onChange={(e) => updateTimerSettings({ soundEnabled: e.target.checked })}
                className="rounded border-[var(--border-color)] accent-[var(--primary)] cursor-pointer h-4 w-4"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <label htmlFor="pomodoro-notif-toggle" className="flex items-center gap-2 cursor-pointer">
                {state.settings.notificationsEnabled ? (
                  <Bell className="h-3.5 w-3.5 text-[var(--primary)]" aria-hidden="true" />
                ) : (
                  <BellOff className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />
                )}
                <span className="text-[var(--text-secondary)]">Browser notification</span>
              </label>
              <input
                id="pomodoro-notif-toggle"
                type="checkbox"
                checked={state.settings.notificationsEnabled}
                onChange={async (e) => {
                  if (e.target.checked) {
                    await requestNotificationPermission();
                  } else {
                    updateTimerSettings({ notificationsEnabled: false });
                  }
                }}
                className="rounded border-[var(--border-color)] accent-[var(--primary)] cursor-pointer h-4 w-4"
              />
            </div>
          </div>

          {/* Honest Device Clock Persistence Policy Note */}
          <div className="pt-3 mt-3 border-t border-[var(--border-color)]/50 flex items-start gap-1.5 text-[10px] text-[var(--text-muted)] leading-relaxed">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[var(--text-muted)]" aria-hidden="true" />
            <span>
              Time is tracked by your device clock. You&apos;ll only get an alert while EduMentor is open.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
