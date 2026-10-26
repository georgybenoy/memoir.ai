'use client';

import * as React from 'react';
import { Calendar, Brain, BookOpen, Clock, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { QuestionCard } from '@/components/tutor/QuestionCard';
import { FeedbackCard } from '@/components/tutor/FeedbackCard';
import {
  type ConceptRecord,
  type LearningUnitRecord,
  type RecallQuestionRecord,
} from '@/types/domain';
import { type AnswerEvaluationOutput } from '@/features/evaluation';
import { type RevisionPlan } from '@/features/spaced-repetition/revision';
import { type MachineState } from '@/features/conversation/types';
import { cn } from '@/lib/utils/cn';

export interface RevisionSessionViewProps {
  concept: ConceptRecord | null;
  unit: LearningUnitRecord | null;
  machineState: MachineState;
  currentQuestion: RecallQuestionRecord | null;
  draftAnswer: string;
  selectedConfidence: 1 | 2 | 3 | null;
  lastEvaluation: AnswerEvaluationOutput | null;
  isFallbackQuestion: boolean;
  revisionPlan: RevisionPlan | null;
  isLoading: boolean;
  dueCount: number;
  nextDueText?: string | null;
  nextScheduledReviewDate?: string | null;
  onRequestQuestion: () => void | Promise<void>;
  onAnswerChange: (answer: string) => void;
  onConfidenceChange: (confidence: 1 | 2 | 3) => void;
  onSubmitAnswer: () => void | Promise<void>;
  onContinue: () => void | Promise<void>;
  onTryAgain: () => void | Promise<void>;
  onRevise: () => void | Promise<void>;
  onSelectConcept: (conceptId: string) => void | Promise<void>;
  onSwitchToStudy: () => void;
  onSwitchToRecall: () => void;
  onExit: () => void | Promise<void>;
  className?: string;
}

export function RevisionSessionView({
  concept,
  unit,
  machineState,
  currentQuestion,
  draftAnswer,
  selectedConfidence,
  lastEvaluation,
  isFallbackQuestion,
  revisionPlan,
  isLoading,
  dueCount,
  nextDueText,
  nextScheduledReviewDate,
  onRequestQuestion,
  onAnswerChange,
  onConfidenceChange,
  onSubmitAnswer,
  onContinue,
  onTryAgain,
  onRevise,
  onSelectConcept,
  onSwitchToStudy,
  onSwitchToRecall,
  onExit,
  className,
}: RevisionSessionViewProps) {
  // 1. HONEST 0-DUE EMPTY STATE
  if (dueCount === 0 && !concept) {
    return (
      <div className={cn('space-y-6', className)}>
        <Card className="border-[var(--border-color)] bg-[var(--surface)] p-6 sm:p-8 rounded-2xl shadow-xs text-center">
          <CardContent className="space-y-5 pt-3 max-w-lg mx-auto">
            <div className="p-3.5 w-fit mx-auto rounded-full bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/20">
              <Calendar className="h-8 w-8" aria-hidden="true" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                All Retention Reviews are Up to Date
              </h2>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                Zero concepts in this selection are currently due for spaced review. The SuperMemo SM-2 algorithm will schedule your next session before forgetting sets in.
              </p>

              {nextDueText ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[var(--surface-raised)] border border-[var(--border-color)] text-[var(--text-primary)]">
                  <Clock className="h-3.5 w-3.5 text-[var(--warning)]" aria-hidden="true" />
                  <span>Next scheduled review: <strong>{nextDueText}</strong></span>
                </div>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">
                  No upcoming reviews currently scheduled for this selection.
                </p>
              )}
            </div>

            <div className="pt-2 border-t border-[var(--border-color)]/60 space-y-3">
              <span className="text-xs font-semibold text-[var(--text-secondary)] block">
                Choose an alternative mode to keep learning today:
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button
                  variant="primary"
                  onClick={onSwitchToStudy}
                  className="min-h-[44px] text-xs font-medium bg-[var(--primary)] text-white hover:bg-[var(--primary)]/90"
                  aria-label="Study Concepts: Start Socratic study instead"
                >
                  <BookOpen className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  <span>Study Concepts</span>
                </Button>

                <Button
                  variant="secondary"
                  onClick={onSwitchToRecall}
                  className="min-h-[44px] text-xs font-medium border-[var(--border-color)] bg-[var(--surface-raised)] hover:border-[var(--accent-cyan)] hover:text-[var(--accent-cyan)]"
                  aria-label="Recall Practice: Start active recall instead"
                >
                  <Brain className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  <span>Recall Practice</span>
                </Button>
              </div>

              <div className="pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onExit}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <span>Return to Library</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 2. In-Flight Review Item Preparation State
  if (
    machineState === 'GENERATING_QUESTION' ||
    (isLoading && !currentQuestion && dueCount > 0)
  ) {
    return (
      <div className={cn('space-y-6', className)}>
        <Card className="border-[var(--border-color)] bg-[var(--surface)] p-8 rounded-2xl shadow-xs text-center" role="status" aria-live="polite">
          <CardContent className="space-y-5 pt-4 max-w-md mx-auto">
            <div className="relative mx-auto w-16 h-16 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-[var(--warning)]/25 animate-ping" />
              <div className="relative p-3.5 rounded-full bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/30">
                <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-base sm:text-lg font-semibold text-[var(--text-primary)]">
                Preparing Retention Review Item…
              </h2>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Loading retention reinforcement prompt for {concept?.title || 'this concept'} based on your SM-2 schedule.
              </p>
            </div>
            <div className="inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-full bg-[var(--warning)]/10 border border-[var(--warning)]/20 text-xs text-[var(--warning)] font-mono">
              <span className="w-2 h-2 rounded-full bg-[var(--warning)] animate-pulse" />
              <span>Retrieving flashcard & prompt context</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 3. Active Review Question Prompt State
  if (
    currentQuestion &&
    (machineState === 'WAITING_FOR_ANSWER' || machineState === 'EVALUATING')
  ) {
    return (
      <div className={cn('space-y-6', className)}>
        <div className="flex items-center justify-between border-b border-[var(--border-color)]/60 pb-2">
          <span className="text-xs font-semibold text-[var(--warning)] uppercase tracking-wider flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Spaced Revision Active{unit?.title ? ` • ${unit.title}` : ''}</span>
          </span>
          <span className="text-xs text-[var(--text-muted)] font-mono">
            {dueCount} {dueCount === 1 ? 'item due' : 'items due'}
          </span>
        </div>

        <section aria-labelledby="active-revision-question">
          <QuestionCard
            question={currentQuestion}
            draftAnswer={draftAnswer}
            selectedConfidence={selectedConfidence}
            onAnswerChange={onAnswerChange}
            onConfidenceChange={onConfidenceChange}
            onSubmit={onSubmitAnswer}
            isLoading={isLoading || machineState === 'EVALUATING'}
            isFallback={isFallbackQuestion}
            onTryAnotherQuestion={onRequestQuestion}
          />
        </section>
      </div>
    );
  }

  // 3. Feedback & Next Scheduled Review Date State
  if (
    lastEvaluation &&
    (machineState === 'FEEDBACK' || machineState === 'REVISION_DUE' || machineState === 'NEXT_CONCEPT')
  ) {
    return (
      <div className={cn('space-y-6', className)}>
        {/* Next Review Schedule Banner */}
        {nextScheduledReviewDate && (
          <div
            role="status"
            className="p-3.5 rounded-xl border border-[var(--accent-green)]/30 bg-[var(--accent-green)]/10 text-xs sm:text-sm text-[var(--text-primary)] flex items-center justify-between gap-3 shadow-xs"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[var(--accent-green)] shrink-0" aria-hidden="true" />
              <span>
                Retention interval updated: Next review scheduled for{' '}
                <strong className="text-[var(--text-primary)]">{nextScheduledReviewDate}</strong>.
              </span>
            </div>
          </div>
        )}

        <section aria-labelledby="revision-feedback">
          <FeedbackCard
            evaluation={lastEvaluation}
            weakPrerequisite={
              revisionPlan?.weakPrerequisite
                ? {
                    id: revisionPlan.weakPrerequisite.id,
                    title: revisionPlan.weakPrerequisite.title,
                  }
                : undefined
            }
            onContinue={onContinue}
            onRevise={onRevise}
            onTryAgain={onTryAgain}
            onSelectPrerequisite={onSelectConcept}
          />
        </section>
      </div>
    );
  }

  // 4. Default: Ready for Review Item
  return (
    <div className={cn('space-y-6', className)}>
      <Card className="border-[var(--border-color)] bg-[var(--surface)] p-6 sm:p-8 rounded-2xl shadow-xs text-center">
        <CardContent className="space-y-4 pt-2 max-w-lg mx-auto">
          <div className="p-3 w-fit mx-auto rounded-full bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/20">
            <Calendar className="h-7 w-7" aria-hidden="true" />
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
              Scheduled Retention Review: {concept?.title}
            </h2>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
              This concept is due for retention reinforcement based on your past review intervals.
            </p>
          </div>

          <div className="pt-2 flex justify-center">
            <Button
              variant="primary"
              onClick={onRequestQuestion}
              disabled={isLoading}
              isLoading={isLoading}
              loadingText="Loading Review Item…"
              className="min-h-[44px] px-6 text-xs sm:text-sm font-semibold bg-[var(--warning)] text-black hover:bg-[var(--warning)]/90"
            >
              <span>Begin Review Question</span>
              <ArrowRight className="h-4 w-4 ml-2" aria-hidden="true" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
