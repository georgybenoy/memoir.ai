'use client';

import * as React from 'react';
import {
  Trophy,
  Clock,
  Sparkles,
  Brain,
  RotateCcw,
  ArrowRight,
  BookOpen,
  AlertTriangle,
  Calendar,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { type SessionSummary } from '@/features/modes/types';
import { cn } from '@/lib/utils/cn';

export interface SessionCompletionViewProps {
  summary: SessionSummary;
  materialId?: string;
  onContinueNextUnit?: (unitId: string) => void;
  onSwitchMode: () => void;
  onReturnToOrganise: () => void;
  onGoHome: () => void;
  className?: string;
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

function getMasteryBadgeClass(level: string): { bg: string; text: string; label: string } {
  switch (level.toLowerCase()) {
    case 'mastered':
      return {
        bg: 'bg-[var(--accent-green)]/15 border-[var(--accent-green)]/30',
        text: 'text-[var(--accent-green)]',
        label: 'Mastered',
      };
    case 'proficient':
      return {
        bg: 'bg-[var(--accent-blue)]/15 border-[var(--accent-blue)]/30',
        text: 'text-[var(--accent-blue)]',
        label: 'Proficient',
      };
    case 'familiar':
      return {
        bg: 'bg-[var(--primary)]/15 border-[var(--primary)]/30',
        text: 'text-[var(--text-primary)]',
        label: 'Familiar',
      };
    case 'learning':
      return {
        bg: 'bg-[var(--warning)]/15 border-[var(--warning)]/30',
        text: 'text-[var(--warning)]',
        label: 'Learning',
      };
    default:
      return {
        bg: 'bg-[var(--text-muted)]/10 border-[var(--text-muted)]/20',
        text: 'text-[var(--text-muted)]',
        label: 'New',
      };
  }
}

export function SessionCompletionView({
  summary,
  onContinueNextUnit,
  onSwitchMode,
  onReturnToOrganise,
  onGoHome,
  className,
}: SessionCompletionViewProps) {

  return (
    <div className={cn('space-y-6 max-w-4xl mx-auto py-4 sm:py-6', className)}>
      {/* Session Header Card */}
      <Card className="border-[var(--border-color)] bg-[var(--surface)] text-center p-6 sm:p-8 space-y-4 shadow-sm">
        <div className="flex justify-center">
          <div className="p-4 rounded-full bg-[var(--accent-green)]/15 text-[var(--accent-green)] border border-[var(--accent-green)]/30 shadow-inner">
            <Trophy className="h-10 w-10" aria-hidden="true" />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[var(--surface-raised)] border border-[var(--border-color)] text-[var(--text-secondary)]">
            <span className="capitalize">{summary.mode} Mode</span>
            <span>&bull;</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {formatDuration(summary.durationSeconds)}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
            Session Completed!
          </h1>
          <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto">
            All attempts, mastery scores, and spaced repetition intervals were saved to local storage.
          </p>
        </div>

        {/* Real Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto pt-2 text-left">
          <div className="p-3.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)]">
            <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider block font-semibold">
              Concepts Covered
            </span>
            <span className="text-xl font-bold text-[var(--text-primary)]">
              {summary.conceptsCovered.length}
            </span>
          </div>

          <div className="p-3.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)]">
            <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider block font-semibold">
              Questions Answered
            </span>
            <span className="text-xl font-bold text-[var(--text-primary)]">
              {summary.questionsAnswered}
            </span>
          </div>

          <div className="p-3.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)]">
            <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider block font-semibold">
              Average Score
            </span>
            <span
              className={cn(
                'text-xl font-bold',
                summary.averageScore !== null && summary.averageScore >= 70
                  ? 'text-[var(--accent-green)]'
                  : summary.averageScore !== null
                  ? 'text-[var(--warning)]'
                  : 'text-[var(--text-secondary)]',
              )}
            >
              {summary.averageScore !== null ? `${summary.averageScore}%` : '—'}
            </span>
          </div>

          <div className="p-3.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)]">
            <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider block font-semibold">
              Reviews Scheduled
            </span>
            <span className="text-xl font-bold text-[var(--accent-cyan)]">
              {summary.newlyScheduledReviews.length}
            </span>
          </div>
        </div>
      </Card>

      {/* Recommended Next Action Card */}
      {summary.recommendedNextAction && (
        <Card className="border-[var(--primary)]/40 bg-[var(--primary)]/5 p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-[var(--accent-cyan)] uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Recommended Next Step
              </span>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                {summary.recommendedNextAction.title}
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                {summary.recommendedNextAction.description}
              </p>
            </div>

            <div className="shrink-0 w-full sm:w-auto">
              {summary.recommendedNextAction.type === 'CONTINUE_UNIT' &&
              summary.recommendedNextAction.targetUnitId &&
              onContinueNextUnit ? (
                <Button
                  variant="primary"
                  onClick={() =>
                    onContinueNextUnit(summary.recommendedNextAction.targetUnitId!)
                  }
                  className="w-full sm:w-auto min-h-[44px] text-xs font-semibold bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white px-4"
                >
                  <span>Continue Next Unit</span>
                  <ArrowRight className="h-3.5 w-3.5 ml-1.5" aria-hidden="true" />
                </Button>
              ) : summary.recommendedNextAction.type === 'SWITCH_MODE' ||
                summary.recommendedNextAction.type === 'REVIEW_WEAK' ? (
                <Button
                  variant="primary"
                  onClick={onSwitchMode}
                  className="w-full sm:w-auto min-h-[44px] text-xs font-semibold bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white px-4"
                >
                  <span>{summary.recommendedNextAction.title}</span>
                  <ArrowRight className="h-3.5 w-3.5 ml-1.5" aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={onGoHome}
                  className="w-full sm:w-auto min-h-[44px] text-xs font-semibold border-[var(--border-color)] px-4"
                >
                  <span>Return to Library</span>
                  <ChevronRight className="h-3.5 w-3.5 ml-1.5" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Concepts Covered with Mastery Breakdown */}
      {summary.conceptsCovered.length > 0 && (
        <Card className="border-[var(--border-color)] bg-[var(--surface)] p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-[var(--border-color)]/60 pb-3">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
              <span>Concepts Covered ({summary.conceptsCovered.length})</span>
            </h2>
            <span className="text-xs text-[var(--text-muted)]">Verified from IndexedDB</span>
          </div>

          <div className="divide-y divide-[var(--border-color)]/40">
            {summary.conceptsCovered.map((c) => {
              const badge = getMasteryBadgeClass(c.masteryLevel);
              return (
                <div
                  key={c.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {c.title}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-color)] bg-[var(--surface-raised)] text-[var(--text-muted)]">
                        Tier {c.tier}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={cn(
                        'text-[11px] font-semibold px-2 py-0.5 rounded-full border',
                        badge.bg,
                        badge.text,
                      )}
                    >
                      {badge.label}
                    </span>
                    <div className="w-24 bg-[var(--surface-raised)] rounded-full h-2 overflow-hidden border border-[var(--border-color)]">
                      <div
                        className="bg-[var(--accent-green)] h-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(0, c.masteryPercentage))}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-[var(--text-secondary)] w-9 text-right">
                      {c.masteryPercentage}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Evaluation Results (Questions Answered) */}
      {summary.evaluationResults.length > 0 && (
        <Card className="border-[var(--border-color)] bg-[var(--surface)] p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-[var(--border-color)]/60 pb-3">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Brain className="h-4 w-4 text-[var(--accent-cyan)]" aria-hidden="true" />
              <span>Recall Evaluations ({summary.evaluationResults.length})</span>
            </h2>
            <span className="text-xs text-[var(--text-muted)]">Audited Performance</span>
          </div>

          <div className="space-y-3">
            {summary.evaluationResults.map((result, idx) => (
              <div
                key={result.id || idx}
                className="p-3.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--text-primary)]">
                      {result.conceptTitle}
                    </span>
                    <span
                      className={cn(
                        'text-[10px] font-mono px-1.5 py-0.5 rounded border',
                        result.evaluationMode === 'hybrid'
                          ? 'border-[var(--primary)]/30 text-[var(--text-primary)] bg-[var(--primary)]/10'
                          : result.evaluationMode === 'judge-only'
                          ? 'border-[var(--accent-cyan)]/30 text-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10'
                          : 'border-[var(--warning)]/30 text-[var(--warning)] bg-[var(--warning)]/10',
                      )}
                      title={`Evaluated via ${result.evaluationMode} engine`}
                    >
                      {result.evaluationMode}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'text-xs font-bold px-2 py-0.5 rounded-md border',
                        result.qualityGrade >= 4
                          ? 'bg-[var(--accent-green)]/15 border-[var(--accent-green)]/30 text-[var(--accent-green)]'
                          : result.qualityGrade === 3
                          ? 'bg-[var(--accent-blue)]/15 border-[var(--accent-blue)]/30 text-[var(--accent-blue)]'
                          : 'bg-[var(--danger)]/15 border-[var(--danger)]/30 text-[var(--danger)]',
                      )}
                    >
                      Grade: q{result.qualityGrade}/5
                    </span>
                    {result.score !== null && (
                      <span className="text-xs font-mono text-[var(--text-secondary)]">
                        {result.score}%
                      </span>
                    )}
                  </div>
                </div>

                {/* Strengths & Missing Points */}
                {(result.strengths.length > 0 || result.missingKeyPoints.length > 0) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1 border-t border-[var(--border-color)]/60">
                    {result.strengths.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-[var(--accent-green)] uppercase tracking-wider">
                          Strengths
                        </span>
                        <ul className="list-disc list-inside space-y-0.5 text-[var(--text-secondary)]">
                          {result.strengths.map((s, i) => (
                            <li key={i} className="truncate">
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {result.missingKeyPoints.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-[var(--warning)] uppercase tracking-wider">
                          Key Gaps
                        </span>
                        <ul className="list-disc list-inside space-y-0.5 text-[var(--text-secondary)]">
                          {result.missingKeyPoints.map((k, i) => (
                            <li key={i} className="truncate">
                              {k}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Concepts Needing Practice Warning (q < 3) */}
      {summary.conceptsNeedingPractice.length > 0 && (
        <Card className="border-[var(--warning)]/40 bg-[var(--warning)]/5 p-5 space-y-3 shadow-sm">
          <div className="flex items-center gap-2 text-[var(--warning)]">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <h2 className="text-sm font-bold">
              Concepts Recommended for Practice ({summary.conceptsNeedingPractice.length})
            </h2>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            The following concepts received low scores (q &lt; 3). A remedial review or guided study
            session will help consolidate these prerequisites before advanced topics.
          </p>
          <div className="space-y-2 pt-1">
            {summary.conceptsNeedingPractice.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-lg border border-[var(--warning)]/30 bg-[var(--surface)] flex items-center justify-between text-xs"
              >
                <span className="font-semibold text-[var(--text-primary)]">{item.title}</span>
                <span className="text-[var(--text-muted)] italic">{item.reason}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Newly Scheduled Spaced Reviews */}
      {summary.newlyScheduledReviews.length > 0 && (
        <Card className="border-[var(--border-color)] bg-[var(--surface)] p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-[var(--border-color)]/60 pb-3">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[var(--accent-blue)]" aria-hidden="true" />
              <span>Newly Scheduled Spaced Repetitions ({summary.newlyScheduledReviews.length})</span>
            </h2>
            <span className="text-xs text-[var(--text-muted)]">SuperMemo SM-2 Engine</span>
          </div>

          <div className="divide-y divide-[var(--border-color)]/40">
            {summary.newlyScheduledReviews.map((rev) => (
              <div
                key={rev.conceptId}
                className="py-2.5 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Clock className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" aria-hidden="true" />
                  <span className="font-medium text-[var(--text-primary)] truncate">
                    {rev.conceptTitle}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11px] font-mono text-[var(--text-muted)]">
                    Interval: {rev.intervalDays}d
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] border border-[var(--accent-blue)]/30">
                    {rev.humanDueText}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Action Footer Navigation with 44px tap targets */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-[var(--border-color)]">
        <Button
          variant="ghost"
          size="sm"
          onClick={onReturnToOrganise}
          className="w-full sm:w-auto min-h-[44px] px-3 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <Layers className="h-4 w-4 mr-1.5" aria-hidden="true" />
          <span>Organise Material</span>
        </Button>

        <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto">
          <Button
            variant="secondary"
            onClick={onSwitchMode}
            className="w-full sm:w-auto min-h-[44px] px-4 text-xs border-[var(--border-color)]"
          >
            <RotateCcw className="h-4 w-4 mr-1.5" aria-hidden="true" />
            <span>Switch Mode</span>
          </Button>

          <Button
            variant="primary"
            onClick={onGoHome}
            className="w-full sm:w-auto min-h-[44px] px-4 text-xs bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] font-medium"
          >
            <span>Library Home</span>
            <ArrowRight className="h-4 w-4 ml-1.5" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
