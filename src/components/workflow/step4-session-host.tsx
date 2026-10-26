'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Pause,
  LogOut,
  Sparkles,
  Brain,
  Clock,
  BookOpen,
  FileText,
  AlertCircle,
  WifiOff,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { TutorHeader } from '@/components/tutor/TutorHeader';
import { QuestionCard } from '@/components/tutor/QuestionCard';
import { FeedbackCard } from '@/components/tutor/FeedbackCard';
import { ContextActionBar } from '@/components/tutor/ContextActionBar';
import { SafeMarkdown } from '@/components/tutor/SafeMarkdown';
import { useLearningSession } from '@/features/conversation/use-learning-session';
import { useSessionController } from '@/features/modes/controller';
import { SessionCompletionView } from '@/components/workflow/session-completion-view';
import { getStorage } from '@/lib/db/bootstrap';
import { getChunkExcerpt } from '@/features/ingestion/provenance';
import { useWorkspaceStore } from '@/lib/state/workspace-store';
import { type LearningMode } from '@/features/workflow/types';
import { cn } from '@/lib/utils/cn';

export interface Step4SessionHostProps {
  materialId: string;
  sessionId: string;
  mode?: LearningMode;
  className?: string;
}

export function Step4SessionHost({
  materialId,
  sessionId,
  mode: initialMode,
  className,
}: Step4SessionHostProps) {
  const router = useRouter();
  const isOnline = useWorkspaceStore((state) => state.isOnline);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  // Shared Session Controller (Phase R4)
  const {
    mode: controllerMode,
    status: sessionStatus,
    progress,
    summary,
    currentUnit,
    pauseSession,
    completeSession,
    abandonSession,
    advanceToNextConcept,
  } = useSessionController({
    materialId,
    sessionId,
    initialMode,
  });

  // Mount existing mode engine via useLearningSession
  const {
    machineState,
    session,
    concept,
    document,
    sourceChunks,
    currentQuestion,
    draftAnswer,
    selectedConfidence,
    lastEvaluation,
    isFallbackQuestion,
    revisionPlan,
    revisionExplanation,
    isRevisionLoading,
    isLoading,
    error,
    restoredNotice,
    clearRestoredNotice,
    setDraftAnswer,
    setSelectedConfidence,
    handleReadyForRecall,
    handleRequestQuestion,
    handleSubmitAnswer,
    handleContinue: rawHandleContinue,
    handleTryAgain,
    handleRevise,
    handleReviewLater,
    handleSelectConcept,
  } = useLearningSession({ sessionId });

  // Move focus to step heading on mount
  React.useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const effectiveMode: LearningMode =
    controllerMode ||
    initialMode ||
    (session?.machineState === 'WAITING_FOR_RECALL'
      ? 'recall'
      : session?.machineState === 'REVISION_DUE'
      ? 'revision'
      : 'study');

  // Handle continuing to the next concept
  const handleContinue = React.useCallback(async () => {
    await rawHandleContinue();
    if (machineState === 'FEEDBACK' || machineState === 'NEXT_CONCEPT') {
      await advanceToNextConcept();
    }
  }, [rawHandleContinue, machineState, advanceToNextConcept]);

  // Finish session cleanly
  const handleEndSession = async () => {
    try {
      await completeSession();
    } catch (err) {
      console.error('Failed to end session cleanly:', err);
    }
  };

  // Pause session and return to Step 3
  const handlePause = async () => {
    try {
      await pauseSession();
    } catch (err) {
      console.error('Error saving session on pause:', err);
    }
    router.push(`/learn/${materialId}/mode`);
  };

  // Exit session and return to Home (marks abandoned, keeps all records)
  const handleExit = async () => {
    try {
      await abandonSession();
    } catch (err) {
      console.error('Error saving session on exit:', err);
    }
    router.push('/learn');
  };

  // Navigation handlers from completion view
  const handleContinueNextUnit = async (nextUnitId: string) => {
    try {
      const repos = getStorage();
      const wf = await repos.workflowState.get(materialId);
      if (wf) {
        wf.selection = { kind: 'UNITS', unitIds: [nextUnitId] };
        wf.updatedAt = new Date().toISOString();
        await repos.workflowState.put(wf);
      }
    } catch (err) {
      console.error('Failed to update selection to next unit:', err);
    }
    router.push(`/learn/${materialId}/mode`);
  };

  const primaryChunk = sourceChunks.length > 0 ? sourceChunks[0] : null;
  const sourceExcerpt =
    document && primaryChunk ? getChunkExcerpt(document, primaryChunk, 200) : null;

  // Completion view if completed
  if (sessionStatus === 'completed' && summary) {
    return (
      <SessionCompletionView
        summary={summary}
        materialId={materialId}
        onContinueNextUnit={handleContinueNextUnit}
        onSwitchMode={() => router.push(`/learn/${materialId}/mode`)}
        onReturnToOrganise={() => router.push(`/learn/${materialId}/organise`)}
        onGoHome={() => router.push('/learn')}
        className={className}
      />
    );
  }

  return (
    <div className={cn('space-y-6 max-w-4xl mx-auto py-4 sm:py-6', className)}>
      {/* Unified Session Header across all modes */}
      <header
        aria-label="Active session status"
        className="rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
      >
        <div className="space-y-1.5 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border',
                effectiveMode === 'study' &&
                  'bg-[var(--primary)]/15 text-[var(--text-primary)] border-[var(--primary)]/30',
                effectiveMode === 'recall' &&
                  'bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] border-[var(--accent-cyan)]/30',
                effectiveMode === 'revision' &&
                  'bg-[var(--warning)]/15 text-[var(--warning)] border-[var(--warning)]/30',
              )}
            >
              {effectiveMode === 'study' && <Sparkles className="h-3 w-3" aria-hidden="true" />}
              {effectiveMode === 'recall' && <Brain className="h-3 w-3" aria-hidden="true" />}
              {effectiveMode === 'revision' && <Clock className="h-3 w-3" aria-hidden="true" />}
              <span className="capitalize">{effectiveMode} Mode</span>
            </span>

            <span
              className="text-xs text-[var(--text-muted)] truncate max-w-[200px]"
              title={document?.filename}
            >
              {document?.filename ?? 'Study Material'}
            </span>

            {currentUnit?.title && (
              <span className="text-xs text-[var(--text-muted)] border-l border-[var(--border-color)] pl-2 truncate max-w-[200px]">
                {currentUnit.title}
              </span>
            )}
          </div>

          <div className="flex items-baseline gap-2 flex-wrap">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-lg sm:text-xl font-bold text-[var(--text-primary)] truncate focus:outline-none"
            >
              {concept?.title ?? 'Active Learning Session'}
            </h1>
            <span className="text-xs font-mono text-[var(--text-muted)] shrink-0">
              {progress.stageLabel}
            </span>
          </div>

          {/* Granular Progress Bar */}
          <div className="w-full max-w-md bg-[var(--surface-raised)] rounded-full h-1.5 overflow-hidden border border-[var(--border-color)]">
            <div
              className="bg-[var(--primary)] h-full transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
            />
          </div>
        </div>

        {/* Action Controls: Finish, Pause & Exit with 44px tap targets */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleEndSession}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent-green)] border border-[var(--border-color)] bg-[var(--surface-raised)] min-h-[44px] px-3 font-medium"
            aria-label="Finish study session and view summary"
          >
            <CheckCircle2 className="h-4 w-4 mr-1 text-[var(--accent-green)]" aria-hidden="true" />
            <span>Finish</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePause}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)] bg-[var(--surface-raised)] min-h-[44px] px-3 font-medium"
            aria-label="Pause session and return to mode selection"
          >
            <Pause className="h-4 w-4 mr-1" aria-hidden="true" />
            <span>Pause</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExit}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--danger)] border border-[var(--border-color)] bg-[var(--surface-raised)] min-h-[44px] px-3 font-medium"
            aria-label="Exit session and return to workflow home"
          >
            <LogOut className="h-4 w-4 mr-1" aria-hidden="true" />
            <span>Exit</span>
          </Button>
        </div>
      </header>

      {/* Active Session Content */}
      <div className="space-y-6">
        {/* Restored notice */}
        {restoredNotice && (
          <div
            role="status"
            className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-[var(--accent-blue)]/40 bg-[var(--accent-blue)]/10 text-xs sm:text-sm text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <Sparkles className="h-4 w-4 text-[var(--accent-blue)] shrink-0" aria-hidden="true" />
              <span>{restoredNotice}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearRestoredNotice}
              className="h-7 w-7 p-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              aria-label="Dismiss session restore notice"
            >
              &times;
            </Button>
          </div>
        )}

        {/* Offline Notice */}
        {!isOnline && (
          <aside
            role="status"
            aria-live="polite"
            className="flex items-center gap-2.5 p-3.5 rounded-xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 text-xs sm:text-sm text-[var(--text-primary)]"
          >
            <WifiOff className="h-4 w-4 text-[var(--warning)] shrink-0" aria-hidden="true" />
            <span className="font-medium">
              The tutor couldn’t connect right now. Your saved learning data is still available.
            </span>
          </aside>
        )}

        {/* Error Notice */}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2.5 p-3.5 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 text-xs sm:text-sm text-[var(--danger)]"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="font-medium">
              {/connect|offline|network|fetch|disconnected/i.test(error)
                ? 'The tutor couldn’t connect right now. Your saved learning data is still available.'
                : error}
            </span>
          </div>
        )}

        {/* Tutor Header */}
        <TutorHeader
          concept={concept}
          machineState={machineState}
          qualityGrade={lastEvaluation?.qualityGrade}
          sourceMode={session?.sourceMode}
          documentName={document?.filename}
        />

        {/* Socratic Explanation Section */}
        {concept && (
          <section aria-labelledby="concept-explanation-heading">
            <Card className="border-[var(--border-color)] bg-[var(--surface)] shadow-sm">
              <CardHeader className="pb-3 border-b border-[var(--border-color)]/60">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
                  <CardTitle
                    id="concept-explanation-heading"
                    className="text-sm sm:text-base font-semibold text-[var(--text-primary)]"
                  >
                    Canonical Explanation & Mechanism
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <SafeMarkdown
                  content={concept.canonicalExplanation || concept.summary}
                  className="text-sm leading-relaxed text-[var(--text-primary)]"
                />

                {concept.keyTerms && concept.keyTerms.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] font-semibold text-[var(--text-muted)] mr-1">
                      Key Terms:
                    </span>
                    {concept.keyTerms.map((term, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-full text-[11px] bg-[var(--surface-raised)] border border-[var(--border-color)] text-[var(--accent-blue)]"
                      >
                        {term}
                      </span>
                    ))}
                  </div>
                )}

                {sourceExcerpt && (
                  <div className="p-3 rounded-lg bg-[var(--surface-raised)]/60 border border-[var(--border-color)] space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                      <span className="font-semibold text-[var(--text-secondary)] flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Source Provenance</span>
                      </span>
                      {primaryChunk?.pageStart && (
                        <span>
                          Page {primaryChunk.pageStart}
                          {primaryChunk.pageEnd && primaryChunk.pageEnd !== primaryChunk.pageStart
                            ? `–${primaryChunk.pageEnd}`
                            : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] italic leading-relaxed">
                      &quot;{sourceExcerpt.fullExcerpt}&quot;
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        )}

        {/* Active Recall Question Card */}
        {currentQuestion &&
          (machineState === 'WAITING_FOR_ANSWER' || machineState === 'EVALUATING') && (
            <section aria-labelledby="active-recall-question">
              <QuestionCard
                question={currentQuestion}
                draftAnswer={draftAnswer}
                selectedConfidence={selectedConfidence}
                onAnswerChange={setDraftAnswer}
                onConfidenceChange={setSelectedConfidence}
                onSubmit={handleSubmitAnswer}
                isLoading={isLoading}
                isFallback={isFallbackQuestion}
                onTryAnotherQuestion={handleRequestQuestion}
              />
            </section>
          )}

        {/* Revision Refresher Explanation */}
        {revisionExplanation && (
          <section aria-labelledby="revision-refresher-heading">
            <Card className="border-[var(--warning)]/40 bg-[var(--surface)] shadow-md">
              <CardHeader className="pb-3 border-b border-[var(--border-color)]">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-[var(--warning)]" aria-hidden="true" />
                  <CardTitle
                    id="revision-refresher-heading"
                    className="text-sm sm:text-base font-semibold text-[var(--text-primary)]"
                  >
                    Simplified Refresher: {concept?.title}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <SafeMarkdown
                  content={revisionExplanation}
                  className="text-sm leading-relaxed text-[var(--text-primary)]"
                />
                <div className="pt-2 flex items-center justify-end">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleRequestQuestion}
                    disabled={isLoading || isRevisionLoading}
                    isLoading={isRevisionLoading}
                    className="text-xs h-8"
                  >
                    <span>Test Recall at Guided Level &rarr;</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Evaluation Feedback */}
        {lastEvaluation &&
          (machineState === 'FEEDBACK' ||
            machineState === 'REVISION_DUE' ||
            machineState === 'NEXT_CONCEPT') && (
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
                onContinue={handleContinue}
                onRevise={handleRevise}
                onTryAgain={handleTryAgain}
                onSelectPrerequisite={handleSelectConcept}
              />
            </section>
          )}

        {/* Context Action Bar */}
        <ContextActionBar
          machineState={machineState}
          onReadyForRecall={handleReadyForRecall}
          onRequestQuestion={handleRequestQuestion}
          onContinue={handleContinue}
          onTryAgain={handleTryAgain}
          onRevise={handleRevise}
          onReviewLater={handleReviewLater}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
