'use client';

import * as React from 'react';
import { Sparkles, Brain, Loader2 } from 'lucide-react';
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

export interface RecallSessionViewProps {
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
  onRequestQuestion: () => void | Promise<void>;
  onAnswerChange: (answer: string) => void;
  onConfidenceChange: (confidence: 1 | 2 | 3) => void;
  onSubmitAnswer: () => void | Promise<void>;
  onContinue: () => void | Promise<void>;
  onTryAgain: () => void | Promise<void>;
  onRevise: () => void | Promise<void>;
  onSelectConcept: (conceptId: string) => void | Promise<void>;
  className?: string;
}

export function RecallSessionView({
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
  onRequestQuestion,
  onAnswerChange,
  onConfidenceChange,
  onSubmitAnswer,
  onContinue,
  onTryAgain,
  onRevise,
  onSelectConcept,
  className,
}: RecallSessionViewProps) {
  // 1. Ready for Question / Waiting for Recall State
  if (machineState === 'WAITING_FOR_RECALL' || (!currentQuestion && machineState !== 'FEEDBACK' && machineState !== 'REVISION_DUE')) {
    return (
      <div className={cn('space-y-6', className)}>
        <Card className="border-[var(--border-color)] bg-[var(--surface)] p-6 sm:p-8 rounded-2xl shadow-xs text-center">
          <CardContent className="space-y-4 pt-4 max-w-lg mx-auto">
            <div className="p-3.5 w-fit mx-auto rounded-full bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/20">
              <Brain className="h-8 w-8" aria-hidden="true" />
            </div>

            <div className="space-y-1.5">
              {unit?.title && (
                <span className="text-xs font-semibold text-[var(--accent-cyan)] uppercase tracking-wider">
                  {unit.title}
                </span>
              )}
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                Active Retrieval Practice: {concept?.title}
              </h2>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                Test your retrieval strength by answering an open-ended question in your own words.
                Questions are calibrated to your adaptive difficulty level.
              </p>
            </div>

            <div className="pt-3 flex justify-center">
              <Button
                variant="primary"
                onClick={onRequestQuestion}
                disabled={isLoading}
                isLoading={isLoading}
                loadingText="Generating Practice Question…"
                className="min-h-[44px] px-6 text-xs sm:text-sm font-semibold bg-[var(--primary)] text-white hover:bg-[var(--primary)]/90"
                aria-label="Generate Practice Question: Grounded active recall"
              >
                <Sparkles className="h-4 w-4 mr-2" aria-hidden="true" />
                <span>Generate Practice Question</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 2. Generating Question In-Flight State
  if (machineState === 'GENERATING_QUESTION') {
    return (
      <div className={cn('space-y-6', className)}>
        <Card className="border-[var(--border-color)] bg-[var(--surface)] p-8 rounded-2xl shadow-xs animate-pulse text-center">
          <CardContent className="space-y-4 pt-4 max-w-md mx-auto">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--accent-cyan)] mx-auto" aria-hidden="true" />
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Calibrating Grounded Practice Question…
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Synthesizing key mechanism points from your study notes.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 3. Question Active / Awaiting Answer State
  if (
    currentQuestion &&
    (machineState === 'WAITING_FOR_ANSWER' || machineState === 'EVALUATING')
  ) {
    return (
      <div className={cn('space-y-6', className)}>
        <section aria-labelledby="active-recall-question">
          <QuestionCard
            question={currentQuestion}
            draftAnswer={draftAnswer}
            selectedConfidence={selectedConfidence}
            onAnswerChange={onAnswerChange}
            onConfidenceChange={onConfidenceChange}
            onSubmit={onSubmitAnswer}
            isLoading={isLoading}
            isFallback={isFallbackQuestion}
            onTryAnotherQuestion={onRequestQuestion}
          />
        </section>
      </div>
    );
  }

  // 4. Feedback & Review State
  if (
    lastEvaluation &&
    (machineState === 'FEEDBACK' || machineState === 'REVISION_DUE' || machineState === 'NEXT_CONCEPT')
  ) {
    return (
      <div className={cn('space-y-6', className)}>
        <section aria-labelledby="recall-feedback">
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

  // Default Fallback
  return (
    <div className={cn('space-y-6', className)}>
      <Card className="border-[var(--border-color)] bg-[var(--surface)] p-6 rounded-2xl text-center">
        <CardContent className="space-y-3 pt-2">
          <p className="text-xs text-[var(--text-secondary)]">
            Ready to continue recall practice for {concept?.title}.
          </p>
          <Button variant="primary" size="sm" onClick={onRequestQuestion} className="text-xs">
            <span>Continue Recall &rarr;</span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
