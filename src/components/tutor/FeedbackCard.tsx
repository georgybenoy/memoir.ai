'use client';

import * as React from 'react';
import { type AnswerEvaluationOutput } from '@/features/evaluation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { SafeMarkdown } from './SafeMarkdown';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Lightbulb,
  ArrowRight,
  ShieldCheck,
  Info,
  Clock,
  Compass,
  BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { EVALUATION_MODE_LABELS } from '@/lib/config/scoring';
import { Button } from '@/components/ui/button';

export interface FeedbackCardProps {
  evaluation: AnswerEvaluationOutput;
  weakPrerequisite?: { id: string; title: string };
  onContinue?: () => void | Promise<void>;
  onRevise?: () => void | Promise<void>;
  onTryAgain?: () => void | Promise<void>;
  onSelectPrerequisite?: (conceptId: string) => void | Promise<void>;
}

export const FeedbackCard: React.FC<FeedbackCardProps> = ({
  evaluation,
  weakPrerequisite,
  onContinue,
  onRevise,
  onTryAgain,
  onSelectPrerequisite,
}) => {
  const isPassed = evaluation.qualityGrade >= 3;
  const isPending = evaluation.pendingEvaluation;
  const isJudgeOnly = evaluation.evaluationMode === 'judge_only';

  return (
    <Card
      className={cn(
        'border shadow-lg space-y-4',
        isPending
          ? 'border-[var(--accent-blue)]/40 bg-[var(--surface-raised)]/80'
          : isPassed
            ? 'border-[var(--success)]/40 bg-[var(--surface-raised)]/80'
            : 'border-[var(--warning)]/40 bg-[var(--surface-raised)]/80',
      )}
    >
      {/* Screen-reader announcement */}
      <div className="sr-only" role="status" aria-live="polite">
        {isPending
          ? 'Answer saved locally. Full evaluation is pending.'
          : `Recall evaluation completed. Quality grade ${evaluation.qualityGrade} of 5. ${isPassed ? 'Passing score' : 'Revision recommended'}.`}
      </div>

      <CardHeader className="pb-3 border-b border-[var(--border-color)]/60">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'h-9 w-9 rounded-full flex items-center justify-center shrink-0',
                isPending
                  ? 'bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]'
                  : isPassed
                    ? 'bg-[var(--success)]/15 text-[var(--success)]'
                    : 'bg-[var(--warning)]/15 text-[var(--warning)]',
              )}
            >
              {isPending ? (
                <Clock className="h-5 w-5" aria-hidden="true" />
              ) : isPassed ? (
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              ) : (
                <AlertCircle className="h-5 w-5" aria-hidden="true" />
              )}
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
                {isPending
                  ? 'Evaluation Pending'
                  : isPassed
                    ? 'Strong Conceptual Recall'
                    : 'Concept Needs Revision'}
              </CardTitle>
              {!isPending && (
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  SM-2 Quality Grade: <strong>{evaluation.qualityGrade} / 5</strong>
                  {evaluation.compositeScore !== undefined && (
                    <span> • Composite Score: {evaluation.compositeScore}%</span>
                  )}
                  {isJudgeOnly && evaluation.judgeScore !== undefined && (
                    <span> • Judge Score: {evaluation.judgeScore}%</span>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Evaluation Mode Badge */}
          <div className="flex flex-col sm:items-end gap-1">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border',
                evaluation.evaluationMode === 'hybrid'
                  ? 'bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/30'
                  : evaluation.evaluationMode === 'judge_only'
                    ? 'bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border-[var(--accent-blue)]/30'
                    : 'bg-[var(--surface-raised)] text-[var(--text-muted)] border-[var(--border-color)]',
              )}
            >
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              <span>{EVALUATION_MODE_LABELS[evaluation.evaluationMode] ?? evaluation.evaluationMode}</span>
            </span>
            {isJudgeOnly && (
              <span className="text-[10px] text-[var(--text-muted)] italic">
                Semantic check unavailable; composite score omitted
              </span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Next Scheduled Review (SM-2 Interval) */}
        {evaluation.nextReviewDue && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[var(--surface)] border border-[var(--border-color)] text-xs text-[var(--text-secondary)]">
            <Clock className="h-4 w-4 text-[var(--accent-blue)] shrink-0" aria-hidden="true" />
            <div className="flex flex-wrap items-center gap-1.5">
              <strong className="text-[var(--text-primary)]">Next Scheduled Review:</strong>
              <span className="font-medium text-[var(--accent-blue)]">
                {evaluation.intervalDays !== undefined && evaluation.intervalDays === 1
                  ? 'Due tomorrow'
                  : evaluation.intervalDays === 0
                    ? 'Due today'
                    : evaluation.intervalDays !== undefined
                      ? `In ${evaluation.intervalDays} days`
                      : 'Scheduled'}
              </span>
              <span className="text-[var(--text-muted)]">
                ({new Date(evaluation.nextReviewDue).toLocaleDateString(undefined, { dateStyle: 'medium' })})
              </span>
            </div>
          </div>
        )}

        {/* Constructive Path for Weak Answers & Refresher Offer */}
        {!isPassed && !isPending && (
          <div className="p-3.5 rounded-lg bg-[var(--warning)]/10 border border-[var(--warning)]/30 text-xs text-[var(--text-primary)] space-y-2.5">
            <div className="flex items-start gap-2.5">
              <Compass className="h-4 w-4 text-[var(--warning)] shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <strong className="font-semibold text-[var(--warning)]">
                  Concept Refresher Recommended
                </strong>
                <p className="text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                  Recall quality was below passing threshold (grade {evaluation.qualityGrade}/5).
                  Instead of simply marking this wrong, let&apos;s review a simplified breakdown of the key points before attempting a retry question.
                </p>
              </div>
            </div>

            {weakPrerequisite && (
              <div className="p-2.5 rounded-md bg-[var(--surface)] border border-[var(--warning)]/40 text-xs space-y-1">
                <span className="font-semibold text-[var(--warning)]">
                  Prerequisite Foundation Needs Review:
                </span>
                <p className="text-[var(--text-secondary)]">
                  Review this prerequisite (&ldquo;{weakPrerequisite.title}&rdquo;), then try again.
                </p>
                {onSelectPrerequisite && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onSelectPrerequisite(weakPrerequisite.id)}
                    className="mt-1 h-7 text-xs"
                  >
                    Go to {weakPrerequisite.title} &rarr;
                  </Button>
                )}
              </div>
            )}

            {onRevise && (
              <div className="pt-1 flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onRevise}
                  className="h-8 text-xs font-medium text-[var(--warning)] border-[var(--warning)]/30 bg-[var(--surface)] hover:bg-[var(--warning)]/10 cursor-pointer"
                >
                  <BookOpen className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  <span>Review Refresher Explanation</span>
                </Button>
                {onTryAgain && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onTryAgain}
                    className="h-8 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <span>Retry Question Directly</span>
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Core Rationale */}
        <div className="p-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border-color)]">
          <h4 className="text-xs font-semibold text-[var(--text-primary)] mb-1.5 flex items-center gap-1.5">
            <Lightbulb className="h-4 w-4 text-[var(--accent-cyan)]" aria-hidden="true" />
            <span>Tutor Feedback</span>
          </h4>
          <SafeMarkdown content={evaluation.rationale} />
        </div>

        {/* Demonstrated Strengths */}
        {evaluation.strengths.length > 0 && (
          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold text-[var(--success)] flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Demonstrated Strengths</span>
            </h4>
            <ul className="space-y-1 pl-6 list-disc text-xs text-[var(--text-secondary)]">
              {evaluation.strengths.map((s, idx) => (
                <li key={idx}>{s}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Missing Key Points */}
        {evaluation.missingKeyPoints.length > 0 && (
          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold text-[var(--warning)] flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Missing Key Points</span>
            </h4>
            <ul className="space-y-1 pl-6 list-disc text-xs text-[var(--text-secondary)]">
              {evaluation.missingKeyPoints.map((m, idx) => (
                <li key={idx}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Misconceptions with Plain-Language Corrections */}
        {evaluation.misconceptionDetails && evaluation.misconceptionDetails.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-[var(--danger)] flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Misconceptions & Corrections</span>
            </h4>
            <div className="space-y-2">
              {evaluation.misconceptionDetails.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-[var(--danger)]/5 border border-[var(--danger)]/20 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-[var(--danger)] font-semibold">{item.description}</strong>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border-color)]">
                      {item.severity}
                    </span>
                  </div>
                  <p className="text-[var(--text-secondary)] leading-relaxed">
                    <strong className="text-[var(--text-primary)]">Correction: </strong>
                    {item.correction}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : evaluation.misconceptions.length > 0 ? (
          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold text-[var(--danger)] flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Misconceptions Identified</span>
            </h4>
            <ul className="space-y-1 pl-6 list-disc text-xs text-[var(--text-secondary)]">
              {evaluation.misconceptions.map((disc, idx) => (
                <li key={idx}>{disc}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Correction Guidance */}
        {evaluation.correctionGuidance && (
          <div className="p-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-color)] text-xs text-[var(--text-secondary)] space-y-1">
            <strong className="text-[var(--text-primary)] flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5 text-[var(--accent-cyan)]" aria-hidden="true" />
              <span>How to Improve</span>
            </strong>
            <p className="leading-relaxed">{evaluation.correctionGuidance}</p>
          </div>
        )}

        {/* Confidence Metacognitive Calibration */}
        {evaluation.confidenceFeedback && (
          <div className="p-2.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-color)] text-xs text-[var(--text-secondary)]">
            <strong className="text-[var(--text-primary)]">Confidence Calibration: </strong>
            <span>{evaluation.confidenceFeedback}</span>
          </div>
        )}

        {/* Suggested Next Action */}
        <div className="flex items-center gap-2 pt-2 text-xs text-[var(--accent-blue)]">
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>Next Step: </strong>
            {evaluation.nextAction}
          </span>
        </div>

        {/* Action Controls */}
        {(onContinue || onTryAgain || (!isPassed && onRevise)) && (
          <div className="pt-3 border-t border-[var(--border-color)]/60 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {onTryAgain && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onTryAgain}
                  className="h-9 px-4 text-xs font-medium cursor-pointer"
                  aria-label="Try again: Attempt another recall question"
                >
                  <span>Try again</span>
                </Button>
              )}
              {!isPassed && onRevise && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onRevise}
                  className="h-9 px-4 text-xs font-medium text-[var(--warning)] border-[var(--warning)]/30 bg-[var(--surface)] hover:bg-[var(--warning)]/10 cursor-pointer"
                  aria-label="Revise Concept: Review study material"
                >
                  <BookOpen className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  <span>Revise Concept</span>
                </Button>
              )}
            </div>
            {onContinue && (
              <Button
                variant="primary"
                size="sm"
                onClick={onContinue}
                className="h-9 px-5 text-xs font-semibold bg-[var(--primary)] text-white hover:bg-[var(--primary)]/90 cursor-pointer"
                aria-label="Continue: Proceed to next concept or question"
              >
                <span>Continue &rarr;</span>
              </Button>
            )}
          </div>
        )}

        {/* AI Disclaimer Footnote */}
        <div className="pt-2 border-t border-[var(--border-color)]/50 flex items-start gap-1.5 text-[10px] text-[var(--text-muted)] leading-relaxed">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Automated feedback and scores are heuristic guides for personal study. They are not
            scientifically validated or equivalent to accredited human grading.
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
