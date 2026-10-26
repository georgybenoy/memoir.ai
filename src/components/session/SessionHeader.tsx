'use client';

import * as React from 'react';
import {
  Sparkles,
  Brain,
  Calendar,
  CheckCircle2,
  Pause,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PomodoroCapsule } from '@/components/pomodoro';
import { POMODORO_ENABLED_MODES } from '@/features/pomodoro';
import { type LearningMode } from '@/features/workflow/types';
import { cn } from '@/lib/utils/cn';

export interface SessionHeaderProps {
  materialName?: string;
  unitTitle?: string;
  conceptTitle?: string;
  mode: LearningMode;
  progressLabel?: string;
  onFinish: () => void | Promise<void>;
  onPause: () => void | Promise<void>;
  onExit: () => void | Promise<void>;
  className?: string;
}

export function SessionHeader({
  materialName,
  unitTitle,
  conceptTitle,
  mode,
  progressLabel,
  onFinish,
  onPause,
  onExit,
  className,
}: SessionHeaderProps) {
  return (
    <header
      aria-label="Study session header"
      className={cn(
        'relative z-20 w-full rounded-2xl border border-[var(--border-color)] bg-[var(--surface)]/95 backdrop-blur-xs p-4 sm:p-5 shadow-xs transition-colors',
        className,
      )}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Context Breadcrumb, Mode Badge & Titles */}
        <div className="space-y-1.5 min-w-0 flex-1">
          {/* Breadcrumb Hierarchy */}
          <div className="flex items-center gap-2 flex-wrap text-xs text-[var(--text-muted)]">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-semibold border text-xs',
                mode === 'study' &&
                  'bg-[var(--primary)]/15 text-[var(--text-primary)] border-[var(--primary)]/30',
                mode === 'recall' &&
                  'bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] border-[var(--accent-cyan)]/30',
                mode === 'revision' &&
                  'bg-[var(--warning)]/15 text-[var(--warning)] border-[var(--warning)]/30',
              )}
            >
              {mode === 'study' && <Sparkles className="h-3 w-3" aria-hidden="true" />}
              {mode === 'recall' && <Brain className="h-3 w-3" aria-hidden="true" />}
              {mode === 'revision' && <Calendar className="h-3 w-3" aria-hidden="true" />}
              <span>{mode ? mode.charAt(0).toUpperCase() + mode.slice(1) : ''} Mode</span>
            </span>

            {materialName && (
              <span
                className="truncate max-w-[180px] sm:max-w-[240px] text-[var(--text-secondary)] font-medium"
                title={materialName}
              >
                {materialName}
              </span>
            )}

            {unitTitle && (
              <>
                <ChevronRight className="h-3 w-3 text-[var(--text-muted)] shrink-0" aria-hidden="true" />
                <span className="truncate max-w-[160px] text-[var(--text-muted)]" title={unitTitle}>
                  {unitTitle}
                </span>
              </>
            )}
          </div>

          {/* Active Concept Title & Progress Badge */}
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)] truncate">
              {conceptTitle ?? 'Study Session'}
            </h1>
            {progressLabel && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[var(--surface-raised)] border border-[var(--border-color)] text-xs font-mono text-[var(--text-secondary)] font-medium">
                {progressLabel}
              </span>
            )}
          </div>
        </div>

        {/* Right: Session Controls with accessible 44px tap targets */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
          {POMODORO_ENABLED_MODES.includes(mode) && (
            <PomodoroCapsule />
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={onFinish}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent-green)] border border-[var(--border-color)] bg-[var(--surface-raised)] min-h-[44px] px-3 font-medium transition-colors"
            aria-label="Finish study session and view summary"
          >
            <CheckCircle2 className="h-4 w-4 mr-1.5 text-[var(--accent-green)]" aria-hidden="true" />
            <span>Finish</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onPause}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)] bg-[var(--surface-raised)] min-h-[44px] px-3 font-medium transition-colors"
            aria-label="Pause session and return to mode selection"
          >
            <Pause className="h-4 w-4 mr-1.5" aria-hidden="true" />
            <span>Pause</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onExit}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--danger)] border border-[var(--border-color)] bg-[var(--surface-raised)] min-h-[44px] px-3 font-medium transition-colors"
            aria-label="Exit session and return to library"
          >
            <LogOut className="h-4 w-4 mr-1.5" aria-hidden="true" />
            <span>Exit</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
