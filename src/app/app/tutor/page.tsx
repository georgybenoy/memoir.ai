'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { WorkspaceLayout } from '@/components/workspace/layout';
import { Container } from '@/components/ui/container';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { TutorHeader } from '@/components/tutor/TutorHeader';
import { QuestionCard } from '@/components/tutor/QuestionCard';
import { FeedbackCard } from '@/components/tutor/FeedbackCard';
import { ContextActionBar } from '@/components/tutor/ContextActionBar';
import { SafeMarkdown } from '@/components/tutor/SafeMarkdown';
import { useLearningSession } from '@/features/conversation/use-learning-session';
import {
  BookOpen,
  Sparkles,
  Info,
  FileText,
  AlertCircle,
  X,
  Compass,
  WifiOff,
} from 'lucide-react';
import { useWorkspaceStore } from '@/lib/state/workspace-store';
import { getChunkExcerpt } from '@/features/ingestion/provenance';

export default function TutorPage() {
  const router = useRouter();

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
    handleContinue,
    handleTryAgain,
    handleRevise,
    handleReviewLater,
    handleSelectConcept,
  } = useLearningSession();

  const isOnline = useWorkspaceStore((state) => state.isOnline);

  // If no concept is selected or no session exists, show friendly empty state
  if (!concept && !isLoading) {
    return (
      <WorkspaceLayout>
        <Container size="workspace" className="py-6 sm:py-10">
          <EmptyState
            icon={Compass}
            title="No Concept Selected"
            description="Choose a concept from your study path to begin guided learning and active recall testing."
            action={
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button variant="primary" onClick={() => router.push('/app/path')}>
                  <Compass className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  <span>View Study Path</span>
                </Button>
                <Button variant="secondary" onClick={() => router.push('/app/materials')}>
                  <FileText className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  <span>Import Notes</span>
                </Button>
              </div>
            }
          />
        </Container>
      </WorkspaceLayout>
    );
  }

  // Find relevant source excerpt
  const primaryChunk = sourceChunks.length > 0 ? sourceChunks[0] : null;
  const sourceExcerpt =
    document && primaryChunk ? getChunkExcerpt(document, primaryChunk, 200) : null;

  const isTopicMode = session?.sourceMode === 'topic';

  return (
    <WorkspaceLayout>
      <Container size="workspace" className="py-4 sm:py-6 space-y-6 max-w-4xl">
        {/* Session Restored Notice */}
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
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Offline Notice with Exact Approved Copy (PRD §8, FR-15, Task 2) */}
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

        {/* Global Error Banner */}
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

        {/* Header with state & grounding */}
        <TutorHeader
          concept={concept}
          machineState={machineState}
          qualityGrade={lastEvaluation?.qualityGrade}
          sourceMode={session?.sourceMode}
          documentName={document?.filename}
        />

        {/* Topic Mode Warning Banner */}
        {isTopicMode && (
          <div
            role="note"
            className="flex items-start gap-2.5 p-3 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/5 text-xs text-[var(--text-secondary)]"
          >
            <Info className="h-4 w-4 text-[var(--warning)] shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <strong className="text-[var(--text-primary)]">Topic Study Mode: </strong>
              <span>
                This session is exploring general domain knowledge and is not grounded in your uploaded lecture notes.
              </span>
            </div>
          </div>
        )}

        {/* 1. Socratic Teaching & Explanation Step */}
        {concept && (
          <section aria-labelledby="concept-explanation-heading">
            <Card className="border-[var(--border-color)] bg-[var(--surface)]/90 shadow-sm">
              <CardHeader className="pb-3 border-b border-[var(--border-color)]/60">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
                    <CardTitle
                      id="concept-explanation-heading"
                      className="text-sm sm:text-base font-semibold text-[var(--text-primary)]"
                    >
                      Canonical Explanation & Mechanism
                    </CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <SafeMarkdown
                  content={concept.canonicalExplanation || concept.summary}
                  className="text-sm leading-relaxed text-[var(--text-primary)]"
                />

                {/* Key Terms */}
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

                {/* Source Provenance Excerpt */}
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

        {/* 2. Active Recall Question Card */}
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

        {/* Refresher Socratic Explanation (Revision Loop) */}
        {revisionExplanation && (
          <section aria-labelledby="revision-refresher-heading">
            <Card className="border-[var(--accent-orange)]/40 bg-[var(--surface)] shadow-md">
              <CardHeader className="pb-3 border-b border-[var(--border-color)]">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-[var(--accent-orange)]" aria-hidden="true" />
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

        {/* 3. Evaluation & Feedback Card */}
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

        {/* 4. Contextual Actions Navigation */}
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
      </Container>
    </WorkspaceLayout>
  );
}
