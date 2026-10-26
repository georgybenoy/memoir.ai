'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, AlertCircle, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SessionHeader } from '@/components/session/SessionHeader';
import { SessionSidebar, type PrerequisiteStatus } from '@/components/session/SessionSidebar';
import { StudySessionView } from '@/components/session/StudySessionView';
import { RecallSessionView } from '@/components/session/RecallSessionView';
import { RevisionSessionView } from '@/components/session/RevisionSessionView';
import { SessionCompletionView } from '@/components/workflow/session-completion-view';
import { useSessionController } from '@/features/modes/controller';
import { useLearningSession } from '@/features/conversation/use-learning-session';
import { getDueReviewQueue } from '@/features/spaced-repetition/queue';
import { getStorage } from '@/lib/db/bootstrap';
import { useWorkspaceStore } from '@/lib/state/workspace-store';
import { type LearningMode } from '@/features/workflow/types';
import { type MasteryStateRecord } from '@/types/domain';
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

  // 1. Session Controller
  const {
    mode: controllerMode,
    status: sessionStatus,
    currentConcept: controllerConcept,
    currentUnit,
    progress,
    summary,
    pauseSession,
    completeSession,
    abandonSession,
    advanceToNextConcept,
  } = useSessionController({
    materialId,
    sessionId,
    initialMode,
  });

  // 2. Conversation & Domain State Machine Hook (wired to controller's currentConcept)
  const {
    machineState,
    session,
    concept: hookConcept,
    document,
    sourceChunks,
    messages,
    currentQuestion,
    draftAnswer,
    selectedConfidence,
    lastEvaluation,
    isFallbackQuestion,
    revisionPlan,
    isTeachingLoading,
    teachingError,
    isLoading: isMachineLoading,
    error: machineError,
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
    handleSelectConcept,
    teachConceptTurn,
    cancelInFlight,
  } = useLearningSession({
    sessionId,
    conceptId: controllerConcept?.id,
  });

  // Move focus to step heading on mount for accessibility
  React.useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const activeConcept = hookConcept ?? controllerConcept;

  const effectiveMode: LearningMode =
    controllerMode ||
    initialMode ||
    (session?.machineState === 'WAITING_FOR_RECALL'
      ? 'recall'
      : session?.machineState === 'REVISION_DUE'
      ? 'revision'
      : 'study');

  // Load prerequisites and mastery context for the sidebar
  const [prereqStatuses, setPrereqStatuses] = React.useState<PrerequisiteStatus[]>([]);
  const [currentMastery, setCurrentMastery] = React.useState<MasteryStateRecord | null>(null);

  React.useEffect(() => {
    let mounted = true;
    async function loadConceptContext() {
      if (!activeConcept?.id) {
        setPrereqStatuses([]);
        setCurrentMastery(null);
        return;
      }
      try {
        const repos = getStorage();
        const [allDeps, masteryList] = await Promise.all([
          repos.dependencies.list(),
          repos.mastery.list(),
        ]);
        if (!mounted) return;

        const masteryMap = new Map(masteryList.map((m) => [m.conceptId, m]));
        const currentM = masteryMap.get(activeConcept.id) ?? null;
        setCurrentMastery(currentM);

        const deps = allDeps.filter(
          (d) => d.dependentConceptId === activeConcept.id && !d.removed,
        );
        const prereqList: PrerequisiteStatus[] = [];
        for (const d of deps) {
          const prereqConcept = await repos.concepts.get(d.prerequisiteId);
          if (prereqConcept) {
            const m = masteryMap.get(prereqConcept.id);
            const isMastered = m && m.level >= 3;
            prereqList.push({
              id: prereqConcept.id,
              title: prereqConcept.title,
              status: isMastered ? 'mastered' : 'available',
            });
          }
        }
        setPrereqStatuses(prereqList);
      } catch (err) {
        console.warn('Could not load concept sidebar context:', err);
      }
    }
    void loadConceptContext();
    return () => {
      mounted = false;
    };
  }, [activeConcept?.id]);

  // Due items state for Revision Mode
  const [dueCount, setDueCount] = React.useState<number>(0);
  const [nextDueText, setNextDueText] = React.useState<string | null>(null);
  const [nextScheduledReviewDate, setNextScheduledReviewDate] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    async function checkDueQueue() {
      try {
        const queue = await getDueReviewQueue();
        if (!mounted) return;
        setDueCount(queue.allItemsOrdered.length);
        if (queue.upcoming.length > 0) {
          setNextDueText(queue.upcoming[0].humanDueText);
        }
      } catch (err) {
        console.warn('Could not load due review queue:', err);
      }
    }
    if (effectiveMode === 'revision') {
      void checkDueQueue();
    }
    return () => {
      mounted = false;
    };
  }, [effectiveMode]);

  // When evaluation occurs in revision mode, fetch next scheduled review date
  React.useEffect(() => {
    let mounted = true;
    async function fetchNextDueDate() {
      if (effectiveMode !== 'revision' || !activeConcept?.id || !lastEvaluation) return;
      try {
        const repos = getStorage();
        const srRecord = await repos.spacedRepetition.get(activeConcept.id);
        if (mounted && srRecord?.nextDueAt) {
          const d = new Date(srRecord.nextDueAt);
          setNextScheduledReviewDate(d.toLocaleDateString(undefined, { dateStyle: 'medium' }));
        }
      } catch {
        // ignore
      }
    }
    void fetchNextDueDate();
    return () => {
      mounted = false;
    };
  }, [effectiveMode, activeConcept?.id, lastEvaluation]);

  // Advance concept / continue handler
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

  // Pause session and return to Step 3 (preserves draft & state)
  const handlePause = async () => {
    try {
      await pauseSession();
    } catch (err) {
      console.error('Error saving session on pause:', err);
    }
    router.push(`/learn/${materialId}/mode`);
  };

  // Exit session and return to Library (preserves draft & state)
  const handleExit = async () => {
    try {
      await abandonSession();
    } catch (err) {
      console.error('Error saving session on exit:', err);
    }
    router.push('/learn');
  };

  // Switch mode helpers
  const handleSwitchToStudy = () => {
    router.push(`/learn/${materialId}/mode`);
  };

  const handleSwitchToRecall = () => {
    router.push(`/learn/${materialId}/mode`);
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

  const combinedError = machineError || teachingError;

  return (
    <div className={cn('space-y-6 max-w-7xl mx-auto py-4 sm:py-6 px-3 sm:px-6 pb-24 sm:pb-32', className)}>
      {/* 1. Compact Session Header (Replaces old 'Active Learning Session' card) */}
      <SessionHeader
        materialName={document?.filename}
        unitTitle={currentUnit?.title}
        conceptTitle={activeConcept?.title}
        mode={effectiveMode}
        progressLabel={progress.stageLabel}
        onFinish={handleEndSession}
        onPause={handlePause}
        onExit={handleExit}
      />

      {/* Notifications: Restored Session & Offline Status */}
      <div className="space-y-3">
        {restoredNotice && (
          <div
            role="status"
            className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-[var(--accent-blue)]/40 bg-[var(--accent-blue)]/10 text-xs sm:text-sm text-[var(--text-primary)] shadow-xs"
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

        {!isOnline && (
          <aside
            role="status"
            aria-live="polite"
            className="flex items-center gap-2.5 p-3.5 rounded-xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 text-xs sm:text-sm text-[var(--text-primary)] shadow-xs"
          >
            <WifiOff className="h-4 w-4 text-[var(--warning)] shrink-0" aria-hidden="true" />
            <span className="font-medium">
              The tutor couldn’t connect right now. Your saved learning records remain fully available.
            </span>
          </aside>
        )}

        {combinedError && !isTeachingLoading && (
          <div
            role="alert"
            className="flex items-center gap-2.5 p-3.5 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 text-xs sm:text-sm text-[var(--danger)] shadow-xs"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="font-medium">
              {/connect|offline|network|fetch|disconnected|timeout/i.test(combinedError)
                ? 'The tutor couldn’t connect right now. Your saved learning records remain safe.'
                : combinedError}
            </span>
          </div>
        )}
      </div>

      {/* 2. Responsive Two-Column Layout (Desktop: 2/3 Main Column, 1/3 Sidebar) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Main Column (8/12 on desktop): Lesson & Dialogue */}
        <main
          className="lg:col-span-8 space-y-6 focus:outline-none"
          tabIndex={-1}
          ref={headingRef}
          aria-label="Active learning activity"
        >
          {effectiveMode === 'study' && (
            <StudySessionView
              concept={activeConcept}
              unit={currentUnit}
              messages={messages}
              isLoading={isTeachingLoading}
              error={teachingError}
              onSendMessage={(text) => teachConceptTurn(text, 'teach')}
              onExplainDifferently={(diffMode) => teachConceptTurn(undefined, diffMode)}
              onReadyForRecall={handleReadyForRecall}
              onContinue={handleContinue}
              onRetry={() => teachConceptTurn(undefined, 'teach')}
              onCancelRequest={cancelInFlight}
              onExit={handleExit}
              onReturnToStep2={() => router.push(`/learn/${materialId}/organise`)}
            />
          )}

          {effectiveMode === 'recall' && (
            <RecallSessionView
              concept={activeConcept}
              unit={currentUnit}
              machineState={machineState}
              currentQuestion={currentQuestion}
              draftAnswer={draftAnswer}
              selectedConfidence={selectedConfidence}
              lastEvaluation={lastEvaluation}
              isFallbackQuestion={isFallbackQuestion}
              revisionPlan={revisionPlan}
              isLoading={isMachineLoading}
              onRequestQuestion={handleRequestQuestion}
              onAnswerChange={setDraftAnswer}
              onConfidenceChange={setSelectedConfidence}
              onSubmitAnswer={handleSubmitAnswer}
              onContinue={handleContinue}
              onTryAgain={handleTryAgain}
              onRevise={handleRevise}
              onSelectConcept={handleSelectConcept}
            />
          )}

          {effectiveMode === 'revision' && (
            <RevisionSessionView
              concept={activeConcept}
              unit={currentUnit}
              machineState={machineState}
              currentQuestion={currentQuestion}
              draftAnswer={draftAnswer}
              selectedConfidence={selectedConfidence}
              lastEvaluation={lastEvaluation}
              isFallbackQuestion={isFallbackQuestion}
              revisionPlan={revisionPlan}
              isLoading={isMachineLoading}
              dueCount={dueCount}
              nextDueText={nextDueText}
              nextScheduledReviewDate={nextScheduledReviewDate}
              onRequestQuestion={handleRequestQuestion}
              onAnswerChange={setDraftAnswer}
              onConfidenceChange={setSelectedConfidence}
              onSubmitAnswer={handleSubmitAnswer}
              onContinue={handleContinue}
              onTryAgain={handleTryAgain}
              onRevise={handleRevise}
              onSelectConcept={handleSelectConcept}
              onSwitchToStudy={handleSwitchToStudy}
              onSwitchToRecall={handleSwitchToRecall}
              onExit={handleExit}
            />
          )}
        </main>

        {/* Secondary Column (4/12 on desktop): Concept Overview, Grounding, Prerequisites & Mastery */}
        <div className="lg:col-span-4 lg:sticky lg:top-6">
          <SessionSidebar
            concept={activeConcept}
            document={document}
            sourceChunks={sourceChunks}
            prerequisites={prereqStatuses}
            mastery={currentMastery}
            sourceMode={session?.sourceMode ?? 'document'}
          />
        </div>
      </div>
    </div>
  );
}
